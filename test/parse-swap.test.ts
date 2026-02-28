import { describe, expect, test } from 'bun:test'
import { ValidationError } from '../src/errors.ts'
import type { SwapInput } from '../src/parse-swap.ts'
import { parseSwap, parseSwapDetailed } from '../src/parse-swap.ts'
import { parseTransaction, parseTransactionDetailed } from '../src/parser.ts'
import type { TokenBalance, TransactionNotification } from '../src/types.ts'
import { encodeIxData } from './helpers.ts'

// ── Fixtures ──

const USER = 'User111111111111111111111111111111111111111'
const TOKEN_MINT = 'TknMint1111111111111111111111111111111111111'
const POOL = 'Pool111111111111111111111111111111111111111'
const PUMPFUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
const PUMPFUN_BUY_DISC = [102, 6, 61, 18, 1, 218, 235, 234] as const

function tb(accountIndex: number, mint: string, amount: string, decimals: number, owner: string): TokenBalance {
  return {
    accountIndex,
    mint,
    owner,
    uiTokenAmount: {
      amount,
      decimals,
      uiAmount: Number(amount) / 10 ** decimals,
    },
  }
}

function buildPumpfunBuyNotification(): TransactionNotification {
  return {
    signature: 'TestSig123',
    slot: 42,
    blockTime: 1700000000,
    transaction: {
      meta: {
        err: null,
        fee: 5000,
        preBalances: [1_000_000_000, 0, 0, 0, 0, 0],
        postBalances: [900_000_000, 0, 0, 0, 0, 0],
        preTokenBalances: [tb(1, TOKEN_MINT, '0', 6, USER)],
        postTokenBalances: [tb(1, TOKEN_MINT, '500000', 6, USER)],
        innerInstructions: [],
        loadedAddresses: null,
      },
      transaction: {
        message: {
          accountKeys: [
            USER,
            TOKEN_MINT,
            'Filler11111111111111111111111111111111111111',
            POOL,
            'Filler21111111111111111111111111111111111111',
            PUMPFUN_PROGRAM,
          ],
          instructions: [
            {
              programIdIndex: 5,
              accounts: [0, 1, 2, 3, 4, 5],
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

function notificationToSwapInput(n: TransactionNotification): SwapInput {
  return {
    transaction: n.transaction.transaction,
    meta: n.transaction.meta,
    signature: n.signature,
    slot: n.slot,
    blockTime: n.blockTime,
  }
}

// ── Tests ──

describe('parseSwap', () => {
  test('produces same result as parseTransaction', () => {
    const notification = buildPumpfunBuyNotification()
    const input = notificationToSwapInput(notification)

    const fromSwap = parseSwap(input)
    const fromTx = parseTransaction(notification)

    expect(fromSwap).toEqual(fromTx)
  })

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
  test('produces same result as parseTransactionDetailed', () => {
    const notification = buildPumpfunBuyNotification()
    const input = notificationToSwapInput(notification)

    const fromSwap = parseSwapDetailed(input)
    const fromTx = parseTransactionDetailed(notification)

    expect(fromSwap).toEqual(fromTx)
  })

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
