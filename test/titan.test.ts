import { describe, expect, test } from 'bun:test'
import { AGGREGATOR_PROGRAM_IDS } from '../src/aggregators/constants.ts'
import { parseTitanInstruction } from '../src/aggregators/titan.ts'
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

const TITAN_PROGRAM = 'T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT'
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
  { variant: 'swap_route_v2', disc: [249, 91, 84, 33, 69, 22, 0, 135], signerIndex: 0 },
  { variant: 'swap_route', disc: [86, 183, 163, 144, 0, 50, 173, 28], signerIndex: 1 },
  { variant: 'swap_v2', disc: [43, 4, 237, 11, 26, 201, 30, 98], signerIndex: 0 },
  { variant: 'swap', disc: [248, 198, 158, 145, 225, 117, 135, 200], signerIndex: 1 },
  { variant: 'shared_accounts_swap_route', disc: [240, 184, 123, 254, 103, 28, 179, 125], signerIndex: 2 },
  { variant: 'shared_accounts_swap_route_v2', disc: [68, 158, 178, 157, 208, 244, 62, 231], signerIndex: 1 },
  { variant: 'swap_route_with_token_ledger', disc: [137, 183, 238, 196, 115, 204, 162, 66], signerIndex: 1 },
] as const

// ── Unit tests for parseTitanInstruction ──

describe('parseTitanInstruction', () => {
  for (const { variant, disc, signerIndex } of ROUTE_VARIANTS) {
    test(`recognizes ${variant} discriminator (signer at index ${signerIndex})`, () => {
      const accounts = [ACCOUNT_A, ACCOUNT_B, ACCOUNT_C]
      // Build data: 8-byte discriminator + some padding
      const data = new Uint8Array([...disc, 0, 0, 0, 0])
      const result = parseTitanInstruction(data, accounts)

      expect(result).not.toBeNull()
      expect(result!.variant).toBe(variant)
      expect(result!.signer).toBe(accounts[signerIndex]!)
    })
  }

  test('returns null for non-swap instruction data', () => {
    // Fabricated discriminator that does not match any known route
    const data = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3])
    const result = parseTitanInstruction(data, [USER, ACCOUNT_A])
    expect(result).toBeNull()
  })

  test('returns null for data shorter than 8 bytes', () => {
    const data = new Uint8Array([249, 91, 84, 33]) // only 4 bytes
    const result = parseTitanInstruction(data, [USER])
    expect(result).toBeNull()
  })

  test('returns null when signer account index is out of bounds', () => {
    // shared_accounts_swap_route needs signerIndex 2
    // provide only 2 accounts so index 2 is out of bounds
    const disc = [240, 184, 123, 254, 103, 28, 179, 125]
    const data = new Uint8Array([...disc, 0, 0, 0, 0])
    const result = parseTitanInstruction(data, [ACCOUNT_A, ACCOUNT_B]) // only 2 accounts
    expect(result).toBeNull()
  })
})

// ── Integration tests for routedVia detection ──

describe('Titan aggregator detection via parseFullSwapTransaction', () => {
  test('routedVia is set to "titan" when Titan is top-level program', () => {
    const solSpent = 100_000_000n
    const tokenReceived = 500_000n

    const pumpfunData = encodeIxData([...PUMPFUN_BUY_DISC], tokenReceived, solSpent)

    const pumpfunAccounts = [
      'GlobalCfg11111111111111111111111111111111111',
      'FeeRecip111111111111111111111111111111111111',
      TOKEN_MINT,
      POOL,
      'AssocBond11111111111111111111111111111111111',
      'AssocUser11111111111111111111111111111111111',
      USER,
    ]

    // Titan swap_route_v2 discriminator + padding
    const titanData = new Uint8Array([249, 91, 84, 33, 69, 22, 0, 135, 0, 0, 0, 0])
    const titanDataBase58 = encodeBase58(titanData)

    const notification: TransactionNotification = {
      signature: 'test-titan-routed-swap',
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
          signatures: ['test-titan-routed-swap'],
          message: {
            accountKeys: [USER],
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [
              {
                programId: TITAN_PROGRAM,
                accounts: [USER, ACCOUNT_A, ACCOUNT_B],
                data: titanDataBase58,
              },
            ],
          },
        },
      },
    }

    const result = parseFullSwapTransaction(notificationToSwapInput(notification))

    expect(result).not.toBeNull()
    expect(result!.swap).toBeDefined()
    expect(result!.swap!.routedVia).toBe('titan')
  })
})

// ── Full transaction decode test ──

describe('Titan instruction decoding', () => {
  test('Titan swap_route_v2 instruction decodes with program: "aggregator"', () => {
    const titanData = new Uint8Array([249, 91, 84, 33, 69, 22, 0, 135, 0, 0, 0, 0])
    const titanDataBase58 = encodeBase58(titanData)

    const notification: TransactionNotification = {
      signature: 'test-titan-decode',
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
          signatures: ['test-titan-decode'],
          message: {
            accountKeys: [USER],
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [
              {
                programId: TITAN_PROGRAM,
                accounts: [USER, ACCOUNT_A, ACCOUNT_B],
                data: titanDataBase58,
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
    expect(f(ix).aggregator).toBe('titan')
    expect(f(ix).variant).toBe('swap_route_v2')
    expect(f(ix).signer).toBe(USER)
    expect(f(ix).programId).toBe(TITAN_PROGRAM)
  })

  test('Titan non-swap instruction decodes as unknown', () => {
    const unknownData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 0, 0])
    const unknownDataBase58 = encodeBase58(unknownData)

    const notification: TransactionNotification = {
      signature: 'test-titan-non-swap',
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
          signatures: ['test-titan-non-swap'],
          message: {
            accountKeys: [USER],
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [
              {
                programId: TITAN_PROGRAM,
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
    expect(result!.instructions[0]!.instruction.program).toBe('unknown')
  })

  test('AGGREGATOR_PROGRAM_IDS maps Titan correctly', () => {
    expect(AGGREGATOR_PROGRAM_IDS[TITAN_PROGRAM]).toBe('titan')
  })
})
