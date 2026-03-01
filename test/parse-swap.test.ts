import { describe, expect, mock, test } from 'bun:test'
import { ValidationError } from '../src/errors.ts'
import type { SwapInput } from '../src/parse-swap.ts'
import {
  parseFullSwapTransaction,
  parseSwap,
  parseSwapDetailed,
  parseSwaps,
  parseSwapsDetailed,
} from '../src/parse-swap.ts'
import type { ParserOptions, TransactionNotification } from '../src/types.ts'
import { encodeIxData, notificationToSwapInput, tb } from './helpers.ts'

// ── Fixtures ──

const USER = 'User111111111111111111111111111111111111111'
const TOKEN_MINT = 'TknMint1111111111111111111111111111111111111'
const POOL = 'Pool111111111111111111111111111111111111111'
const PUMPFUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
const PUMPFUN_BUY_DISC = [102, 6, 61, 18, 1, 218, 235, 234] as const

function buildPumpfunBuyNotification(): TransactionNotification {
  return {
    signature: 'TestSig123',
    slot: 42,
    blockTime: 1700000000,
    transaction: {
      meta: {
        err: null,
        fee: 5000,
        preBalances: [0, 0, 0, 0, 0, 0, 1_000_000_000],
        postBalances: [0, 0, 0, 0, 0, 0, 900_000_000],
        preTokenBalances: [tb(1, TOKEN_MINT, '0', 6, USER)],
        postTokenBalances: [tb(1, TOKEN_MINT, '500000', 6, USER)],
        innerInstructions: [],
        loadedAddresses: null,
      },
      transaction: {
        message: {
          accountKeys: [
            'GlobalCfg11111111111111111111111111111111111', // 0 globalConfig
            'FeeRecip111111111111111111111111111111111111', // 1 feeRecipient
            TOKEN_MINT, // 2 mint
            POOL, // 3 bondingCurve (pool)
            'AssocBond11111111111111111111111111111111111', // 4 assocBondingCurve
            PUMPFUN_PROGRAM, // 5 program
            USER, // 6 user (signer)
          ],
          instructions: [
            {
              programIdIndex: 5,
              accounts: [0, 1, 2, 3, 4, 5, 6],
              data: encodeIxData(PUMPFUN_BUY_DISC, 100_000_000n, 500_000n),
            },
          ],
          recentBlockhash: '11111111111111111111111111111111',
        },
        signatures: ['TestSig123'],
      },
    },
  }
}

// ── Tests ──

describe('parseSwap', () => {
  test('works without optional signature and slot fields', () => {
    const notification = buildPumpfunBuyNotification()
    const input: SwapInput = {
      transaction: notification.transaction.transaction,
      meta: notification.transaction.meta,
    }

    // Should not throw, uses defaults
    const result = parseSwap(input)
    if (result) {
      expect(result.signature).toBe('')
      expect(result.slot).toBe(0)
    }
  })

  test('returns null for non-swap transaction', () => {
    const input: SwapInput = {
      transaction: {
        message: {
          accountKeys: ['11111111111111111111111111111111'],
          instructions: [],
          recentBlockhash: '11111111111111111111111111111111',
        },
        signatures: ['sig'],
      },
      meta: {
        err: null,
        fee: 5000,
        preBalances: [1_000_000],
        postBalances: [995_000],
        preTokenBalances: [],
        postTokenBalances: [],
        innerInstructions: [],
        loadedAddresses: null,
      },
    }

    expect(parseSwap(input)).toBeNull()
  })
})

describe('parseSwapDetailed', () => {
  test('returns ParseOutcome for valid non-swap input', () => {
    const input: SwapInput = {
      transaction: {
        message: {
          accountKeys: ['11111111111111111111111111111111'],
          instructions: [],
          recentBlockhash: '11111111111111111111111111111111',
        },
        signatures: ['sig'],
      },
      meta: {
        err: null,
        fee: 5000,
        preBalances: [1_000_000],
        postBalances: [995_000],
        preTokenBalances: [],
        postTokenBalances: [],
        innerInstructions: [],
        loadedAddresses: null,
      },
    }

    const outcome = parseSwapDetailed(input)
    expect(outcome.kind).toBe('not_swap')
  })

  test('throws ValidationError for invalid input', () => {
    const input = { meta: { fee: 'not a number' } } as unknown as SwapInput
    expect(() => parseSwapDetailed(input)).toThrow(ValidationError)
  })
})

describe('ValidationError', () => {
  test('thrown for missing meta field entirely', () => {
    const input = {
      transaction: {
        message: { accountKeys: [], instructions: [], recentBlockhash: 'x' },
        signatures: ['sig'],
      },
    } as unknown as SwapInput

    try {
      parseSwap(input)
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      const ve = err as ValidationError
      expect(ve.issues.length).toBeGreaterThan(0)
    }
  })

  test('thrown for invalid encoding in tuple', () => {
    const input: SwapInput = {
      transaction: ['abc123', 'base85'] as unknown as SwapInput['transaction'],
      meta: {
        err: null,
        fee: 5000,
        preBalances: [1_000_000],
        postBalances: [995_000],
        preTokenBalances: [],
        postTokenBalances: [],
        innerInstructions: [],
        loadedAddresses: null,
      },
    }

    try {
      parseSwap(input)
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
    }
  })

  test('thrown for non-numeric fee', () => {
    const input = {
      transaction: {
        message: { accountKeys: [], instructions: [], recentBlockhash: 'x' },
        signatures: ['sig'],
      },
      meta: {
        err: null,
        fee: 'not a number',
        preBalances: [],
        postBalances: [],
      },
    } as unknown as SwapInput

    try {
      parseSwap(input)
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      const ve = err as ValidationError
      const feePath = ve.issues.find((i) => i.path.includes('fee'))
      expect(feePath).toBeDefined()
    }
  })

  test('thrown for missing preBalances and postBalances', () => {
    const input = {
      transaction: {
        message: { accountKeys: [], instructions: [], recentBlockhash: 'x' },
        signatures: ['sig'],
      },
      meta: {
        err: null,
        fee: 5000,
      },
    } as unknown as SwapInput

    try {
      parseSwap(input)
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      const ve = err as ValidationError
      expect(ve.issues.length).toBeGreaterThan(0)
    }
  })

  test('contains structured Zod issues with correct paths', () => {
    const input = {
      transaction: {
        message: {},
        signatures: ['sig'],
      },
      meta: {
        err: null,
        fee: -1,
        preBalances: 'not an array',
        postBalances: [],
      },
    } as unknown as SwapInput

    try {
      parseSwap(input)
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      const ve = err as ValidationError
      expect(ve.issues.length).toBeGreaterThan(0)
      for (const issue of ve.issues) {
        expect(issue).toHaveProperty('path')
        expect(issue).toHaveProperty('message')
      }
    }
  })

  test('error message includes path and message from issues', () => {
    const input = {
      transaction: 'invalid',
      meta: {
        err: null,
        fee: 5000,
        preBalances: [],
        postBalances: [],
      },
    } as unknown as SwapInput

    try {
      parseSwap(input)
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      const ve = err as ValidationError
      expect(ve.message).toContain('Invalid input:')
      expect(ve.name).toBe('ValidationError')
    }
  })
})

// ── Batch API ──

const NON_SWAP_INPUT: SwapInput = {
  transaction: {
    message: {
      accountKeys: ['11111111111111111111111111111111'],
      instructions: [],
      recentBlockhash: '11111111111111111111111111111111',
    },
    signatures: ['sig'],
  },
  meta: {
    err: null,
    fee: 5000,
    preBalances: [1_000_000],
    postBalances: [995_000],
    preTokenBalances: [],
    postTokenBalances: [],
    innerInstructions: [],
    loadedAddresses: null,
  },
}

const INVALID_INPUT = { meta: { fee: 'not a number' } } as unknown as SwapInput

describe('parseSwaps (batch)', () => {
  test('returns index-correlated results for valid batch', async () => {
    const n = buildPumpfunBuyNotification()
    const inputs = [notificationToSwapInput(n), NON_SWAP_INPUT]
    const results = await parseSwaps(inputs)

    expect(results).toHaveLength(2)
    expect(results[0]).not.toBeNull()
    expect(results[0]!.signature).toBe('TestSig123')
    expect(results[1]).toBeNull()
  })

  test('single invalid item does not abort batch', async () => {
    const n = buildPumpfunBuyNotification()
    const inputs = [INVALID_INPUT, notificationToSwapInput(n), INVALID_INPUT]
    const results = await parseSwaps(inputs)

    expect(results).toHaveLength(3)
    expect(results[0]).toBeNull()
    expect(results[1]).not.toBeNull()
    expect(results[1]!.signature).toBe('TestSig123')
    expect(results[2]).toBeNull()
  })

  test('empty array returns empty array', async () => {
    const results = await parseSwaps([])
    expect(results).toEqual([])
  })

  test('results match calling parseSwap individually', async () => {
    const n = buildPumpfunBuyNotification()
    const inputs = [notificationToSwapInput(n), NON_SWAP_INPUT]

    const batchResults = await parseSwaps(inputs)
    const individualResults = inputs.map((i) => parseSwap(i))

    expect(batchResults).toEqual(individualResults)
  })

  test('pre-warms ALTs across all transactions', async () => {
    const ALT_KEY_A = 'ALTKeyA1111111111111111111111111111111111111'
    const ALT_KEY_B = 'ALTKeyB1111111111111111111111111111111111111'

    const inputA: SwapInput = {
      transaction: {
        message: {
          accountKeys: [USER],
          instructions: [],
          recentBlockhash: '11111111111111111111111111111111',
          addressTableLookups: [{ accountKey: ALT_KEY_A, readonlyIndexes: [0], writableIndexes: [] }],
        },
        signatures: ['sigA'],
      },
      meta: {
        err: null,
        fee: 5000,
        preBalances: [1_000_000],
        postBalances: [995_000],
        preTokenBalances: [],
        postTokenBalances: [],
        innerInstructions: [],
        loadedAddresses: null,
      },
    }

    const inputB: SwapInput = {
      transaction: {
        message: {
          accountKeys: [USER],
          instructions: [],
          recentBlockhash: '11111111111111111111111111111111',
          addressTableLookups: [{ accountKey: ALT_KEY_B, readonlyIndexes: [0], writableIndexes: [] }],
        },
        signatures: ['sigB'],
      },
      meta: {
        err: null,
        fee: 5000,
        preBalances: [1_000_000],
        postBalances: [995_000],
        preTokenBalances: [],
        postTokenBalances: [],
        innerInstructions: [],
        loadedAddresses: null,
      },
    }

    const warmFn = mock(async (_accounts: string[]) => {})
    const options: ParserOptions = { warmAddressLookupTables: warmFn }

    await parseSwaps([inputA, inputB], options)

    expect(warmFn).toHaveBeenCalledTimes(1)
    const calledWith = warmFn.mock.calls[0]![0] as string[]
    expect(calledWith).toContain(ALT_KEY_A)
    expect(calledWith).toContain(ALT_KEY_B)
  })
})

describe('parseSwapsDetailed (batch)', () => {
  test('returns ParseOutcome per item', async () => {
    const n = buildPumpfunBuyNotification()
    const inputs = [notificationToSwapInput(n), NON_SWAP_INPUT]
    const outcomes = await parseSwapsDetailed(inputs)

    expect(outcomes).toHaveLength(2)
    expect(outcomes[0]!.kind).toBe('swap')
    expect(outcomes[0]!.swap).toBeDefined()
    expect(outcomes[1]!.kind).toBe('not_swap')
  })

  test('validation errors produce kind:error outcomes with errorMessage', async () => {
    const outcomes = await parseSwapsDetailed([INVALID_INPUT])

    expect(outcomes).toHaveLength(1)
    expect(outcomes[0]!.kind).toBe('error')
    expect(outcomes[0]!.code).toBe('INTERNAL_ERROR')
    expect(outcomes[0]!.errorMessage).toBeDefined()
    expect(outcomes[0]!.errorMessage!.length).toBeGreaterThan(0)
  })

  test('warmAddressLookupTables failure does not abort batch', async () => {
    const n = buildPumpfunBuyNotification()
    const input = notificationToSwapInput(n)
    // Add an ALT lookup so the warm path is triggered
    const txData = input.transaction as { message: { addressTableLookups?: unknown[] } }
    txData.message.addressTableLookups = [
      { accountKey: 'SomeALT11111111111111111111111111111111111', readonlyIndexes: [0], writableIndexes: [] },
    ]

    const errorFn = mock((_ctx: { error: unknown }) => {})
    const options: ParserOptions = {
      warmAddressLookupTables: async () => {
        throw new Error('RPC down')
      },
      onResolverError: errorFn,
    }

    const outcomes = await parseSwapsDetailed([input], options)

    expect(outcomes).toHaveLength(1)
    // Parsing still proceeds (may fail for other reasons, but not aborted by ALT error)
    expect(outcomes[0]!.kind).not.toBe('error')
    expect(errorFn).toHaveBeenCalledTimes(1)
  })
})

// ── Full transaction parsing ──

describe('parseFullSwapTransaction', () => {
  test('valid swap input returns FullTransactionResult with swap', () => {
    const notification = buildPumpfunBuyNotification()
    const input = notificationToSwapInput(notification)

    const result = parseFullSwapTransaction(input)
    expect(result).not.toBeNull()
    expect(result!.signature).toBe('TestSig123')
    expect(result!.slot).toBe(42)
    expect(result!.instructions).toBeDefined()
    expect(Array.isArray(result!.instructions)).toBe(true)
    expect(result!.swap).toBeDefined()
  })

  test('invalid input throws ValidationError', () => {
    const input = { meta: { fee: 'not a number' } } as unknown as SwapInput
    expect(() => parseFullSwapTransaction(input)).toThrow(ValidationError)
  })

  test('non-swap transaction returns result with swap undefined', () => {
    const result = parseFullSwapTransaction(NON_SWAP_INPUT)
    expect(result).not.toBeNull()
    expect(result!.swap).toBeUndefined()
  })
})
