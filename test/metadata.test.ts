import { describe, expect, test } from 'bun:test'
import { enrichSwapWithMetadata } from '../src/metadata/enricher.ts'
import { parseMetaplexMetadata } from '../src/metadata/metaplex.ts'
import { TokenMetadataResolver } from '../src/metadata/resolver.ts'
import { parseToken2022MetadataExtension } from '../src/metadata/token2022.ts'
import type { ParsedSwap } from '../src/types.ts'

// ── Helpers ──

/** Build a Borsh-style length-prefixed string (4-byte LE length + UTF-8 padded with nulls to `padTo`). */
function borshString(str: string, padTo: number): Uint8Array {
  const encoded = new TextEncoder().encode(str)
  const buf = new Uint8Array(4 + padTo)
  const view = new DataView(buf.buffer)
  view.setUint32(0, padTo, true)
  buf.set(encoded, 4)
  // Remaining bytes are already 0 (null padding)
  return buf
}

/** Build a mock Metaplex metadata account with the V1 layout. */
function buildMetaplexMetadataAccount(name: string, symbol: string, uri: string): Uint8Array {
  const nameBytes = borshString(name, 32)
  const symbolBytes = borshString(symbol, 10)
  const uriBytes = borshString(uri, 200)

  const data = new Uint8Array(1 + 32 + 32 + nameBytes.length + symbolBytes.length + uriBytes.length)
  data[0] = 4 // MetadataV1 discriminator
  // update_authority (32 bytes) + mint (32 bytes) are zero-filled

  let offset = 1 + 32 + 32
  data.set(nameBytes, offset)
  offset += nameBytes.length
  data.set(symbolBytes, offset)
  offset += symbolBytes.length
  data.set(uriBytes, offset)

  return data
}

/** Build a mock Token-2022 mint account with embedded metadata extension. */
function buildToken2022MintWithMetadata(name: string, symbol: string, uri: string, decimals: number): Uint8Array {
  // Build the metadata extension value: update_authority(32) + mint(32) + name + symbol + uri
  const nameEncoded = new TextEncoder().encode(name)
  const symbolEncoded = new TextEncoder().encode(symbol)
  const uriEncoded = new TextEncoder().encode(uri)

  const metaValueSize = 32 + 32 + (4 + nameEncoded.length) + (4 + symbolEncoded.length) + (4 + uriEncoded.length)
  const metaValue = new Uint8Array(metaValueSize)
  const metaView = new DataView(metaValue.buffer)
  let mOffset = 32 + 32 // skip update_authority + mint

  metaView.setUint32(mOffset, nameEncoded.length, true)
  metaValue.set(nameEncoded, mOffset + 4)
  mOffset += 4 + nameEncoded.length

  metaView.setUint32(mOffset, symbolEncoded.length, true)
  metaValue.set(symbolEncoded, mOffset + 4)
  mOffset += 4 + symbolEncoded.length

  metaView.setUint32(mOffset, uriEncoded.length, true)
  metaValue.set(uriEncoded, mOffset + 4)

  // Build full mint account: base(82) + account_type(1) + TLV(4 + metaValueSize)
  const totalSize = 82 + 1 + 4 + metaValueSize
  const data = new Uint8Array(totalSize)
  const view = new DataView(data.buffer)

  // Set decimals at offset 44
  data[44] = decimals

  // Account type byte at offset 82
  data[82] = 2 // Mint account type

  // TLV entry at offset 83
  view.setUint16(83, 19, true) // metadata extension type
  view.setUint16(85, metaValueSize, true) // length
  data.set(metaValue, 87)

  return data
}

function mockSwap(overrides?: Partial<ParsedSwap>): ParsedSwap {
  return {
    signature: 'test-sig',
    slot: 100,
    user: 'user1',
    feePayer: 'feePayer1',
    protocols: [],
    inputMint: 'So11111111111111111111111111111111111111112',
    inputRaw: '1000000',
    inputDecimals: 9,
    inputAmountDecimal: '0.001',
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    outputRaw: '1000000',
    outputDecimals: 6,
    outputAmountDecimal: '1.0',
    confidence: 'high',
    warnings: [],
    fee: 5000,
    ...overrides,
  }
}

function rpcResponse(value: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { value } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

// ── Tests ──

describe('parseMetaplexMetadata', () => {
  test('parses valid Metaplex metadata v1 account data', () => {
    const data = buildMetaplexMetadataAccount('Solana', 'SOL', 'https://example.com/sol.json')
    const result = parseMetaplexMetadata(data)

    expect(result).not.toBeNull()
    expect(result!.name).toBe('Solana')
    expect(result!.symbol).toBe('SOL')
    expect(result!.uri).toBe('https://example.com/sol.json')
  })

  test('returns null for wrong discriminator', () => {
    const data = buildMetaplexMetadataAccount('Solana', 'SOL', 'https://example.com')
    data[0] = 0 // Wrong discriminator
    expect(parseMetaplexMetadata(data)).toBeNull()
  })

  test('returns null for truncated data', () => {
    expect(parseMetaplexMetadata(new Uint8Array(10))).toBeNull()
  })

  test('trims null-padded strings', () => {
    const data = buildMetaplexMetadataAccount('BONK', 'BONK', '')
    const result = parseMetaplexMetadata(data)

    expect(result).not.toBeNull()
    expect(result!.name).toBe('BONK')
    expect(result!.symbol).toBe('BONK')
    expect(result!.uri).toBe('')
  })
})

describe('parseToken2022MetadataExtension', () => {
  test('parses valid Token-2022 mint with metadata extension', () => {
    const data = buildToken2022MintWithMetadata('USD Coin', 'USDC', 'https://example.com/usdc.json', 6)
    const result = parseToken2022MetadataExtension(data)

    expect(result).not.toBeNull()
    expect(result!.name).toBe('USD Coin')
    expect(result!.symbol).toBe('USDC')
    expect(result!.uri).toBe('https://example.com/usdc.json')
    expect(result!.decimals).toBe(6)
  })

  test('reads decimals from offset 44', () => {
    const data = buildToken2022MintWithMetadata('Test', 'TST', '', 9)
    const result = parseToken2022MetadataExtension(data)

    expect(result).not.toBeNull()
    expect(result!.decimals).toBe(9)
  })

  test('returns null for data too small', () => {
    expect(parseToken2022MetadataExtension(new Uint8Array(50))).toBeNull()
  })

  test('returns null for mint without metadata extension', () => {
    // Base mint data (82 bytes) + account type byte, but no valid TLV metadata extension
    const data = new Uint8Array(83 + 4)
    data[44] = 6 // decimals
    data[82] = 2 // account type
    // TLV with type=0, length=0 (padding)
    expect(parseToken2022MetadataExtension(data)).toBeNull()
  })
})

describe('enrichSwapWithMetadata', () => {
  test('enriches swap with metadata from function resolver', async () => {
    const swap = mockSwap()
    const resolver = async (mint: string) => {
      if (mint === swap.inputMint) return { symbol: 'SOL', name: 'Solana', decimals: 9 }
      if (mint === swap.outputMint) return { symbol: 'USDC', name: 'USD Coin', decimals: 6 }
      return null
    }

    const enriched = await enrichSwapWithMetadata(swap, resolver)

    expect(enriched.inputTokenMetadata).toEqual({ symbol: 'SOL', name: 'Solana', decimals: 9 })
    expect(enriched.outputTokenMetadata).toEqual({ symbol: 'USDC', name: 'USD Coin', decimals: 6 })
    expect(enriched.signature).toBe('test-sig')
  })

  test('sets undefined for failed resolution', async () => {
    const swap = mockSwap()
    const resolver = async (_mint: string) => {
      throw new Error('RPC error')
    }

    const enriched = await enrichSwapWithMetadata(swap, resolver)

    expect(enriched.inputTokenMetadata).toBeUndefined()
    expect(enriched.outputTokenMetadata).toBeUndefined()
  })

  test('handles partial resolution', async () => {
    const swap = mockSwap()
    const resolver = async (mint: string) => {
      if (mint === swap.inputMint) return { symbol: 'SOL', name: 'Solana', decimals: 9 }
      return null
    }

    const enriched = await enrichSwapWithMetadata(swap, resolver)

    expect(enriched.inputTokenMetadata).toEqual({ symbol: 'SOL', name: 'Solana', decimals: 9 })
    expect(enriched.outputTokenMetadata).toBeUndefined()
  })
})

describe('TokenMetadataResolver', () => {
  test('resolves metadata via Metaplex PDA for SPL token mint', async () => {
    const mint = 'So11111111111111111111111111111111111111112'
    const metaplexData = buildMetaplexMetadataAccount('Wrapped SOL', 'SOL', 'https://example.com/wsol.json')

    // Build a base SPL token mint account (82 bytes)
    const mintAccountData = new Uint8Array(82)
    mintAccountData[44] = 9 // decimals

    let callCount = 0
    const fetcher = async (_url: string, init?: RequestInit) => {
      callCount++
      const body = JSON.parse(init?.body as string)
      const requestedAccount = body.params[0]

      if (requestedAccount === mint) {
        return rpcResponse({
          owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          data: [Buffer.from(mintAccountData).toString('base64'), 'base64'],
        })
      }

      // Metaplex PDA
      return rpcResponse({
        owner: 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
        data: [Buffer.from(metaplexData).toString('base64'), 'base64'],
      })
    }

    const resolver = new TokenMetadataResolver({
      rpcUrl: 'https://example-rpc.local',
      fetcher,
      retries: 0,
    })

    const result = await resolver.resolve(mint)

    expect(result).not.toBeNull()
    expect(result!.symbol).toBe('SOL')
    expect(result!.name).toBe('Wrapped SOL')
    expect(result!.decimals).toBe(9)
    expect(result!.uri).toBe('https://example.com/wsol.json')
    expect(callCount).toBe(2) // mint + metaplex PDA
  })

  test('resolves Token-2022 metadata from extension', async () => {
    const mint = 'Token2022Mint1111111111111111111111111111111'
    const mintData = buildToken2022MintWithMetadata('PYUSD', 'PYUSD', 'https://example.com/pyusd.json', 6)

    const fetcher = async () => {
      return rpcResponse({
        owner: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
        data: [Buffer.from(mintData).toString('base64'), 'base64'],
      })
    }

    const resolver = new TokenMetadataResolver({
      rpcUrl: 'https://example-rpc.local',
      fetcher,
      retries: 0,
    })

    const result = await resolver.resolve(mint)

    expect(result).not.toBeNull()
    expect(result!.symbol).toBe('PYUSD')
    expect(result!.name).toBe('PYUSD')
    expect(result!.decimals).toBe(6)
  })

  test('cache hit avoids additional RPC calls', async () => {
    const mint = 'CacheMint1111111111111111111111111111111111'
    const mintData = buildToken2022MintWithMetadata('Cached', 'CACHE', '', 8)

    let callCount = 0
    const fetcher = async () => {
      callCount++
      return rpcResponse({
        owner: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
        data: [Buffer.from(mintData).toString('base64'), 'base64'],
      })
    }

    const resolver = new TokenMetadataResolver({
      rpcUrl: 'https://example-rpc.local',
      fetcher,
      retries: 0,
    })

    const result1 = await resolver.resolve(mint)
    const result2 = await resolver.resolve(mint)

    expect(result1).toEqual(result2)
    expect(callCount).toBe(1) // Second call used cache
  })

  test('returns null for non-existent mint account', async () => {
    const fetcher = async () => rpcResponse(null)

    const resolver = new TokenMetadataResolver({
      rpcUrl: 'https://example-rpc.local',
      fetcher,
      retries: 0,
    })

    const result = await resolver.resolve('NonExistent11111111111111111111111111111111')
    expect(result).toBeNull()
  })

  test('graceful error handling in enrichSwapWithMetadata', async () => {
    const fetcher = async () => {
      throw new Error('Network error')
    }

    const resolver = new TokenMetadataResolver({
      rpcUrl: 'https://example-rpc.local',
      fetcher,
      retries: 0,
    })

    const swap = mockSwap()
    const enriched = await enrichSwapWithMetadata(swap, resolver)

    // Errors should result in undefined metadata, not thrown exceptions
    expect(enriched.inputTokenMetadata).toBeUndefined()
    expect(enriched.outputTokenMetadata).toBeUndefined()
    expect(enriched.signature).toBe('test-sig')
  })
})
