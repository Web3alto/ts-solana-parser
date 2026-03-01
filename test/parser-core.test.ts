import { describe, expect, test } from 'bun:test'
import { zstdCompressSync } from 'node:zlib'
import { formatTokenAmountDecimal } from '../src/amount.ts'
import { UnsupportedEncodingError, ValidationError } from '../src/errors.ts'
import { decodeBase58, encodeBase58 } from '../src/idl/codec.ts'
import { normalizeTransactionData } from '../src/normalize.ts'
import { parseSwap } from '../src/parse-swap.ts'
import type { EncodedTransactionTuple, TransactionNotification } from '../src/types.ts'
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
})

describe('decoder safety', () => {
  test('rejects invalid base58 input', () => {
    expect(() => decodeBase58('0OIl')).toThrow()
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
})
