import { describe, expect, test } from 'bun:test'
import { ValidationError } from '../src/errors.ts'
import { encodeBase58 } from '../src/idl/codec.ts'
import { parseSwap, parseSwapDetailed } from '../src/parse-swap.ts'
import type { NormalizedTransactionMeta } from '../src/parser/accounts.ts'
import type { OwnerTokenState } from '../src/parser/balance.ts'
import { findSwapUser } from '../src/parser/user.ts'
import type { EncodedTransactionTuple, TransactionNotification } from '../src/types.ts'
import { buildMinimalTxBytes, notificationToSwapInput, u64le } from './helpers.ts'

describe('parseSwapDetailed (detailed)', () => {
  test('findSwapUser prefers plausible signer user over vault-like authority', () => {
    const state = {
      deltasByOwner: new Map<string, Map<string, bigint>>([
        [
          'vault',
          new Map<string, bigint>([
            ['mintA', -10n],
            ['mintB', 10n],
          ]),
        ],
        [
          'user',
          new Map<string, bigint>([
            ['mintA', -5n],
            ['mintB', 5n],
          ]),
        ],
      ]),
      decimalsByOwner: new Map<string, Map<string, number>>(),
      malformedBalanceEntries: 0,
    }
    const accountIndexMap = new Map<string, number>([
      ['vault', 1],
      ['user', 2],
    ])
    const meta = {
      preBalances: [0, 10_000, 20_000],
      postBalances: [0, 10_000, 15_000], // user paid SOL side-effect, vault unchanged
      fee: 0,
    } as unknown as NormalizedTransactionMeta

    const selected = findSwapUser(
      state as OwnerTokenState,
      accountIndexMap,
      meta,
      'feePayer',
      new Set<string>(['user', 'feePayer']),
    )

    expect(selected).toBe('user')
  })

  test('rejects unsupported encoding with ValidationError', () => {
    const raw = buildMinimalTxBytes()
    const tuple = [encodeBase58(raw), 'base85'] as unknown as EncodedTransactionTuple

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
        transaction: tuple,
      },
    } as unknown as TransactionNotification

    expect(() => parseSwapDetailed(notificationToSwapInput(notification))).toThrow(ValidationError)
    expect(() => parseSwap(notificationToSwapInput(notification))).toThrow(ValidationError)
  })

  test('classifies missing loaded addresses for unresolved lookup indexes', () => {
    const notification: TransactionNotification = {
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
        transaction: {
          signatures: ['sig'],
          message: {
            accountKeys: ['Fee111111111111111111111111111111111111111'],
            recentBlockhash: '11111111111111111111111111111111',
            addressTableLookups: [
              {
                accountKey: 'Lookup1111111111111111111111111111111111111',
                writableIndexes: [0],
                readonlyIndexes: [],
              },
            ],
            instructions: [
              {
                programIdIndex: 1,
                accounts: [0],
                data: '',
              },
            ],
          },
        },
      },
    }

    const outcome = parseSwapDetailed(notificationToSwapInput(notification))
    expect(outcome.kind).toBe('unsupported')
    expect(outcome.code).toBe('MISSING_LOADED_ADDRESSES')
  })

  test('classifies unsupported transaction version', () => {
    const bytes: number[] = []
    bytes.push(1)
    for (let i = 0; i < 64; i++) bytes.push(1)
    bytes.push(0x82) // unsupported version 2
    bytes.push(1, 0, 0)
    bytes.push(1)
    for (let i = 0; i < 32; i++) bytes.push(2)
    for (let i = 0; i < 32; i++) bytes.push(3)
    bytes.push(0)
    bytes.push(0)

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
        transaction: [Buffer.from(bytes).toString('base64'), 'base64'],
      },
    } as unknown as TransactionNotification

    const outcome = parseSwapDetailed(notificationToSwapInput(notification))
    expect(outcome.kind).toBe('unsupported')
    expect(outcome.code).toBe('UNSUPPORTED_TX_VERSION')
  })

  test('surfaces multi-hop route warnings in swap outcomes', () => {
    const user = 'User111111111111111111111111111111111111111'
    const mintIn = 'MintIn11111111111111111111111111111111111111'
    const mintOut = 'MintOut111111111111111111111111111111111111'

    const notification: TransactionNotification = {
      signature: 'sig',
      slot: 1,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000],
          postBalances: [999_995_000],
          preTokenBalances: [
            {
              accountIndex: 0,
              mint: mintIn,
              owner: user,
              uiTokenAmount: {
                amount: '1000',
                decimals: 6,
                uiAmount: 0.001,
              },
            },
            {
              accountIndex: 0,
              mint: mintOut,
              owner: user,
              uiTokenAmount: {
                amount: '100',
                decimals: 6,
                uiAmount: 0.0001,
              },
            },
          ],
          postTokenBalances: [
            {
              accountIndex: 0,
              mint: mintIn,
              owner: user,
              uiTokenAmount: {
                amount: '700',
                decimals: 6,
                uiAmount: 0.0007,
              },
            },
            {
              accountIndex: 0,
              mint: mintOut,
              owner: user,
              uiTokenAmount: {
                amount: '400',
                decimals: 6,
                uiAmount: 0.0004,
              },
            },
          ],
          innerInstructions: [],
          loadedAddresses: null,
        },
        transaction: {
          signatures: ['sig'],
          message: {
            accountKeys: [user],
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [
              {
                programId: 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
                accounts: ['Pool11111111111111111111111111111111111111'],
                data: '1111',
              },
              {
                programId: 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
                accounts: ['Pool22222222222222222222222222222222222222'],
                data: '1111',
              },
            ],
          },
        },
      },
    }

    const outcome = parseSwapDetailed(notificationToSwapInput(notification))
    expect(outcome.kind).toBe('swap')
    expect(outcome.swap?.routeType).toBe('multi-hop')
    expect(outcome.swap?.warnings).toContain('MULTI_HOP_ROUTE')
  })

  test('flags IDL vs balance mismatches with Token-2022 awareness', () => {
    const BUY_DISC = [102, 6, 61, 18, 1, 218, 235, 234] as const
    const user = 'User111111111111111111111111111111111111111'
    const mint = 'Mint111111111111111111111111111111111111111'
    const data = encodeBase58(
      Uint8Array.from([
        ...BUY_DISC,
        ...u64le(500n), // token amount out
        ...u64le(200_000_000n), // max SOL in (mismatch with balance delta)
      ]),
    )

    const notification: TransactionNotification = {
      signature: 'sig',
      slot: 1,
      transaction: {
        meta: {
          err: null,
          fee: 0,
          preBalances: [1_000_000_000],
          postBalances: [900_000_000],
          preTokenBalances: [
            {
              accountIndex: 0,
              mint,
              owner: user,
              uiTokenAmount: {
                amount: '0',
                decimals: 6,
                uiAmount: 0,
              },
            },
          ],
          postTokenBalances: [
            {
              accountIndex: 0,
              mint,
              owner: user,
              uiTokenAmount: {
                amount: '1000',
                decimals: 6,
                uiAmount: 0.001,
              },
            },
          ],
          innerInstructions: [],
          loadedAddresses: null,
        },
        transaction: {
          signatures: ['sig'],
          message: {
            accountKeys: [user],
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [
              {
                programId: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
                accounts: ['a0', 'a1', mint, 'a3', 'a4', 'a5', user],
                data,
              },
            ],
          },
        },
      },
    }

    const outcome = parseSwapDetailed(notificationToSwapInput(notification), {
      resolveMintTokenProgram: (targetMint: string) => (targetMint === mint ? 'token-2022' : 'spl-token'),
    })

    expect(outcome.kind).toBe('swap')
    expect(outcome.swap?.warnings).toContain('IDL_BALANCE_AMOUNT_MISMATCH')
    expect(outcome.swap?.warnings).toContain('POSSIBLE_TOKEN2022_TRANSFER_FEE')
    expect(outcome.swap?.outputTokenProgram).toBe('token-2022')
  })

  test('anchors input/output mint selection to IDL when extra rebates exist', () => {
    const BUY_DISC = [102, 6, 61, 18, 1, 218, 235, 234] as const
    const user = 'User111111111111111111111111111111111111111'
    const tradeMint = 'TradeMint11111111111111111111111111111111111'
    const rebateMint = 'RebateMint111111111111111111111111111111111'
    const data = encodeBase58(Uint8Array.from([...BUY_DISC, ...u64le(100n), ...u64le(1_000_000_000n)]))

    const notification: TransactionNotification = {
      signature: 'sig',
      slot: 1,
      transaction: {
        meta: {
          err: null,
          fee: 0,
          preBalances: [2_000_000_000],
          postBalances: [1_000_000_000],
          preTokenBalances: [
            {
              accountIndex: 0,
              mint: tradeMint,
              owner: user,
              uiTokenAmount: { amount: '0', decimals: 6, uiAmount: 0 },
            },
            {
              accountIndex: 0,
              mint: rebateMint,
              owner: user,
              uiTokenAmount: { amount: '0', decimals: 6, uiAmount: 0 },
            },
          ],
          postTokenBalances: [
            {
              accountIndex: 0,
              mint: tradeMint,
              owner: user,
              uiTokenAmount: { amount: '100', decimals: 6, uiAmount: 0.0001 },
            },
            {
              accountIndex: 0,
              mint: rebateMint,
              owner: user,
              uiTokenAmount: { amount: '500', decimals: 6, uiAmount: 0.0005 },
            },
          ],
          innerInstructions: [],
          loadedAddresses: null,
        },
        transaction: {
          signatures: ['sig'],
          message: {
            accountKeys: [user],
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [
              {
                programId: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
                accounts: ['a0', 'a1', tradeMint, 'a3', 'a4', 'a5', user],
                data,
              },
            ],
          },
        },
      },
    }

    const outcome = parseSwapDetailed(notificationToSwapInput(notification))
    expect(outcome.kind).toBe('swap')
    expect(outcome.swap?.outputMint).toBe(tradeMint)
    expect(outcome.swap?.outputMint).not.toBe(rebateMint)
  })
})
