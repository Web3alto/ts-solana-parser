import { describe, expect, test } from 'bun:test'
import { SOL_MINT, WSOL_MINT } from '../src/constants.ts'
import { encodeBase58 } from '../src/idl/codec.ts'
import { parseSwapDetailed } from '../src/parse-swap.ts'
import type { TokenBalance, TransactionNotification } from '../src/types.ts'
import { encodeIxData, notificationToSwapInput, u64le } from './helpers.ts'

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
const METEORA_DAMM_PROGRAM = 'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB'
const METEORA_DLMM_PROGRAM = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo'
const RAYDIUM_AMM_PROGRAM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'

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

    const outcome = parseSwapDetailed(notificationToSwapInput(notification))

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

    const outcome = parseSwapDetailed(notificationToSwapInput(notification))

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

    const outcome = parseSwapDetailed(notificationToSwapInput(notification))

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

    const outcome = parseSwapDetailed(notificationToSwapInput(notification))

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

    const outcome = parseSwapDetailed(notificationToSwapInput(notification))

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

    const outcome = parseSwapDetailed(notificationToSwapInput(notification))

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

  test('RaydiumAMM swapBaseIn buy', () => {
    // Raydium AMM (legacy): 1-byte instruction index, not Anchor discriminator.
    // swapBaseIn = instruction 9, data = [1 byte index][8 amountIn][8 minAmountOut]
    // Account layout (18 accounts for swap):
    //   [1]=amm (pool), [15]=userSourceTokenAccount, [16]=userDestTokenAccount, [17]=userSourceOwner (signer)
    // POOL_ACCOUNT_INDEX = 1
    const amountIn = 60_000_000n // 0.06 SOL
    const minAmountOut = 300_000n

    const data = encodeBase58(Uint8Array.from([9, ...u64le(amountIn), ...u64le(minAmountOut)]))

    const sourceTokenAccount = 'SrcTknAccRAMM11111111111111111111111111111'
    const destTokenAccount = 'DstTknAccRAMM11111111111111111111111111111'

    // Build 18 accounts: [0]-[14] are fillers except [1]=POOL, then [15]=source, [16]=dest, [17]=USER
    const accounts: string[] = [
      'RaydiumFiller001111111111111111111111111111', // 0 tokenProgram
      POOL, // 1 amm (pool)
      'RaydiumFiller021111111111111111111111111111', // 2 ammAuthority
      'RaydiumFiller031111111111111111111111111111', // 3 ammOpenOrders
      'RaydiumFiller041111111111111111111111111111', // 4 ammTargetOrders
      'RaydiumFiller051111111111111111111111111111', // 5 poolCoinTokenAccount
      'RaydiumFiller061111111111111111111111111111', // 6 poolPcTokenAccount
      'RaydiumFiller071111111111111111111111111111', // 7 serumProgram
      'RaydiumFiller081111111111111111111111111111', // 8 serumMarket
      'RaydiumFiller091111111111111111111111111111', // 9 serumBids
      'RaydiumFiller101111111111111111111111111111', // 10 serumAsks
      'RaydiumFiller111111111111111111111111111111', // 11 serumEventQueue
      'RaydiumFiller121111111111111111111111111111', // 12 serumCoinVault
      'RaydiumFiller131111111111111111111111111111', // 13 serumPcVault
      'RaydiumFiller141111111111111111111111111111', // 14 serumVaultSigner
      sourceTokenAccount, // 15 userSourceTokenAccount
      destTokenAccount, // 16 userDestTokenAccount
      USER, // 17 userSourceOwner (signer)
    ]

    // allKeys = [USER, sourceTokenAccount, destTokenAccount]
    // sourceTokenAccount is at allKeys index 1, destTokenAccount at index 2.
    // Token balances link source to WSOL, dest to TOKEN_MINT.
    const notification: TransactionNotification = {
      signature: 'raydium-amm-buy-sig',
      slot: 700,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000, 0, 0],
          postBalances: [1_000_000_000 - 5000, 0, 0],
          preTokenBalances: [
            tb(0, TOKEN_MINT, '0', 6, USER),
            tb(0, WSOL_MINT, '60000000', 9, USER),
            // sourceTokenAccount holds WSOL at allKeys index 1
            tb(1, WSOL_MINT, '60000000', 9, sourceTokenAccount),
            // destTokenAccount holds TOKEN_MINT at allKeys index 2
            tb(2, TOKEN_MINT, '0', 6, destTokenAccount),
          ],
          postTokenBalances: [
            tb(0, TOKEN_MINT, '300000', 6, USER),
            tb(0, WSOL_MINT, '0', 9, USER),
            tb(1, WSOL_MINT, '0', 9, sourceTokenAccount),
            tb(2, TOKEN_MINT, '300000', 6, destTokenAccount),
          ],
          innerInstructions: [],
          loadedAddresses: null,
        },
        transaction: {
          signatures: ['raydium-amm-buy-sig'],
          message: {
            accountKeys: [USER, sourceTokenAccount, destTokenAccount],
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [
              {
                programId: RAYDIUM_AMM_PROGRAM,
                accounts,
                data,
              },
            ],
          },
        },
      },
    }

    const outcome = parseSwapDetailed(notificationToSwapInput(notification))

    expect(outcome.kind).toBe('swap')
    const swap = outcome.swap!
    expect(swap.swapType).toBe('raydium-amm-buy')
    expect(swap.inputMint).toBe(SOL_MINT)
    expect(swap.outputMint).toBe(TOKEN_MINT)
    expect(swap.inputRaw).toBe('60000000')
    expect(swap.outputRaw).toBe('300000')
    expect(swap.user).toBe(USER)
    expect(swap.pool).toBe(POOL)
    expect(swap.confidence).toBe('medium')
  })

  test('MeteoraDAMM buy', () => {
    // Meteora DAMM swap: user spends WSOL (via token account), receives token.
    // Account layout: [0]=pool, [1]=userSourceToken, [2]=userDestinationToken, [12]=user (signer)
    // POOL_ACCOUNT_INDEX = 0
    // Anchor discriminator sha256("global:swap")[0..8]
    const amountIn = 120_000_000n // 0.12 SOL
    const minAmountOut = 550_000n

    const data = encodeIxData([...METEORA_SWAP_DISC], amountIn, minAmountOut)

    const sourceTokenAccount = 'SrcTknAccDAMM11111111111111111111111111111'
    const destTokenAccount = 'DstTknAccDAMM11111111111111111111111111111'

    // Build 13 accounts: [0]=pool, [1]=sourceToken, [2]=destToken, [3]-[11]=fillers, [12]=user
    const accounts: string[] = [
      POOL, // 0 pool
      sourceTokenAccount, // 1 userSourceToken
      destTokenAccount, // 2 userDestinationToken
      'DammFiller03111111111111111111111111111111', // 3
      'DammFiller04111111111111111111111111111111', // 4
      'DammFiller05111111111111111111111111111111', // 5
      'DammFiller06111111111111111111111111111111', // 6
      'DammFiller07111111111111111111111111111111', // 7
      'DammFiller08111111111111111111111111111111', // 8
      'DammFiller09111111111111111111111111111111', // 9
      'DammFiller10111111111111111111111111111111', // 10
      'DammFiller11111111111111111111111111111111', // 11
      USER, // 12 user (signer)
    ]

    // allKeys = [USER, sourceTokenAccount, destTokenAccount]
    // sourceTokenAccount at allKeys index 1, destTokenAccount at index 2.
    const notification: TransactionNotification = {
      signature: 'meteora-damm-buy-sig',
      slot: 800,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000, 0, 0],
          postBalances: [1_000_000_000 - 5000, 0, 0],
          preTokenBalances: [
            tb(0, TOKEN_MINT, '0', 6, USER),
            tb(0, WSOL_MINT, '120000000', 9, USER),
            // sourceTokenAccount holds WSOL at allKeys index 1
            tb(1, WSOL_MINT, '120000000', 9, sourceTokenAccount),
            // destTokenAccount holds TOKEN_MINT at allKeys index 2
            tb(2, TOKEN_MINT, '0', 6, destTokenAccount),
          ],
          postTokenBalances: [
            tb(0, TOKEN_MINT, '550000', 6, USER),
            tb(0, WSOL_MINT, '0', 9, USER),
            tb(1, WSOL_MINT, '0', 9, sourceTokenAccount),
            tb(2, TOKEN_MINT, '550000', 6, destTokenAccount),
          ],
          innerInstructions: [],
          loadedAddresses: null,
        },
        transaction: {
          signatures: ['meteora-damm-buy-sig'],
          message: {
            accountKeys: [USER, sourceTokenAccount, destTokenAccount],
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [
              {
                programId: METEORA_DAMM_PROGRAM,
                accounts,
                data,
              },
            ],
          },
        },
      },
    }

    const outcome = parseSwapDetailed(notificationToSwapInput(notification))

    expect(outcome.kind).toBe('swap')
    const swap = outcome.swap!
    expect(swap.swapType).toBe('meteora-damm-buy')
    expect(swap.inputMint).toBe(SOL_MINT)
    expect(swap.outputMint).toBe(TOKEN_MINT)
    expect(swap.inputRaw).toBe('120000000')
    expect(swap.outputRaw).toBe('550000')
    expect(swap.user).toBe(USER)
    expect(swap.pool).toBe(POOL)
    expect(swap.confidence).toBe('medium')
  })

  test('MeteoraDLMM buy', () => {
    // Meteora DLMM swap: user spends WSOL (via token account), receives token.
    // Account layout: [0]=lb_pair (pool), [4]=user_token_in, [5]=user_token_out,
    //                  [6]=token_x_mint, [7]=token_y_mint, [10]=user (signer)
    // POOL_ACCOUNT_INDEX = 0
    // Anchor discriminator sha256("global:swap")[0..8]
    const amountIn = 90_000_000n // 0.09 SOL
    const minAmountOut = 450_000n

    const data = encodeIxData([...METEORA_SWAP_DISC], amountIn, minAmountOut)

    const userTokenIn = 'UserTknInDLMM11111111111111111111111111111'

    // Build 11 accounts: [0]=pool, [1]-[3]=fillers, [4]=userTokenIn, [5]=userTokenOut,
    //                     [6]=tokenXMint, [7]=tokenYMint, [8]-[9]=fillers, [10]=user
    const accounts: string[] = [
      POOL, // 0 lb_pair (pool)
      'DlmmFiller01111111111111111111111111111111', // 1 binArrayBitmapExtension
      'DlmmFiller02111111111111111111111111111111', // 2 reserveX
      'DlmmFiller03111111111111111111111111111111', // 3 reserveY
      userTokenIn, // 4 user_token_in
      'UserTknOutDLMM1111111111111111111111111111', // 5 user_token_out
      TOKEN_MINT, // 6 token_x_mint
      WSOL_MINT, // 7 token_y_mint
      'DlmmFiller08111111111111111111111111111111', // 8 oracle
      'DlmmFiller09111111111111111111111111111111', // 9 hostFeeIn
      USER, // 10 user (signer)
    ]

    // allKeys = [USER, userTokenIn]
    // userTokenIn is at allKeys index 1.
    // Token balance: userTokenIn holds WSOL => resolveDirection sees inputMint=WSOL_MINT (mintY),
    // so tokenFrom=WSOL_MINT (mintY), tokenTo=TOKEN_MINT (mintX), isBuy=true.
    const notification: TransactionNotification = {
      signature: 'meteora-dlmm-buy-sig',
      slot: 900,
      transaction: {
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1_000_000_000, 0],
          postBalances: [1_000_000_000 - 5000, 0],
          preTokenBalances: [
            tb(0, TOKEN_MINT, '0', 6, USER),
            tb(0, WSOL_MINT, '90000000', 9, USER),
            // userTokenIn holds WSOL at allKeys index 1
            tb(1, WSOL_MINT, '90000000', 9, userTokenIn),
          ],
          postTokenBalances: [
            tb(0, TOKEN_MINT, '450000', 6, USER),
            tb(0, WSOL_MINT, '0', 9, USER),
            tb(1, WSOL_MINT, '0', 9, userTokenIn),
          ],
          innerInstructions: [],
          loadedAddresses: null,
        },
        transaction: {
          signatures: ['meteora-dlmm-buy-sig'],
          message: {
            accountKeys: [USER, userTokenIn],
            recentBlockhash: '11111111111111111111111111111111',
            instructions: [
              {
                programId: METEORA_DLMM_PROGRAM,
                accounts,
                data,
              },
            ],
          },
        },
      },
    }

    const outcome = parseSwapDetailed(notificationToSwapInput(notification))

    expect(outcome.kind).toBe('swap')
    const swap = outcome.swap!
    expect(swap.swapType).toBe('meteora-dlmm-buy')
    expect(swap.inputMint).toBe(SOL_MINT)
    expect(swap.outputMint).toBe(TOKEN_MINT)
    expect(swap.inputRaw).toBe('90000000')
    expect(swap.outputRaw).toBe('450000')
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

    const outcome = parseSwapDetailed(notificationToSwapInput(notification))

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
