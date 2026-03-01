import { describe, expect, test } from 'bun:test'
import { SOL_MINT, WSOL_MINT } from '../src/constants.ts'
import { encodeBase58 } from '../src/idl/codec.ts'
import { parseTransactionDetailed } from '../src/parser.ts'
import type { TokenBalance, TransactionNotification } from '../src/types.ts'
import { encodeIxData, u64le } from './helpers.ts'

// ── Discriminators ──

const PUMPFUN_BUY_DISC = [102, 6, 61, 18, 1, 218, 235, 234] as const
const PUMPSWAP_BUY_DISC = [102, 6, 61, 18, 1, 218, 235, 234] as const
const RAYDIUM_CPMM_SWAP_BASE_INPUT_DISC = [143, 190, 90, 218, 196, 30, 51, 222] as const
const RAYDIUM_CLMM_SWAP_V2_DISC = [43, 4, 237, 11, 26, 201, 30, 98] as const
const RAYDIUM_LAUNCHLAB_BUY_EXACT_IN_DISC = [250, 234, 13, 123, 213, 156, 19, 236] as const
const METEORA_SWAP_DISC = [248, 198, 158, 145, 225, 117, 135, 200] as const

// ── Program IDs ──

const PUMPFUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
const PUMPSWAP_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'
const RAYDIUM_CPMM_PROGRAM = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'
const RAYDIUM_CLMM_PROGRAM = 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK'
const RAYDIUM_LAUNCHLAB_PROGRAM = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj'
const METEORA_DBC_PROGRAM = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
const METEORA_DAMMV2_PROGRAM = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG'

// ── Shared addresses ──

const USER = 'User111111111111111111111111111111111111111'
const TOKEN_MINT = 'TknMint1111111111111111111111111111111111111'
const POOL = 'Pool111111111111111111111111111111111111111'

function tb(accountIndex: number, mint: string, amount: string, decimals: number, owner: string): TokenBalance {
  return {
    accountIndex,
    mint,
    owner,
    uiTokenAmount: {
      amount,
      decimals,
      uiAmount: null,
    },
  }
}

describe('integration: end-to-end per protocol', () => {
  test('PumpFun buy', () => {
    // PumpFun buy: user spends SOL natively (no WSOL token account), receives token.
    // The SOL input comes purely from native lamport balance delta.
    // Account layout: [0]=globalConfig, [1]=feeRecipient, [2]=mint, [3]=bondingCurve,
    //                  [4]=assocBondingCurve, [5]=assocUser, [6]=user
    // POOL_ACCOUNT_INDEX = 3
    const solSpent = 100_000_000n // 0.1 SOL
    const tokenReceived = 500_000n // 500k tokens (6 decimals)

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

    // Native SOL: user pays 100M lamports + 5000 fee. No WSOL token balance entries.
    const notification: TransactionNotification = {
      signature: 'pumpfun-buy-sig',
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
          loadedAddresses: null,
        },
        transaction: {
          signatures: ['pumpfun-buy-sig'],
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

    const outcome = parseTransactionDetailed(notification)

    expect(outcome.kind).toBe('swap')
    const swap = outcome.swap!
    expect(swap.swapType).toBe('pumpfun-buy')
    expect(swap.inputMint).toBe(SOL_MINT)
    expect(swap.outputMint).toBe(TOKEN_MINT)
    expect(swap.inputRaw).toBe('100000000')
    expect(swap.outputRaw).toBe('500000')
    expect(swap.user).toBe(USER)
    expect(swap.pool).toBe(POOL)
    // PumpFun uses native SOL (no WSOL token balance), so IDL score is medium
    // because the token delta state only sees TOKEN_MINT (not SOL).
    expect(swap.confidence).toBe('medium')
  })

  test('PumpSwap buy', () => {
    // PumpSwap buy: user spends quote (WSOL via token account), receives base (token).
    // Account layout: [0]=pool, [1]=user, [2]=globalConfig, [3]=baseMint, [4]=quoteMint, ...
    // POOL_ACCOUNT_INDEX = 0
    const quoteIn = 200_000_000n // 0.2 SOL
    const baseOut = 1_000_000n // 1M tokens (6 decimals)

    // buy: [disc][base_amount_out][max_quote_amount_in]
    const data = encodeIxData([...PUMPSWAP_BUY_DISC], baseOut, quoteIn)

    const accounts = [
      POOL, // 0 pool
      USER, // 1 user (signer)
      'GlobalCfg22222222222222222222222222222222222', // 2 globalConfig
      TOKEN_MINT, // 3 baseMint
      WSOL_MINT, // 4 quoteMint
      'UserBaseATA1111111111111111111111111111111111', // 5
      'UserQuoteATA111111111111111111111111111111111', // 6
      'PoolBaseVault11111111111111111111111111111111', // 7
      'PoolQuoteVault1111111111111111111111111111111', // 8
    ]

    // Native SOL only drops by fee (5000). WSOL token balance carries swap amount.
    const notification: TransactionNotification = {
      signature: 'pumpswap-buy-sig',
      slot: 200,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000],
          postBalances: [1_000_000_000 - 5000],
          preTokenBalances: [tb(0, TOKEN_MINT, '0', 6, USER), tb(0, WSOL_MINT, '200000000', 9, USER)],
          postTokenBalances: [tb(0, TOKEN_MINT, '1000000', 6, USER), tb(0, WSOL_MINT, '0', 9, USER)],
          innerInstructions: [],
          loadedAddresses: null,
        },
        transaction: {
          signatures: ['pumpswap-buy-sig'],
          message: {
            accountKeys: [USER],
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [
              {
                programId: PUMPSWAP_PROGRAM,
                accounts,
                data,
              },
            ],
          },
        },
      },
    }

    const outcome = parseTransactionDetailed(notification)

    expect(outcome.kind).toBe('swap')
    const swap = outcome.swap!
    expect(swap.swapType).toBe('pumpswap-buy')
    expect(swap.inputMint).toBe(SOL_MINT)
    expect(swap.outputMint).toBe(TOKEN_MINT)
    expect(swap.inputRaw).toBe('200000000')
    expect(swap.outputRaw).toBe('1000000')
    expect(swap.user).toBe(USER)
    expect(swap.pool).toBe(POOL)
    // WSOL mint in deltasByOwner is not normalized, so IDL scoring sees partial match => medium
    expect(swap.confidence).toBe('medium')
  })

  test('Raydium CPMM buy', () => {
    // Raydium CPMM swap_base_input: user sends WSOL (input mint), receives token (output mint).
    // Account layout: [0]=payer, [1]=authority, [2]=ammConfig, [3]=poolState,
    //                  [4]=inputTokenAccount, [5]=outputTokenAccount, [6]=inputVault,
    //                  [7]=outputVault, [8]=tokenProgram, [9]=tokenProgram2022,
    //                  [10]=inputTokenMint, [11]=outputTokenMint
    // POOL_ACCOUNT_INDEX = 3
    const amountIn = 50_000_000n // 0.05 SOL
    const minAmountOut = 250_000n

    const data = encodeIxData([...RAYDIUM_CPMM_SWAP_BASE_INPUT_DISC], amountIn, minAmountOut)

    const accounts = [
      USER, // 0 payer (signer)
      'Authority11111111111111111111111111111111111', // 1 authority
      'AmmConfig11111111111111111111111111111111111', // 2 ammConfig
      POOL, // 3 poolState (pool)
      'InputTokenAcct11111111111111111111111111111', // 4 inputTokenAccount
      'OutputTokenAcc11111111111111111111111111111', // 5 outputTokenAccount
      'InputVault11111111111111111111111111111111111', // 6 inputVault
      'OutputVault1111111111111111111111111111111111', // 7 outputVault
      'TokenProgram111111111111111111111111111111111', // 8 tokenProgram
      'TokenProg202211111111111111111111111111111111', // 9 tokenProgram2022
      WSOL_MINT, // 10 inputTokenMint (WSOL = buying)
      TOKEN_MINT, // 11 outputTokenMint
    ]

    // Native SOL only drops by fee. WSOL token balance carries the swap amount.
    const notification: TransactionNotification = {
      signature: 'raydium-cpmm-buy-sig',
      slot: 300,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000],
          postBalances: [1_000_000_000 - 5000],
          preTokenBalances: [tb(0, TOKEN_MINT, '0', 6, USER), tb(0, WSOL_MINT, '50000000', 9, USER)],
          postTokenBalances: [tb(0, TOKEN_MINT, '250000', 6, USER), tb(0, WSOL_MINT, '0', 9, USER)],
          innerInstructions: [],
          loadedAddresses: null,
        },
        transaction: {
          signatures: ['raydium-cpmm-buy-sig'],
          message: {
            accountKeys: [USER],
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [
              {
                programId: RAYDIUM_CPMM_PROGRAM,
                accounts,
                data,
              },
            ],
          },
        },
      },
    }

    const outcome = parseTransactionDetailed(notification)

    expect(outcome.kind).toBe('swap')
    const swap = outcome.swap!
    expect(swap.swapType).toBe('raydium-cpmm-buy')
    expect(swap.inputMint).toBe(SOL_MINT)
    expect(swap.outputMint).toBe(TOKEN_MINT)
    expect(swap.inputRaw).toBe('50000000')
    expect(swap.outputRaw).toBe('250000')
    expect(swap.user).toBe(USER)
    expect(swap.pool).toBe(POOL)
    expect(swap.confidence).toBe('medium')
  })

  test('Raydium CLMM buy', () => {
    // Raydium CLMM swap_v2: user sends WSOL (input mint), receives token (output mint).
    // Account layout: [0]=payer, [1]=ammConfig, [2]=poolState, [3]=inputTokenAccount,
    //                  [4]=outputTokenAccount, [5]=inputVault, [6]=outputVault,
    //                  [7]=observationState, [8]=tokenProgram, [9]=tokenProgram2022,
    //                  [10]=memoProgram, [11]=inputVaultMint, [12]=outputVaultMint
    // POOL_ACCOUNT_INDEX = 2
    const amountIn = 75_000_000n // 0.075 SOL
    const minAmountOut = 350_000n

    const data = encodeIxData([...RAYDIUM_CLMM_SWAP_V2_DISC], amountIn, minAmountOut)

    const accounts = [
      USER, // 0 payer (signer)
      'AmmConfig31111111111111111111111111111111111', // 1 ammConfig
      POOL, // 2 poolState (pool)
      'InputTokenAcct31111111111111111111111111111', // 3 inputTokenAccount
      'OutputTokenAcc31111111111111111111111111111', // 4 outputTokenAccount
      'InputVault31111111111111111111111111111111111', // 5 inputVault
      'OutputVault3111111111111111111111111111111111', // 6 outputVault
      'Observation3111111111111111111111111111111111', // 7 observationState
      'TokenProgram311111111111111111111111111111111', // 8 tokenProgram
      'TokenProg202231111111111111111111111111111111', // 9 tokenProgram2022
      'MemoProgram3111111111111111111111111111111111', // 10 memoProgram
      WSOL_MINT, // 11 inputVaultMint (WSOL = buying)
      TOKEN_MINT, // 12 outputVaultMint
    ]

    // Native SOL only drops by fee. WSOL token balance carries the swap amount.
    const notification: TransactionNotification = {
      signature: 'raydium-clmm-buy-sig',
      slot: 350,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000],
          postBalances: [1_000_000_000 - 5000],
          preTokenBalances: [tb(0, TOKEN_MINT, '0', 6, USER), tb(0, WSOL_MINT, '75000000', 9, USER)],
          postTokenBalances: [tb(0, TOKEN_MINT, '350000', 6, USER), tb(0, WSOL_MINT, '0', 9, USER)],
          innerInstructions: [],
          loadedAddresses: null,
        },
        transaction: {
          signatures: ['raydium-clmm-buy-sig'],
          message: {
            accountKeys: [USER],
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [
              {
                programId: RAYDIUM_CLMM_PROGRAM,
                accounts,
                data,
              },
            ],
          },
        },
      },
    }

    const outcome = parseTransactionDetailed(notification)

    expect(outcome.kind).toBe('swap')
    const swap = outcome.swap!
    expect(swap.swapType).toBe('raydium-clmm-buy')
    expect(swap.inputMint).toBe(SOL_MINT)
    expect(swap.outputMint).toBe(TOKEN_MINT)
    expect(swap.inputRaw).toBe('75000000')
    expect(swap.outputRaw).toBe('350000')
    expect(swap.user).toBe(USER)
    expect(swap.pool).toBe(POOL)
    expect(swap.confidence).toBe('medium')
  })

  test('Raydium LaunchLab buy', () => {
    // Raydium LaunchLab buy_exact_in: user pays quote (WSOL), receives base (token).
    // Account layout: [0]=payer, [1]=authority, [2]=poolState, [3]=baseVault,
    //                  [4]=quoteVault, [5]=userBaseToken, [6]=userQuoteToken,
    //                  [7]=baseTokenProgram, [8]=quoteTokenProgram,
    //                  [9]=baseTokenMint, [10]=quoteTokenMint
    // data = [disc][amount_in][min_amount_out][share_fee_rate(u64)]
    // POOL_ACCOUNT_INDEX = 2
    const amountIn = 300_000_000n // 0.3 SOL
    const minAmountOut = 750_000n
    const shareFeeRate = 0n

    const data = encodeBase58(
      Uint8Array.from([
        ...RAYDIUM_LAUNCHLAB_BUY_EXACT_IN_DISC,
        ...u64le(amountIn),
        ...u64le(minAmountOut),
        ...u64le(shareFeeRate),
      ]),
    )

    const accounts = [
      USER, // 0 payer (signer)
      'Authority21111111111111111111111111111111111', // 1 authority
      POOL, // 2 poolState (pool)
      'BaseVault11111111111111111111111111111111111', // 3 baseVault
      'QuoteVault1111111111111111111111111111111111', // 4 quoteVault
      'UserBase111111111111111111111111111111111111', // 5 userBaseToken
      'UserQuote11111111111111111111111111111111111', // 6 userQuoteToken
      'BaseTknProg111111111111111111111111111111111', // 7 baseTokenProgram
      'QuoteTknPrg111111111111111111111111111111111', // 8 quoteTokenProgram
      TOKEN_MINT, // 9 baseTokenMint
      WSOL_MINT, // 10 quoteTokenMint
    ]

    // Native SOL only drops by fee. WSOL token balance carries the swap amount.
    const notification: TransactionNotification = {
      signature: 'raydium-ll-buy-sig',
      slot: 400,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000],
          postBalances: [1_000_000_000 - 5000],
          preTokenBalances: [tb(0, TOKEN_MINT, '0', 6, USER), tb(0, WSOL_MINT, '300000000', 9, USER)],
          postTokenBalances: [tb(0, TOKEN_MINT, '750000', 6, USER), tb(0, WSOL_MINT, '0', 9, USER)],
          innerInstructions: [],
          loadedAddresses: null,
        },
        transaction: {
          signatures: ['raydium-ll-buy-sig'],
          message: {
            accountKeys: [USER],
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [
              {
                programId: RAYDIUM_LAUNCHLAB_PROGRAM,
                accounts,
                data,
              },
            ],
          },
        },
      },
    }

    const outcome = parseTransactionDetailed(notification)

    expect(outcome.kind).toBe('swap')
    const swap = outcome.swap!
    expect(swap.swapType).toBe('raydium-launchlab-buy')
    expect(swap.inputMint).toBe(SOL_MINT)
    expect(swap.outputMint).toBe(TOKEN_MINT)
    expect(swap.inputRaw).toBe('300000000')
    expect(swap.outputRaw).toBe('750000')
    expect(swap.user).toBe(USER)
    expect(swap.pool).toBe(POOL)
    expect(swap.confidence).toBe('medium')
  })

  test('Meteora DBC buy', () => {
    // Meteora DBC swap: user spends WSOL (via token account), receives token.
    // Account layout: [0]=pool, [1]=??, [2]=??, [3]=inputTokenAccount,
    //                  [4]=??, [5]=??, [6]=??, [7]=mintA, [8]=mintB, [9]=payer
    // POOL_ACCOUNT_INDEX = 0
    // inputTokenAccountIndex = 3, mintAIndex = 7, mintBIndex = 8, payerIndex = 9
    //
    // Direction resolution: the parser finds which mint the inputTokenAccount holds
    // by matching accountIndex in token balances. mintB=WSOL is the input => buy.
    const amountIn = 150_000_000n // 0.15 SOL
    const minAmountOut = 600_000n

    const data = encodeIxData([...METEORA_SWAP_DISC], amountIn, minAmountOut)

    const inputTokenAccount = 'InputTknAccDBC11111111111111111111111111111'

    const accounts = [
      POOL, // 0 pool
      'DbcAcct1111111111111111111111111111111111111', // 1
      'DbcAcct2222222222222222222222222222222222222', // 2
      inputTokenAccount, // 3 inputTokenAccount
      'DbcAcct4444444444444444444444444444444444444', // 4
      'DbcAcct5555555555555555555555555555555555555', // 5
      'DbcAcct6666666666666666666666666666666666666', // 6
      TOKEN_MINT, // 7 mintA
      WSOL_MINT, // 8 mintB
      USER, // 9 payer (signer)
    ]

    // allKeys = [USER, inputTokenAccount] (from accountKeys).
    // inputTokenAccount is at allKeys index 1.
    // Token balance entry for inputTokenAccount uses accountIndex=1 to link them.
    // Native SOL only drops by fee.
    const notification: TransactionNotification = {
      signature: 'meteora-dbc-buy-sig',
      slot: 500,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000, 0],
          postBalances: [1_000_000_000 - 5000, 0],
          preTokenBalances: [
            tb(0, TOKEN_MINT, '0', 6, USER),
            tb(0, WSOL_MINT, '150000000', 9, USER),
            // inputTokenAccount holds WSOL at allKeys index 1
            tb(1, WSOL_MINT, '150000000', 9, inputTokenAccount),
          ],
          postTokenBalances: [
            tb(0, TOKEN_MINT, '600000', 6, USER),
            tb(0, WSOL_MINT, '0', 9, USER),
            tb(1, WSOL_MINT, '0', 9, inputTokenAccount),
          ],
          innerInstructions: [],
          loadedAddresses: null,
        },
        transaction: {
          signatures: ['meteora-dbc-buy-sig'],
          message: {
            accountKeys: [USER, inputTokenAccount],
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [
              {
                programId: METEORA_DBC_PROGRAM,
                accounts,
                data,
              },
            ],
          },
        },
      },
    }

    const outcome = parseTransactionDetailed(notification)

    expect(outcome.kind).toBe('swap')
    const swap = outcome.swap!
    expect(swap.swapType).toBe('meteora-dbc-buy')
    expect(swap.inputMint).toBe(SOL_MINT)
    expect(swap.outputMint).toBe(TOKEN_MINT)
    expect(swap.inputRaw).toBe('150000000')
    expect(swap.outputRaw).toBe('600000')
    expect(swap.user).toBe(USER)
    expect(swap.pool).toBe(POOL)
    expect(swap.confidence).toBe('medium')
  })

  test('Meteora DAMMv2 buy', () => {
    // Meteora DAMMv2 swap: user spends WSOL (via token account), receives token.
    // Account layout: [0]=pool, [1]=??, [2]=inputTokenAccount, [3]=??,
    //                  [4]=??, [5]=??, [6]=mintA, [7]=mintB, [8]=payer
    // POOL_ACCOUNT_INDEX = 0
    // inputTokenAccountIndex = 2, mintAIndex = 6, mintBIndex = 7, payerIndex = 8
    const amountIn = 80_000_000n // 0.08 SOL
    const minAmountOut = 400_000n

    const data = encodeIxData([...METEORA_SWAP_DISC], amountIn, minAmountOut)

    const inputTokenAccount = 'InputTknAccDAMM1111111111111111111111111111'

    const accounts = [
      POOL, // 0 pool
      'DammAcct111111111111111111111111111111111111', // 1
      inputTokenAccount, // 2 inputTokenAccount
      'DammAcct333333333333333333333333333333333333', // 3
      'DammAcct444444444444444444444444444444444444', // 4
      'DammAcct555555555555555555555555555555555555', // 5
      TOKEN_MINT, // 6 mintA
      WSOL_MINT, // 7 mintB
      USER, // 8 payer (signer)
    ]

    // allKeys = [USER, inputTokenAccount]. inputTokenAccount at index 1.
    // Native SOL only drops by fee.
    const notification: TransactionNotification = {
      signature: 'meteora-dammv2-buy-sig',
      slot: 600,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000, 0],
          postBalances: [1_000_000_000 - 5000, 0],
          preTokenBalances: [
            tb(0, TOKEN_MINT, '0', 6, USER),
            tb(0, WSOL_MINT, '80000000', 9, USER),
            // inputTokenAccount holds WSOL at allKeys index 1
            tb(1, WSOL_MINT, '80000000', 9, inputTokenAccount),
          ],
          postTokenBalances: [
            tb(0, TOKEN_MINT, '400000', 6, USER),
            tb(0, WSOL_MINT, '0', 9, USER),
            tb(1, WSOL_MINT, '0', 9, inputTokenAccount),
          ],
          innerInstructions: [],
          loadedAddresses: null,
        },
        transaction: {
          signatures: ['meteora-dammv2-buy-sig'],
          message: {
            accountKeys: [USER, inputTokenAccount],
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [
              {
                programId: METEORA_DAMMV2_PROGRAM,
                accounts,
                data,
              },
            ],
          },
        },
      },
    }

    const outcome = parseTransactionDetailed(notification)

    expect(outcome.kind).toBe('swap')
    const swap = outcome.swap!
    expect(swap.swapType).toBe('meteora-dammv2-buy')
    expect(swap.inputMint).toBe(SOL_MINT)
    expect(swap.outputMint).toBe(TOKEN_MINT)
    expect(swap.inputRaw).toBe('80000000')
    expect(swap.outputRaw).toBe('400000')
    expect(swap.user).toBe(USER)
    expect(swap.pool).toBe(POOL)
    expect(swap.confidence).toBe('medium')
  })
})
