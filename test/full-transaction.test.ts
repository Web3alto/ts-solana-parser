import { describe, expect, test } from 'bun:test'
import { SOL_MINT } from '../src/constants.ts'
import { encodeBase58 } from '../src/idl/codec.ts'
import type { DecodedInstruction } from '../src/instruction-types.ts'
import { parseFullSwapTransaction } from '../src/parse-swap.ts'
import type { TransactionNotification } from '../src/types.ts'
import { encodeIxData, notificationToSwapInput, tb } from './helpers.ts'

// Helper to access instruction-specific fields without `as any`
function f(instr: DecodedInstruction): Record<string, unknown> {
  return instr as Record<string, unknown>
}

// ── Helpers ──

function writeU32LE(buf: Uint8Array, value: number, offset: number) {
  buf[offset] = value & 0xff
  buf[offset + 1] = (value >> 8) & 0xff
  buf[offset + 2] = (value >> 16) & 0xff
  buf[offset + 3] = (value >> 24) & 0xff
}

function writeU64LE(buf: Uint8Array, value: bigint, offset: number) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  view.setBigUint64(offset, value, true)
}

function buildTransferSolData(lamports: bigint): Uint8Array {
  const data = new Uint8Array(12)
  writeU32LE(data, 2, 0) // SystemIx.TransferSol
  writeU64LE(data, lamports, 4)
  return data
}

// ── Constants ──

const SYSTEM_PROGRAM = '11111111111111111111111111111111'
const USER = 'User111111111111111111111111111111111111111'
const DEST = 'Dest111111111111111111111111111111111111111'
const TOKEN_MINT = 'TknMint1111111111111111111111111111111111111'
const POOL = 'Pool111111111111111111111111111111111111111'
const PUMPFUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
const PUMPFUN_BUY_DISC = [102, 6, 61, 18, 1, 218, 235, 234] as const

// ── Tests ──

describe('parseFullSwapTransaction: non-swap transactions', () => {
  test('system transfer produces correct instructions and no swap', () => {
    const transferData = buildTransferSolData(5000n)
    const dataBase58 = encodeBase58(transferData)

    const notification: TransactionNotification = {
      signature: 'test-system-transfer-sig',
      slot: 12345,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000, 0],
          postBalances: [999_990_000, 5000],
          preTokenBalances: [],
          postTokenBalances: [],
          innerInstructions: [],
        },
        transaction: {
          message: {
            accountKeys: [USER, DEST, SYSTEM_PROGRAM],
            instructions: [
              {
                programIdIndex: 2, // system program
                accounts: [0, 1], // source, destination
                data: dataBase58,
              },
            ],
            recentBlockhash: '11111111111111111111111111111111',
          },
          signatures: ['test-system-transfer-sig'],
        },
      },
    }

    const result = parseFullSwapTransaction(notificationToSwapInput(notification))

    expect(result).not.toBeNull()
    expect(result!.signature).toBe('test-system-transfer-sig')
    expect(result!.slot).toBe(12345)
    expect(result!.fee).toBe('5000')
    expect(result!.feePayer).toBe(USER)
    expect(result!.err).toBeNull()
    expect(result!.version).toBe('legacy')
    expect(result!.swap).toBeUndefined()

    // Check instructions array
    expect(result!.instructions).toHaveLength(1)
    const entry = result!.instructions[0]!
    expect(entry.index).toBe(0)
    expect(entry.instruction.program).toBe('system')
    expect(f(entry.instruction).type).toBe('transferSol')
    expect(f(entry.instruction).source).toBe(USER)
    expect(f(entry.instruction).destination).toBe(DEST)
    expect(f(entry.instruction).lamports).toBe(5000n)
    expect(entry.innerInstructions).toHaveLength(0)
  })

  test('compute budget instructions are decoded correctly', () => {
    const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111'

    // SetComputeUnitLimit: [2, u32 LE units]
    const limitData = new Uint8Array(5)
    limitData[0] = 2
    writeU32LE(limitData, 300_000, 1)

    // SetComputeUnitPrice: [3, u64 LE microLamports]
    const priceData = new Uint8Array(9)
    priceData[0] = 3
    writeU64LE(priceData, 25_000n, 1)

    const notification: TransactionNotification = {
      signature: 'test-compute-budget-sig',
      slot: 99999,
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
          message: {
            accountKeys: [USER, COMPUTE_BUDGET],
            instructions: [
              {
                programIdIndex: 1,
                accounts: [],
                data: encodeBase58(limitData),
              },
              {
                programIdIndex: 1,
                accounts: [],
                data: encodeBase58(priceData),
              },
            ],
            recentBlockhash: '11111111111111111111111111111111',
          },
          signatures: ['test-compute-budget-sig'],
        },
      },
    }

    const result = parseFullSwapTransaction(notificationToSwapInput(notification))

    expect(result).not.toBeNull()
    expect(result!.instructions).toHaveLength(2)

    const limit = result!.instructions[0]!.instruction
    expect(limit.program).toBe('compute-budget')
    expect(f(limit).type).toBe('setComputeUnitLimit')
    expect(f(limit).units).toBe(300_000)

    const price = result!.instructions[1]!.instruction
    expect(price.program).toBe('compute-budget')
    expect(f(price).type).toBe('setComputeUnitPrice')
    expect(f(price).microLamports).toBe(25_000n)
  })

  test('multiple instruction types in one transaction', () => {
    const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111'
    const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

    // Compute unit limit
    const limitData = new Uint8Array(5)
    limitData[0] = 2
    writeU32LE(limitData, 200_000, 1)

    // System transfer
    const transferData = buildTransferSolData(10_000n)

    // Token transfer
    const tokenTransferData = new Uint8Array(9)
    tokenTransferData[0] = 3 // Transfer
    writeU64LE(tokenTransferData, 500n, 1)

    const srcToken = 'SrcTokenAcct111111111111111111111111111111'
    const dstToken = 'DstTokenAcct111111111111111111111111111111'

    const notification: TransactionNotification = {
      signature: 'test-multi-ix-sig',
      slot: 55555,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000, 0],
          postBalances: [999_985_000, 10_000],
          preTokenBalances: [],
          postTokenBalances: [],
          innerInstructions: [],
        },
        transaction: {
          message: {
            accountKeys: [USER, DEST, SYSTEM_PROGRAM, COMPUTE_BUDGET, TOKEN_PROGRAM, srcToken, dstToken],
            instructions: [
              {
                programIdIndex: 3, // compute budget
                accounts: [],
                data: encodeBase58(limitData),
              },
              {
                programIdIndex: 2, // system
                accounts: [0, 1],
                data: encodeBase58(transferData),
              },
              {
                programIdIndex: 4, // token
                accounts: [5, 6, 0], // src, dst, authority=user
                data: encodeBase58(tokenTransferData),
              },
            ],
            recentBlockhash: '11111111111111111111111111111111',
          },
          signatures: ['test-multi-ix-sig'],
        },
      },
    }

    const result = parseFullSwapTransaction(notificationToSwapInput(notification))

    expect(result).not.toBeNull()
    expect(result!.instructions).toHaveLength(3)

    // First: compute budget
    expect(result!.instructions[0]!.instruction.program).toBe('compute-budget')
    expect(result!.instructions[0]!.index).toBe(0)

    // Second: system transfer
    expect(result!.instructions[1]!.instruction.program).toBe('system')
    expect(result!.instructions[1]!.index).toBe(1)

    // Third: token transfer
    expect(result!.instructions[2]!.instruction.program).toBe('spl-token')
    expect(f(result!.instructions[2]!.instruction).type).toBe('transfer')
    expect(f(result!.instructions[2]!.instruction).source).toBe(srcToken)
    expect(f(result!.instructions[2]!.instruction).destination).toBe(dstToken)
    expect(f(result!.instructions[2]!.instruction).authority).toBe(USER)
    expect(f(result!.instructions[2]!.instruction).amount).toBe(500n)
    expect(result!.instructions[2]!.index).toBe(2)

    expect(result!.swap).toBeUndefined()
  })
})

describe('parseFullSwapTransaction: swap transactions', () => {
  test('PumpFun buy produces instructions and swap field', () => {
    const solSpent = 100_000_000n
    const tokenReceived = 500_000n

    const data = encodeIxData([...PUMPFUN_BUY_DISC], tokenReceived, solSpent)

    const accounts = [
      'GlobalCfg11111111111111111111111111111111111', // 0 globalConfig
      'FeeRecip111111111111111111111111111111111111', // 1 feeRecipient
      TOKEN_MINT, // 2 mint
      POOL, // 3 bondingCurve (pool)
      'AssocBond11111111111111111111111111111111111', // 4 assocBondingCurve
      'AssocUser11111111111111111111111111111111111', // 5 assocUser
      USER, // 6 user (signer)
    ]

    const notification: TransactionNotification = {
      signature: 'full-pumpfun-buy-sig',
      slot: 100,
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
          signatures: ['full-pumpfun-buy-sig'],
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
    expect(result!.signature).toBe('full-pumpfun-buy-sig')
    expect(result!.slot).toBe(100)
    expect(result!.feePayer).toBe(USER)
    expect(result!.fee).toBe('5000')
    expect(result!.err).toBeNull()

    // Instructions decoded
    expect(result!.instructions.length).toBeGreaterThanOrEqual(1)
    // The DEX instruction should be decoded as a dex type
    const dexIx = result!.instructions[0]!.instruction
    expect(dexIx.program).toBe('dex')
    expect(f(dexIx).protocol).toBe('PumpFun')

    // Swap field should be populated
    expect(result!.swap).toBeDefined()
    expect(result!.swap!.swapType).toBe('pumpfun-buy')
    expect(result!.swap!.inputMint).toBe(SOL_MINT)
    expect(result!.swap!.outputMint).toBe(TOKEN_MINT)
    expect(result!.swap!.user).toBe(USER)
    expect(result!.swap!.pool).toBe(POOL)
  })
})

describe('parseFullSwapTransaction: result structure', () => {
  test('legacy transaction has version "legacy"', () => {
    const transferData = buildTransferSolData(1000n)

    const notification: TransactionNotification = {
      signature: 'test-legacy-version',
      slot: 1,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000, 0],
          postBalances: [999_994_000, 1000],
          preTokenBalances: [],
          postTokenBalances: [],
          innerInstructions: [],
        },
        transaction: {
          message: {
            accountKeys: [USER, DEST, SYSTEM_PROGRAM],
            instructions: [
              {
                programIdIndex: 2,
                accounts: [0, 1],
                data: encodeBase58(transferData),
              },
            ],
            recentBlockhash: '11111111111111111111111111111111',
          },
          signatures: ['test-legacy-version'],
        },
      },
    }

    const result = parseFullSwapTransaction(notificationToSwapInput(notification))

    expect(result).not.toBeNull()
    expect(result!.version).toBe('legacy')
  })

  test('transaction with addressTableLookups has version 0', () => {
    const transferData = buildTransferSolData(1000n)

    const notification: TransactionNotification = {
      signature: 'test-v0-version',
      slot: 2,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000, 0],
          postBalances: [999_994_000, 1000],
          preTokenBalances: [],
          postTokenBalances: [],
          innerInstructions: [],
        },
        transaction: {
          message: {
            accountKeys: [USER, DEST, SYSTEM_PROGRAM],
            instructions: [
              {
                programIdIndex: 2,
                accounts: [0, 1],
                data: encodeBase58(transferData),
              },
            ],
            recentBlockhash: '11111111111111111111111111111111',
            addressTableLookups: [
              {
                accountKey: 'LookupTable1111111111111111111111111111111',
                readonlyIndexes: [0],
                writableIndexes: [1],
              },
            ],
          },
          signatures: ['test-v0-version'],
        },
      },
    }

    const result = parseFullSwapTransaction(notificationToSwapInput(notification))

    expect(result).not.toBeNull()
    expect(result!.version).toBe(0)
  })

  test('failed transaction reports err correctly', () => {
    const transferData = buildTransferSolData(1000n)

    const notification: TransactionNotification = {
      signature: 'test-failed-tx',
      slot: 3,
      transaction: {
        meta: {
          err: { InstructionError: [0, { Custom: 1 }] },
          fee: 5000,
          preBalances: [1_000_000_000, 0],
          postBalances: [999_995_000, 0],
          preTokenBalances: [],
          postTokenBalances: [],
          innerInstructions: [],
        },
        transaction: {
          message: {
            accountKeys: [USER, DEST, SYSTEM_PROGRAM],
            instructions: [
              {
                programIdIndex: 2,
                accounts: [0, 1],
                data: encodeBase58(transferData),
              },
            ],
            recentBlockhash: '11111111111111111111111111111111',
          },
          signatures: ['test-failed-tx'],
        },
      },
    }

    const result = parseFullSwapTransaction(notificationToSwapInput(notification))

    expect(result).not.toBeNull()
    expect(result!.err).not.toBeNull()
    expect(result!.err).toEqual({ InstructionError: [0, { Custom: 1 }] })
  })

  test('blockTime is included when present', () => {
    const transferData = buildTransferSolData(1000n)

    const notification: TransactionNotification = {
      signature: 'test-blocktime',
      slot: 4,
      blockTime: 1700000000,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000, 0],
          postBalances: [999_994_000, 1000],
          preTokenBalances: [],
          postTokenBalances: [],
          innerInstructions: [],
        },
        transaction: {
          message: {
            accountKeys: [USER, DEST, SYSTEM_PROGRAM],
            instructions: [
              {
                programIdIndex: 2,
                accounts: [0, 1],
                data: encodeBase58(transferData),
              },
            ],
            recentBlockhash: '11111111111111111111111111111111',
          },
          signatures: ['test-blocktime'],
        },
      },
    }

    const result = parseFullSwapTransaction(notificationToSwapInput(notification))

    expect(result).not.toBeNull()
    expect(result!.blockTime).toBe(1700000000)
  })

  test('instructions array entries have correct DecodedInstructionEntry shape', () => {
    const transferData = buildTransferSolData(1000n)

    const notification: TransactionNotification = {
      signature: 'test-entry-shape',
      slot: 5,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000, 0],
          postBalances: [999_994_000, 1000],
          preTokenBalances: [],
          postTokenBalances: [],
          innerInstructions: [],
        },
        transaction: {
          message: {
            accountKeys: [USER, DEST, SYSTEM_PROGRAM],
            instructions: [
              {
                programIdIndex: 2,
                accounts: [0, 1],
                data: encodeBase58(transferData),
              },
            ],
            recentBlockhash: '11111111111111111111111111111111',
          },
          signatures: ['test-entry-shape'],
        },
      },
    }

    const result = parseFullSwapTransaction(notificationToSwapInput(notification))

    expect(result).not.toBeNull()
    const entry = result!.instructions[0]!

    // DecodedInstructionEntry shape
    expect(typeof entry.index).toBe('number')
    expect(entry.instruction).toBeDefined()
    expect(typeof entry.instruction.program).toBe('string')
    expect(Array.isArray(entry.innerInstructions)).toBe(true)
  })

  test('inner instructions are decoded', () => {
    const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

    // Outer instruction is an unknown program
    const outerData = encodeBase58(new Uint8Array([0xff, 0xfe]))

    // Inner instruction is a token transfer
    const innerTokenData = new Uint8Array(9)
    innerTokenData[0] = 3 // Transfer
    writeU64LE(innerTokenData, 999n, 1)

    const srcToken = 'InnerSrc111111111111111111111111111111111111'
    const dstToken = 'InnerDst111111111111111111111111111111111111'
    const unknownProg = 'UnknownProg111111111111111111111111111111111'

    const notification: TransactionNotification = {
      signature: 'test-inner-ix',
      slot: 6,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000],
          postBalances: [999_995_000],
          preTokenBalances: [],
          postTokenBalances: [],
          innerInstructions: [
            {
              index: 0,
              instructions: [
                {
                  programId: TOKEN_PROGRAM,
                  accounts: [srcToken, dstToken, USER],
                  data: encodeBase58(innerTokenData),
                },
              ],
            },
          ],
        },
        transaction: {
          message: {
            accountKeys: [USER, unknownProg, TOKEN_PROGRAM, srcToken, dstToken],
            instructions: [
              {
                programIdIndex: 1, // unknown program
                accounts: [0],
                data: outerData,
              },
            ],
            recentBlockhash: '11111111111111111111111111111111',
          },
          signatures: ['test-inner-ix'],
        },
      },
    }

    const result = parseFullSwapTransaction(notificationToSwapInput(notification))

    expect(result).not.toBeNull()
    expect(result!.instructions).toHaveLength(1)

    const entry = result!.instructions[0]!
    // Outer instruction is unknown
    expect(entry.instruction.program).toBe('unknown')

    // Inner instruction is a token transfer
    expect(entry.innerInstructions).toHaveLength(1)
    const inner = entry.innerInstructions[0]!
    expect(inner.program).toBe('spl-token')
    expect(f(inner).type).toBe('transfer')
    expect(f(inner).source).toBe(srcToken)
    expect(f(inner).destination).toBe(dstToken)
    expect(f(inner).authority).toBe(USER)
    expect(f(inner).amount).toBe(999n)
  })

  test('returns null for undecodable transaction data', () => {
    const notification: TransactionNotification = {
      signature: 'test-bad-tx',
      slot: 7,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [],
          postBalances: [],
          preTokenBalances: [],
          postTokenBalances: [],
          innerInstructions: [],
        },
        transaction: ['not-valid-base64-or-base58', 'base64'] as unknown as [string, 'base64'],
      },
    }

    const result = parseFullSwapTransaction(notificationToSwapInput(notification))
    expect(result).toBeNull()
  })

  test('logMessages and computeUnitsConsumed are passed through', () => {
    const transferData = buildTransferSolData(1000n)

    const notification: TransactionNotification = {
      signature: 'test-logs',
      slot: 8,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000, 0],
          postBalances: [999_994_000, 1000],
          preTokenBalances: [],
          postTokenBalances: [],
          innerInstructions: [],
          logMessages: [
            'Program 11111111111111111111111111111111 invoke [1]',
            'Program 11111111111111111111111111111111 success',
          ],
          computeUnitsConsumed: 150,
        },
        transaction: {
          message: {
            accountKeys: [USER, DEST, SYSTEM_PROGRAM],
            instructions: [
              {
                programIdIndex: 2,
                accounts: [0, 1],
                data: encodeBase58(transferData),
              },
            ],
            recentBlockhash: '11111111111111111111111111111111',
          },
          signatures: ['test-logs'],
        },
      },
    }

    const result = parseFullSwapTransaction(notificationToSwapInput(notification))

    expect(result).not.toBeNull()
    expect(result!.logMessages).toBeDefined()
    expect(result!.logMessages).toHaveLength(2)
    expect(result!.computeUnitsConsumed).toBe(150)
  })
})
