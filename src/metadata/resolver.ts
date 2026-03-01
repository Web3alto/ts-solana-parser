import { z } from 'zod'
import { decodeBase64 } from '../idl/codec.ts'
import type { AccountInfoResult } from '../rpc.ts'
import { retryWithBackoff, rpcCall } from '../rpc.ts'
import { validateWithZod } from '../schemas.ts'
import { deriveMetaplexMetadataPda, parseMetaplexMetadata } from './metaplex.ts'
import { parseToken2022MetadataExtension, TOKEN_2022_PROGRAM } from './token2022.ts'
import type { MetadataResolverConfig, TokenMetadata } from './types.ts'

const SPL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

interface MetadataCacheEntry {
  fetchedAt: number
  metadata: TokenMetadata | null
}

const MetadataResolverConfigSchema = z.object({
  rpcUrl: z.string().url(),
  cacheTtlMs: z.number().positive().optional(),
  maxCacheEntries: z.number().int().positive().optional(),
  commitment: z.enum(['processed', 'confirmed', 'finalized']).optional(),
  requestTimeoutMs: z.number().positive().optional(),
  retries: z.number().int().nonnegative().optional(),
  retryBaseMs: z.number().positive().optional(),
})

export class TokenMetadataResolver {
  private readonly rpcUrl: string
  private readonly cacheTtlMs: number
  private readonly maxCacheEntries: number
  private readonly commitment: 'processed' | 'confirmed' | 'finalized'
  private readonly fetcher: (input: string, init?: RequestInit) => Promise<Response>
  private readonly requestTimeoutMs: number
  private readonly retries: number
  private readonly retryBaseMs: number

  private readonly cache = new Map<string, MetadataCacheEntry>()
  private readonly inflight = new Map<string, Promise<TokenMetadata | null>>()

  constructor(config: MetadataResolverConfig) {
    validateWithZod(MetadataResolverConfigSchema, config)
    this.rpcUrl = config.rpcUrl
    this.cacheTtlMs = config.cacheTtlMs ?? 300_000
    this.maxCacheEntries = config.maxCacheEntries ?? 10_000
    this.commitment = config.commitment ?? 'confirmed'
    this.fetcher = config.fetcher ?? fetch
    this.requestTimeoutMs = config.requestTimeoutMs ?? 5_000
    this.retries = config.retries ?? 2
    this.retryBaseMs = config.retryBaseMs ?? 300
  }

  private isFresh(fetchedAt: number): boolean {
    return Date.now() - fetchedAt <= this.cacheTtlMs
  }

  private setCache(mint: string, entry: MetadataCacheEntry): void {
    if (this.cache.has(mint)) {
      this.cache.delete(mint)
    }
    this.cache.set(mint, entry)

    while (this.cache.size > this.maxCacheEntries) {
      const oldest = this.cache.keys().next().value
      if (!oldest) break
      this.cache.delete(oldest)
    }
  }

  private async fetchAccountInfo(account: string): Promise<{ owner: string; data: Uint8Array } | null> {
    const result = await rpcCall<AccountInfoResult>(
      this.fetcher,
      this.rpcUrl,
      this.requestTimeoutMs,
      'getAccountInfo',
      [account, { encoding: 'base64', commitment: this.commitment }],
    )

    if (!result.value) return null

    const rawData = result.value.data
    if (!Array.isArray(rawData) || rawData[1] !== 'base64') {
      throw new Error('Invalid account encoding')
    }

    return { owner: result.value.owner, data: decodeBase64(rawData[0]) }
  }

  private async fetchMetadataOnce(mint: string): Promise<TokenMetadata | null> {
    // Start PDA derivation eagerly (it only needs the mint string, not account data).
    // Wrapped in catch so an invalid mint address doesn't prevent Token-2022 resolution.
    const pdaPromise = deriveMetaplexMetadataPda(mint).catch(() => null)

    const mintAccount = await this.fetchAccountInfo(mint)
    if (!mintAccount) return null

    // Decimals always at offset 44 in mint layout
    if (mintAccount.data.byteLength < 45) return null
    const decimals = mintAccount.data[44]!

    // If Token-2022, try parsing metadata extension from same account
    if (mintAccount.owner === TOKEN_2022_PROGRAM) {
      const t22Meta = parseToken2022MetadataExtension(mintAccount.data)
      if (t22Meta) {
        return {
          symbol: t22Meta.symbol,
          name: t22Meta.name,
          decimals: t22Meta.decimals,
          uri: t22Meta.uri || undefined,
        }
      }
    }

    // Fall back to Metaplex metadata PDA
    if (mintAccount.owner === SPL_TOKEN_PROGRAM || mintAccount.owner === TOKEN_2022_PROGRAM) {
      const metaplexPda = await pdaPromise
      if (!metaplexPda) return null
      const metaplexAccount = await this.fetchAccountInfo(metaplexPda)
      if (metaplexAccount) {
        const parsed = parseMetaplexMetadata(metaplexAccount.data)
        if (parsed) {
          return {
            symbol: parsed.symbol,
            name: parsed.name,
            decimals,
            uri: parsed.uri || undefined,
          }
        }
      }
    }

    return null
  }

  async resolve(mint: string): Promise<TokenMetadata | null> {
    // Check cache
    const cached = this.cache.get(mint)
    if (cached && this.isFresh(cached.fetchedAt)) {
      return cached.metadata
    }

    // Check inflight dedup
    const existing = this.inflight.get(mint)
    if (existing) return existing

    const task = retryWithBackoff(() => this.fetchMetadataOnce(mint), this.retries, this.retryBaseMs)
      .then((metadata) => {
        this.setCache(mint, { fetchedAt: Date.now(), metadata })
        return metadata
      })
      .finally(() => {
        this.inflight.delete(mint)
      })

    this.inflight.set(mint, task)
    return task
  }
}
