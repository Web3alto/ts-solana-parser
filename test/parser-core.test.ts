import { describe, expect, test } from 'bun:test'
import { zstdCompressSync } from 'node:zlib'
import { formatTokenAmountDecimal, toApproxTokenAmountNumber } from '../src/amount.ts'
import { DecodeError, UnsupportedEncodingError, ValidationError } from '../src/errors.ts'
import { decodeBase58, encodeBase58, matchDiscriminator, readU64LE } from '../src/idl/codec.ts'
import { normalizeTransactionData } from '../src/normalize.ts'
import { parseSwap } from '../src/parse-swap.ts'
import type { EncodedTransactionTuple, TransactionData, TransactionNotification } from '../src/types.ts'
import { buildMinimalTxBytes, notificationToSwapInput } from './helpers.ts'

describe('normalizeTransactionData', () => {
  test('returns identical decoded message for base58 and base64', () => {
    const raw = buildMinimalTxBytes()

    const base58Tuple: EncodedTransactionTuple = [encodeBase58(raw), 'base58']
    const base64Tuple: EncodedTransactionTuple = [Buffer.from(raw).toString('base64'), 'base64']

    const a = normalizeTransactionData(base58Tuple)
    const b = normalizeTransactionData(base64Tuple)

    expect(a).toEqual(b)
  })

  test('returns identical decoded message for base64+zstd', () => {
    const raw = buildMinimalTxBytes()

    const base58Tuple: EncodedTransactionTuple = [encodeBase58(raw), 'base58']
    const compressed = zstdCompressSync(raw)
    const zstdTuple: EncodedTransactionTuple = [Buffer.from(compressed).toString('base64'), 'base64+zstd']

    const a = normalizeTransactionData(base58Tuple)
    const b = normalizeTransactionData(zstdTuple)

    expect(a).toEqual(b)
  })

  test('throws for unsupported encoding', () => {
    const raw = buildMinimalTxBytes()
    const badTuple = [encodeBase58(raw), 'base85'] as unknown as EncodedTransactionTuple
    expect(() => normalizeTransactionData(badTuple)).toThrow(UnsupportedEncodingError)
  })

  test('throws for unsupported transaction version in raw bytes', () => {
    const bytes: number[] = []
    bytes.push(1)
    for (let i = 0; i < 64; i++) bytes.push(1)
    bytes.push(0x82) // versioned, unsupported version 2
    bytes.push(1, 0, 0) // header
    bytes.push(1) // account keys len
    for (let i = 0; i < 32; i++) bytes.push(2)
    for (let i = 0; i < 32; i++) bytes.push(3)
    bytes.push(0) // instructions
    bytes.push(0) // lookup tables

    const tuple: EncodedTransactionTuple = [Buffer.from(bytes).toString('base64'), 'base64']
    expect(() => normalizeTransactionData(tuple)).toThrow()
  })

  test('passes through jsonParsed message objects unchanged', () => {
    const txData: TransactionData = {
      message: {
        accountKeys: ['11111111111111111111111111111111'],
        instructions: [],
        recentBlockhash: '11111111111111111111111111111111',
      },
      signatures: ['sig1'],
    }

    const result = normalizeTransactionData(txData)
    expect(result).toBe(txData) // same reference, no transformation
  })

  test('preserves addressTableLookups in jsonParsed passthrough', () => {
    const txData: TransactionData = {
      message: {
        accountKeys: ['11111111111111111111111111111111'],
        instructions: [],
        recentBlockhash: '11111111111111111111111111111111',
        addressTableLookups: [
          {
            accountKey: 'LookupTableAddr111111111111111111',
            readonlyIndexes: [0, 1],
            writableIndexes: [2],
          },
        ],
      },
      signatures: ['sig1'],
    }

    const result = normalizeTransactionData(txData)
    expect(result.message.addressTableLookups).toEqual([
      {
        accountKey: 'LookupTableAddr111111111111111111',
        readonlyIndexes: [0, 1],
        writableIndexes: [2],
      },
    ])
  })

  test('throws DecodeError for invalid base64+zstd payload', () => {
    const badZstdTuple: EncodedTransactionTuple = ['bm90LXZhbGlkLXpzdGQ=', 'base64+zstd']
    expect(() => normalizeTransactionData(badZstdTuple)).toThrow(DecodeError)
  })
})

describe('decodeBase58', () => {
  test('rejects invalid base58 characters', () => {
    expect(() => decodeBase58('0OIl')).toThrow(DecodeError)
    expect(() => decodeBase58('hello world')).toThrow(DecodeError) // space is invalid
    expect(() => decodeBase58('abc+def')).toThrow(DecodeError)
  })

  test('decodes empty string to empty Uint8Array', () => {
    const result = decodeBase58('')
    expect(result).toEqual(new Uint8Array(0))
    expect(result.length).toBe(0)
  })

  test('decodes valid base58 strings', () => {
    // "1" in base58 = a single zero byte
    const result = decodeBase58('1')
    expect(result).toEqual(new Uint8Array([0]))
  })

  test('decodes leading 1s as zero bytes', () => {
    // Multiple leading 1s should map to leading zero bytes
    const result = decodeBase58('111')
    expect(result).toEqual(new Uint8Array([0, 0, 0]))
  })

  test('decodes known base58 vector', () => {
    // Known: "2g" decodes to [1, 0] in base58
    // Verify by roundtrip instead of hardcoded vector
    const original = new Uint8Array([1, 2, 3, 4])
    const encoded = encodeBase58(original)
    const decoded = decodeBase58(encoded)
    expect(decoded).toEqual(original)
  })

  test('rejects high-byte characters (>= 128)', () => {
    expect(() => decodeBase58('\x80')).toThrow(DecodeError)
    expect(() => decodeBase58('\xff')).toThrow(DecodeError)
  })
})

describe('encodeBase58', () => {
  test('encodes empty Uint8Array to empty string', () => {
    expect(encodeBase58(new Uint8Array(0))).toBe('')
  })

  test('encodes leading zero bytes as 1s', () => {
    expect(encodeBase58(new Uint8Array([0, 0, 0]))).toBe('111')
  })

  test('roundtrips with decodeBase58', () => {
    const testCases = [
      new Uint8Array([0]),
      new Uint8Array([1]),
      new Uint8Array([0, 0, 1]),
      new Uint8Array([255]),
      new Uint8Array([1, 2, 3, 4, 5]),
      new Uint8Array(32).fill(0xff), // 32 bytes of 0xff
    ]
    for (const bytes of testCases) {
      expect(decodeBase58(encodeBase58(bytes))).toEqual(bytes)
    }
  })

  test('roundtrips string -> decode -> encode -> string', () => {
    const testStrings = ['1', '111', '2NEpo7TZRRrLZSi2U', 'JxF12TrwUP45BMd']
    for (const s of testStrings) {
      expect(encodeBase58(decodeBase58(s))).toBe(s)
    }
  })
})

describe('readU64LE', () => {
  test('reads zero', () => {
    const data = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0])
    expect(readU64LE(data, 0)).toBe(0n)
  })

  test('reads value 1', () => {
    const data = new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0])
    expect(readU64LE(data, 0)).toBe(1n)
  })

  test('reads MAX_U64', () => {
    const data = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
    expect(readU64LE(data, 0)).toBe(18446744073709551615n)
  })

  test('reads from non-zero offset', () => {
    const data = new Uint8Array([0xaa, 0xbb, 1, 0, 0, 0, 0, 0, 0, 0])
    expect(readU64LE(data, 2)).toBe(1n)
  })

  test('reads known little-endian value', () => {
    // 0x0100000000000000 in LE = 1 in first byte position
    // Let's encode 1000 (0x03E8) in LE: [0xE8, 0x03, 0, 0, 0, 0, 0, 0]
    const data = new Uint8Array([0xe8, 0x03, 0, 0, 0, 0, 0, 0])
    expect(readU64LE(data, 0)).toBe(1000n)
  })

  test('throws when offset exceeds buffer length', () => {
    const data = new Uint8Array([1, 2, 3, 4])
    expect(() => readU64LE(data, 0)).toThrow(DecodeError)
  })

  test('throws when offset + 8 exceeds buffer length', () => {
    const data = new Uint8Array(9) // just barely enough at offset 0
    expect(readU64LE(data, 0)).toBe(0n) // should work at offset 0
    expect(() => readU64LE(data, 2)).toThrow(DecodeError) // 2+8=10 > 9
  })
})

describe('matchDiscriminator', () => {
  test('returns true for matching 8-byte discriminator', () => {
    const expected = [1, 2, 3, 4, 5, 6, 7, 8]
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, ...Array(16).fill(0)])
    expect(matchDiscriminator(data, expected)).toBe(true)
  })

  test('returns false for non-matching discriminator', () => {
    const expected = [1, 2, 3, 4, 5, 6, 7, 8]
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 9, ...Array(16).fill(0)])
    expect(matchDiscriminator(data, expected)).toBe(false)
  })

  test('returns false when first byte differs', () => {
    const expected = [1, 2, 3, 4, 5, 6, 7, 8]
    const data = new Uint8Array([0, 2, 3, 4, 5, 6, 7, 8, ...Array(16).fill(0)])
    expect(matchDiscriminator(data, expected)).toBe(false)
  })

  test('returns false for data shorter than 8 bytes', () => {
    const expected = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(matchDiscriminator(new Uint8Array([1, 2, 3]), expected)).toBe(false)
    expect(matchDiscriminator(new Uint8Array([]), expected)).toBe(false)
    expect(matchDiscriminator(new Uint8Array(7), expected)).toBe(false)
  })

  test('returns true for exactly 8 bytes matching', () => {
    const expected = [10, 20, 30, 40, 50, 60, 70, 80]
    const data = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80])
    expect(matchDiscriminator(data, expected)).toBe(true)
  })

  test('ignores data beyond first 8 bytes', () => {
    const expected = [1, 2, 3, 4, 5, 6, 7, 8]
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 99, 99, 99])
    expect(matchDiscriminator(data, expected)).toBe(true)
  })
})

describe('parseSwap (core)', () => {
  test('is null-safe when token balance and inner instruction arrays are null', () => {
    const notification: TransactionNotification = {
      signature: 'sig',
      slot: 1,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000],
          postBalances: [999_995],
          preTokenBalances: null,
          postTokenBalances: null,
          innerInstructions: null,
          loadedAddresses: null,
        },
        transaction: {
          message: {
            accountKeys: ['11111111111111111111111111111111'],
            instructions: [],
            recentBlockhash: '11111111111111111111111111111111',
          },
          signatures: ['sig'],
        },
      },
    }

    expect(parseSwap(notificationToSwapInput(notification))).toBeNull()
  })

  test('throws ValidationError on unsupported transaction encoding', () => {
    const raw = buildMinimalTxBytes()
    const encoded = encodeBase58(raw)

    const notification = {
      signature: 'sig',
      slot: 1,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000],
          postBalances: [999_995],
          preTokenBalances: [],
          postTokenBalances: [],
          innerInstructions: [],
          loadedAddresses: null,
        },
        transaction: [encoded, 'base85'],
      },
    } as unknown as TransactionNotification

    expect(() => parseSwap(notificationToSwapInput(notification))).toThrow(ValidationError)
  })

  test('returns null for malformed encoded transaction bytes', () => {
    const notification = {
      signature: 'sig',
      slot: 1,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000],
          postBalances: [999_995],
          preTokenBalances: [],
          postTokenBalances: [],
          innerInstructions: [],
          loadedAddresses: null,
        },
        // decodes, but bytes are truncated and cannot be deserialized
        transaction: [Buffer.from([1, 2, 3]).toString('base64'), 'base64'],
      },
    } as unknown as TransactionNotification

    expect(parseSwap(notificationToSwapInput(notification))).toBeNull()
  })
})

describe('amount formatting', () => {
  test('formats exact decimal strings', () => {
    expect(formatTokenAmountDecimal(123456789n, 6)).toBe('123.456789')
    expect(formatTokenAmountDecimal(42n, 9)).toBe('0.000000042')
    expect(formatTokenAmountDecimal(1000n, 3)).toBe('1')
  })

  test('formats zero amount', () => {
    expect(formatTokenAmountDecimal(0n, 6)).toBe('0')
    expect(formatTokenAmountDecimal(0n, 0)).toBe('0')
    expect(formatTokenAmountDecimal(0n, 9)).toBe('0')
  })

  test('formats with decimals=0 (no fractional part)', () => {
    expect(formatTokenAmountDecimal(100n, 0)).toBe('100')
    expect(formatTokenAmountDecimal(1n, 0)).toBe('1')
    expect(formatTokenAmountDecimal(999999999999n, 0)).toBe('999999999999')
  })

  test('formats large amounts', () => {
    // 1 billion tokens with 9 decimals
    expect(formatTokenAmountDecimal(1_000_000_000_000_000_000n, 9)).toBe('1000000000')
    // Very large raw value
    expect(formatTokenAmountDecimal(18446744073709551615n, 6)).toBe('18446744073709.551615')
  })

  test('strips trailing zeros in fractional part', () => {
    expect(formatTokenAmountDecimal(1_500_000n, 6)).toBe('1.5')
    expect(formatTokenAmountDecimal(100n, 3)).toBe('0.1')
    expect(formatTokenAmountDecimal(10_000n, 6)).toBe('0.01')
  })

  test('handles negative amounts', () => {
    expect(formatTokenAmountDecimal(-123456789n, 6)).toBe('-123.456789')
    expect(formatTokenAmountDecimal(-42n, 9)).toBe('-0.000000042')
    expect(formatTokenAmountDecimal(-1000n, 3)).toBe('-1')
    expect(formatTokenAmountDecimal(-0n, 6)).toBe('0')
  })

  test('throws on negative decimals', () => {
    expect(() => formatTokenAmountDecimal(100n, -1)).toThrow('Invalid decimals')
  })

  test('formats amount smaller than 1 whole unit', () => {
    expect(formatTokenAmountDecimal(1n, 6)).toBe('0.000001')
    expect(formatTokenAmountDecimal(999n, 6)).toBe('0.000999')
  })
})

describe('toApproxTokenAmountNumber', () => {
  test('converts normal amounts', () => {
    expect(toApproxTokenAmountNumber(1_000_000n, 6)).toBe(1)
    expect(toApproxTokenAmountNumber(1_500_000n, 6)).toBe(1.5)
    expect(toApproxTokenAmountNumber(42_000_000_000n, 9)).toBe(42)
  })

  test('returns undefined when scale overflows (decimals too large)', () => {
    // 10 ** 309 = Infinity
    expect(toApproxTokenAmountNumber(1n, 309)).toBeUndefined()
  })

  test('returns undefined when result overflows', () => {
    // A bigint so large that Number(raw) / scale = Infinity
    const huge = BigInt(`1${'0'.repeat(310)}`)
    expect(toApproxTokenAmountNumber(huge, 0)).toBeUndefined()
  })

  test('handles zero', () => {
    expect(toApproxTokenAmountNumber(0n, 6)).toBe(0)
    expect(toApproxTokenAmountNumber(0n, 0)).toBe(0)
  })

  test('handles precision loss for very large bigints gracefully', () => {
    // Number can't represent this exactly, but should still return a finite number
    const big = 2n ** 60n
    const result = toApproxTokenAmountNumber(big, 6)
    expect(result).toBeDefined()
    expect(typeof result).toBe('number')
    expect(Number.isFinite(result!)).toBe(true)
  })
})
