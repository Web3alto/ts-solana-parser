import { describe, expect, test } from 'bun:test'
import { AGGREGATOR_PROGRAM_IDS } from '../src/aggregators/constants.ts'
import { parseJupiterInstruction } from '../src/aggregators/jupiter.ts'
import { encodeBase58 } from '../src/idl/codec.ts'
import type { DecodedInstruction } from '../src/instruction-types.ts'
import { parseFullSwapTransaction } from '../src/parse-swap.ts'
import type { TransactionNotification } from '../src/types.ts'
import { encodeIxData, notificationToSwapInput, tb } from './helpers.ts'

// Helper to access instruction-specific fields
function f(instr: DecodedInstruction): Record<string, unknown> {
  return instr as Record<string, unknown>
}

// ── Constants ──

const JUPITER_PROGRAM = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'
const PUMPFUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
const PUMPFUN_BUY_DISC = [102, 6, 61, 18, 1, 218, 235, 234] as const
const USER = 'User111111111111111111111111111111111111111'
const TOKEN_MINT = 'TknMint1111111111111111111111111111111111111'
const POOL = 'Pool111111111111111111111111111111111111111'
const ACCOUNT_A = 'AcctA11111111111111111111111111111111111111'
const ACCOUNT_B = 'AcctB11111111111111111111111111111111111111'
const ACCOUNT_C = 'AcctC11111111111111111111111111111111111111'

// All route discriminators with expected variant/signerIndex
const ROUTE_VARIANTS = [
  { variant: 'route', disc: [229, 23, 203, 151, 122, 227, 173, 42], signerIndex: 1 },
  { variant: 'route_v2', disc: [187, 100, 250, 204, 49, 196, 175, 20], signerIndex: 0 },
  { variant: 'shared_accounts_route', disc: [193, 32, 155, 51, 65, 214, 156, 129], signerIndex: 2 },
  { variant: 'shared_accounts_route_v2', disc: [209, 152, 83, 147, 124, 254, 216, 233], signerIndex: 1 },
  { variant: 'exact_out_route', disc: [208, 51, 239, 151, 123, 43, 237, 92], signerIndex: 1 },
  { variant: 'exact_out_route_v2', disc: [157, 138, 184, 82, 21, 244, 243, 36], signerIndex: 0 },
  { variant: 'shared_accounts_exact_out_route', disc: [176, 209, 105, 168, 154, 125, 69, 62], signerIndex: 2 },
  { variant: 'shared_accounts_exact_out_route_v2', disc: [53, 96, 229, 202, 216, 187, 250, 24], signerIndex: 1 },
  { variant: 'route_with_token_ledger', disc: [150, 86, 71, 116, 167, 93, 14, 104], signerIndex: 1 },
  {
    variant: 'shared_accounts_route_with_token_ledger',
    disc: [230, 121, 143, 80, 119, 159, 106, 170],
    signerIndex: 2,
  },
] as const

// ── Unit tests for parseJupiterInstruction ──

describe('parseJupiterInstruction', () => {
  for (const { variant, disc, signerIndex } of ROUTE_VARIANTS) {
    test(`recognizes ${variant} discriminator (signer at index ${signerIndex})`, () => {
      const accounts = [ACCOUNT_A, ACCOUNT_B, ACCOUNT_C]
      // Build data: 8-byte discriminator + some padding
      const data = new Uint8Array([...disc, 0, 0, 0, 0])
      const result = parseJupiterInstruction(data, accounts)

      expect(result).not.toBeNull()
      expect(result!.variant).toBe(variant)
      expect(result!.signer).toBe(accounts[signerIndex]!)
    })
  }

  test('returns null for non-swap instruction data', () => {
    // Fabricated discriminator that does not match any known route
    const data = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3])
    const result = parseJupiterInstruction(data, [USER, ACCOUNT_A])
    expect(result).toBeNull()
  })

  test('returns null for data shorter than 8 bytes', () => {
    const data = new Uint8Array([229, 23, 203, 151]) // only 4 bytes
    const result = parseJupiterInstruction(data, [USER])
    expect(result).toBeNull()
  })

  test('returns null when signer account index is out of bounds', () => {
    // route_v2 needs signerIndex 0, shared_accounts_route needs signerIndex 2
    // provide only 2 accounts so index 2 is out of bounds
    const disc = [193, 32, 155, 51, 65, 214, 156, 129] // shared_accounts_route, signerIndex 2
    const data = new Uint8Array([...disc, 0, 0, 0, 0])
    const result = parseJupiterInstruction(data, [ACCOUNT_A, ACCOUNT_B]) // only 2 accounts
    expect(result).toBeNull()
  })
})

// ── Integration tests for routedVia detection ──

describe('Jupiter aggregator detection via parseFullSwapTransaction', () => {
  test('routedVia is set to "jupiter" when Jupiter is top-level program', () => {
    const solSpent = 100_000_000n
    const tokenReceived = 500_000n

    // Build PumpFun buy inner instruction data
    const pumpfunData = encodeIxData([...PUMPFUN_BUY_DISC], tokenReceived, solSpent)

    const pumpfunAccounts = [
      'GlobalCfg11111111111111111111111111111111111', // 0 globalConfig
      'FeeRecip111111111111111111111111111111111111', // 1 feeRecipient
      TOKEN_MINT, // 2 mint
      POOL, // 3 bondingCurve (pool)
      'AssocBond11111111111111111111111111111111111', // 4 assocBondingCurve
      'AssocUser11111111111111111111111111111111111', // 5 assocUser
      USER, // 6 user (signer)
    ]

    // Jupiter route discriminator + padding for the outer instruction
    const jupData = new Uint8Array([229, 23, 203, 151, 122, 227, 173, 42, 0, 0, 0, 0])
    const jupDataBase58 = encodeBase58(jupData)

    const notification: TransactionNotification = {
      signature: 'test-jupiter-routed-swap',
      slot: 200,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000],
          postBalances: [1_000_000_000 - 100_000_000 - 5000],
          preTokenBalances: [tb(0, TOKEN_MINT, '0', 6, USER)],
          postTokenBalances: [tb(0, TOKEN_MINT, '500000', 6, USER)],
          innerInstructions: [
            {
              index: 0,
              instructions: [
                {
                  programId: PUMPFUN_PROGRAM,
                  accounts: pumpfunAccounts,
                  data: pumpfunData,
                },
              ],
            },
          ],
        },
        transaction: {
          signatures: ['test-jupiter-routed-swap'],
          message: {
            accountKeys: [USER],
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [
              {
                // Top-level Jupiter instruction (UnparsedInstruction format)
                programId: JUPITER_PROGRAM,
                accounts: [ACCOUNT_A, USER, ACCOUNT_B],
                data: jupDataBase58,
              },
            ],
          },
        },
      },
    }

    const result = parseFullSwapTransaction(notificationToSwapInput(notification))

    expect(result).not.toBeNull()
    expect(result!.swap).toBeDefined()
    expect(result!.swap!.routedVia).toBe('jupiter')
  })

  test('routedVia is undefined when no aggregator is present', () => {
    const solSpent = 100_000_000n
    const tokenReceived = 500_000n

    const data = encodeIxData([...PUMPFUN_BUY_DISC], tokenReceived, solSpent)

    const accounts = [
      'GlobalCfg11111111111111111111111111111111111',
      'FeeRecip111111111111111111111111111111111111',
      TOKEN_MINT,
      POOL,
      'AssocBond11111111111111111111111111111111111',
      'AssocUser11111111111111111111111111111111111',
      USER,
    ]

    const notification: TransactionNotification = {
      signature: 'test-no-aggregator',
      slot: 201,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000],
          postBalances: [1_000_000_000 - 100_000_000 - 5000],
          preTokenBalances: [tb(0, TOKEN_MINT, '0', 6, USER)],
          postTokenBalances: [tb(0, TOKEN_MINT, '500000', 6, USER)],
          innerInstructions: [],
        },
        transaction: {
          signatures: ['test-no-aggregator'],
          message: {
            accountKeys: [USER],
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [
              {
                programId: PUMPFUN_PROGRAM,
                accounts,
                data,
              },
            ],
          },
        },
      },
    }

    const result = parseFullSwapTransaction(notificationToSwapInput(notification))

    expect(result).not.toBeNull()
    expect(result!.swap).toBeDefined()
    expect(result!.swap!.routedVia).toBeUndefined()
  })
})

// ── Full transaction decode test ──

describe('Jupiter instruction decoding', () => {
  test('Jupiter route instruction decodes with program: "aggregator"', () => {
    // Jupiter route discriminator + padding
    const jupData = new Uint8Array([229, 23, 203, 151, 122, 227, 173, 42, 0, 0, 0, 0])
    const jupDataBase58 = encodeBase58(jupData)

    const notification: TransactionNotification = {
      signature: 'test-jupiter-decode',
      slot: 300,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000],
          postBalances: [999_995_000],
          preTokenBalances: [],
          postTokenBalances: [],
          innerInstructions: [],
        },
        transaction: {
          signatures: ['test-jupiter-decode'],
          message: {
            accountKeys: [USER],
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [
              {
                programId: JUPITER_PROGRAM,
                accounts: [ACCOUNT_A, USER, ACCOUNT_B],
                data: jupDataBase58,
              },
            ],
          },
        },
      },
    }

    const result = parseFullSwapTransaction(notificationToSwapInput(notification))

    expect(result).not.toBeNull()
    expect(result!.instructions).toHaveLength(1)

    const ix = result!.instructions[0]!.instruction
    expect(ix.program).toBe('aggregator')
    expect(f(ix).aggregator).toBe('jupiter')
    expect(f(ix).variant).toBe('route')
    expect(f(ix).signer).toBe(USER)
    expect(f(ix).programId).toBe(JUPITER_PROGRAM)
  })

  test('Jupiter non-swap instruction decodes as unknown', () => {
    // Non-matching discriminator
    const unknownData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 0, 0])
    const unknownDataBase58 = encodeBase58(unknownData)

    const notification: TransactionNotification = {
      signature: 'test-jupiter-non-swap',
      slot: 301,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000],
          postBalances: [999_995_000],
          preTokenBalances: [],
          postTokenBalances: [],
          innerInstructions: [],
        },
        transaction: {
          signatures: ['test-jupiter-non-swap'],
          message: {
            accountKeys: [USER],
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [
              {
                programId: JUPITER_PROGRAM,
                accounts: [USER],
                data: unknownDataBase58,
              },
            ],
          },
        },
      },
    }

    const result = parseFullSwapTransaction(notificationToSwapInput(notification))

    expect(result).not.toBeNull()
    expect(result!.instructions).toHaveLength(1)
    // Non-swap Jupiter instructions fall through to unknown
    expect(result!.instructions[0]!.instruction.program).toBe('unknown')
  })

  test('AGGREGATOR_PROGRAM_IDS maps Jupiter correctly', () => {
    expect(AGGREGATOR_PROGRAM_IDS[JUPITER_PROGRAM]).toBe('jupiter')
  })
})
