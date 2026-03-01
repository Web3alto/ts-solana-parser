import { getAddressLookupTableDecoder } from '@solana-program/address-lookup-table'
import { z } from 'zod'
import { decodeBase64 } from './idl/codec.ts'
import { validateWithZod } from './schemas.ts'
import type { AddressLookupResolution, AddressTableLookup, ParserOptions } from './types.ts'
import { sleep } from './util.ts'

const ADDRESS_LOOKUP_TABLE_PROGRAM = 'AddressLookupTab1e1111111111111111111111111'
const altDecoder = getAddressLookupTableDecoder()

interface RpcResponse<T> {
  result: T
  error?: { code: number; message: string }
}

interface AccountInfoResult {
  value: {
    owner: string
    data: [string, string] | string
  } | null
}

interface AddressLookupCacheEntry {
  fetchedAt: number
  addresses: string[]
}

/**
 * Configuration for the RPC-backed address lookup resolver.
 * Defaults: cacheTtlMs=300000, maxCacheEntries=20000, commitment="confirmed",
 * requestTimeoutMs=5000, retries=2, retryBaseMs=300.
 */
export interface ResolverConfig {
  rpcUrl: string
  cacheTtlMs?: number | undefined
  maxCacheEntries?: number | undefined
  commitment?: 'processed' | 'confirmed' | 'finalized' | undefined
  fetcher?: ((input: string, init?: RequestInit) => Promise<Response>) | undefined
  requestTimeoutMs?: number | undefined
  retries?: number | undefined
  retryBaseMs?: number | undefined
  maxConcurrency?: number | undefined
  onError?: ((ctx: { tableAccount?: string | undefined; error: unknown }) => void) | undefined
}

/** Parser options with ALT warm-up capability for batch processing. */
export interface RpcBackedParserOptions extends ParserOptions {
  warmAddressLookupTables: (tableAccounts: string[]) => Promise<void>
}

function parseLookupTableAddresses(data: Uint8Array): string[] {
  const decoded = altDecoder.decode(data)
  return Array.from(decoded.addresses)
}

class RpcAddressLookupResolver {
  private readonly rpcUrl: string
  private readonly cacheTtlMs: number
  private readonly maxCacheEntries: number
  private readonly commitment: 'processed' | 'confirmed' | 'finalized'
  private readonly fetcher: (input: string, init?: RequestInit) => Promise<Response>
  private readonly requestTimeoutMs: number
  private readonly retries: number
  private readonly retryBaseMs: number
  private readonly maxConcurrency: number
  private readonly onError?: ((ctx: { tableAccount?: string | undefined; error: unknown }) => void) | undefined

  private readonly lookupCache = new Map<string, AddressLookupCacheEntry>()
  private readonly lookupInflight = new Map<string, Promise<AddressLookupCacheEntry>>()

  constructor(config: ResolverConfig) {
    this.rpcUrl = config.rpcUrl
    this.cacheTtlMs = config.cacheTtlMs ?? 5 * 60_000
    this.maxCacheEntries = config.maxCacheEntries ?? 20_000
    this.commitment = config.commitment ?? 'confirmed'
    this.fetcher = config.fetcher ?? fetch
    this.requestTimeoutMs = config.requestTimeoutMs ?? 5_000
    this.retries = config.retries ?? 2
    this.retryBaseMs = config.retryBaseMs ?? 300
    this.maxConcurrency = config.maxConcurrency ?? 10
    this.onError = config.onError
  }

  private isFresh(fetchedAt: number): boolean {
    return Date.now() - fetchedAt <= this.cacheTtlMs
  }

  private setCache(tableAccount: string, entry: AddressLookupCacheEntry): void {
    if (this.lookupCache.has(tableAccount)) {
      this.lookupCache.delete(tableAccount)
    }
    this.lookupCache.set(tableAccount, entry)

    while (this.lookupCache.size > this.maxCacheEntries) {
      const oldest = this.lookupCache.keys().next().value
      if (!oldest) break
      this.lookupCache.delete(oldest)
    }
  }

  private async rpcCall<T>(method: string, params: unknown[]): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs)

    try {
      const res = await this.fetcher(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`)
      }

      const json = (await res.json()) as RpcResponse<T>
      if (json.error) {
        throw new Error(`RPC error (${json.error.code}): ${json.error.message}`)
      }
      return json.result
    } finally {
      clearTimeout(timeout)
    }
  }

  private async fetchLookupTable(tableAccount: string): Promise<AddressLookupCacheEntry> {
    let attempt = 0
    let lastError: unknown = null

    while (attempt <= this.retries) {
      try {
        const result = await this.rpcCall<AccountInfoResult>('getAccountInfo', [
          tableAccount,
          { encoding: 'base64', commitment: this.commitment },
        ])

        if (!result.value) {
          return { fetchedAt: Date.now(), addresses: [] }
        }

        if (result.value.owner !== ADDRESS_LOOKUP_TABLE_PROGRAM) {
          throw new Error(`ALT owner mismatch: ${result.value.owner}`)
        }

        const rawData = result.value.data
        if (!Array.isArray(rawData) || rawData[1] !== 'base64') {
          throw new Error('Invalid ALT account encoding')
        }

        const bytes = decodeBase64(rawData[0])
        const addresses = parseLookupTableAddresses(bytes)
        return { fetchedAt: Date.now(), addresses }
      } catch (error) {
        lastError = error
        if (attempt >= this.retries) break
        const backoffMs = Math.round(this.retryBaseMs * 2 ** attempt * (0.8 + Math.random() * 0.4))
        await sleep(backoffMs)
      }
      attempt++
    }

    throw lastError
  }

  private queueLookupFetch(tableAccount: string): Promise<AddressLookupCacheEntry> {
    const existing = this.lookupInflight.get(tableAccount)
    if (existing) return existing

    const task = this.fetchLookupTable(tableAccount)
      .then((entry) => {
        this.setCache(tableAccount, entry)
        return entry
      })
      .catch((error) => {
        this.onError?.({ tableAccount, error })
        const cached = this.lookupCache.get(tableAccount)
        if (cached) {
          // Keep stale cache on transient failure.
          return cached
        }
        throw error
      })
      .finally(() => {
        this.lookupInflight.delete(tableAccount)
      })

    this.lookupInflight.set(tableAccount, task)
    return task
  }

  async warmAddressLookupTables(tableAccounts: string[]): Promise<void> {
    const unique = [...new Set(tableAccounts)]
    const toFetch: string[] = []

    for (const tableAccount of unique) {
      const cached = this.lookupCache.get(tableAccount)
      if (cached && this.isFresh(cached.fetchedAt)) continue
      toFetch.push(tableAccount)
    }

    if (toFetch.length === 0) return

    // Process in chunks to avoid overwhelming RPC nodes
    for (let i = 0; i < toFetch.length; i += this.maxConcurrency) {
      const chunk = toFetch.slice(i, i + this.maxConcurrency)
      await Promise.all(chunk.map((t) => this.queueLookupFetch(t)))
    }
  }

  resolveAddressTableLookups(lookups: AddressTableLookup[]): AddressLookupResolution | null {
    const writable: string[] = []
    const readonly: string[] = []

    for (const lookup of lookups) {
      const cached = this.lookupCache.get(lookup.accountKey)
      if (!cached) {
        void this.queueLookupFetch(lookup.accountKey).catch(() => {})
        return null
      }

      if (!this.isFresh(cached.fetchedAt)) {
        // Use stale values for continuity while refreshing in background.
        void this.queueLookupFetch(lookup.accountKey).catch(() => {})
      }

      for (const idx of lookup.writableIndexes) {
        const key = cached.addresses[idx]
        if (!key) {
          void this.queueLookupFetch(lookup.accountKey).catch(() => {})
          return null
        }
        writable.push(key)
      }

      for (const idx of lookup.readonlyIndexes) {
        const key = cached.addresses[idx]
        if (!key) {
          void this.queueLookupFetch(lookup.accountKey).catch(() => {})
          return null
        }
        readonly.push(key)
      }
    }

    return { writable, readonly }
  }
}

const ResolverConfigSchema = z.object({
  rpcUrl: z.string().url(),
  cacheTtlMs: z.number().positive().optional(),
  maxCacheEntries: z.number().int().positive().optional(),
  commitment: z.enum(['processed', 'confirmed', 'finalized']).optional(),
  requestTimeoutMs: z.number().positive().optional(),
  retries: z.number().int().nonnegative().optional(),
  retryBaseMs: z.number().positive().optional(),
  maxConcurrency: z.number().int().positive().optional(),
})

/** Create {@link ParserOptions} with RPC-backed address lookup table resolution. Validates config with Zod. */
export function createRpcBackedParserOptions(config: ResolverConfig): RpcBackedParserOptions {
  validateWithZod(ResolverConfigSchema, config)
  const resolver = new RpcAddressLookupResolver(config)
  return {
    resolveAddressTableLookups: resolver.resolveAddressTableLookups.bind(resolver),
    warmAddressLookupTables: resolver.warmAddressLookupTables.bind(resolver),
    onResolverError: config.onError,
  }
}
