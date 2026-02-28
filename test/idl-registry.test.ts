import { describe, expect, test } from 'bun:test'
import { encodeBase58 } from '../src/idl/codec.ts'
import { tryParseInstruction } from '../src/idl/registry.ts'
import type { ParseContext } from '../src/idl/types.ts'
import { NATIVE_SOL_MINT } from '../src/idl/types.ts'
import { encodeIxData, tokenBalance, u64le } from './helpers.ts'

const PUMPFUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
const PUMPSWAP_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'
const RAYDIUM_CPMM_PROGRAM = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'
const RAYDIUM_LAUNCHLAB_PROGRAM = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj'
const METEORA_DBC_PROGRAM = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
const METEORA_DAMMV2_PROGRAM = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG'

describe('IDL registry', () => {
  test('parses PumpFun buy', () => {
    const BUY_DISC = [102, 6, 61, 18, 1, 218, 235, 234] as const
    const mint = 'Mint111111111111111111111111111111111111111'
    const signer = 'User111111111111111111111111111111111111111'
    const accounts = ['a0', 'a1', mint, 'a3', 'a4', 'a5', signer]
    const data = encodeIxData(BUY_DISC, 1500n, 25_000_000n)

    const parsed = tryParseInstruction(PUMPFUN_PROGRAM, accounts, data)

    expect(parsed).not.toBeNull()
    expect(parsed?.type).toBe('pumpfun-buy')
    expect(parsed?.tokenFrom).toBe(NATIVE_SOL_MINT)
    expect(parsed?.tokenTo).toBe(mint)
    expect(parsed?.amountFrom).toBe(25_000_000n)
    expect(parsed?.amountTo).toBe(1500n)
    expect(parsed?.signer).toBe(signer)
  })

  test('parses PumpSwap buy_exact_quote_in', () => {
    const BUY_EXACT_QUOTE_IN_DISC = [198, 46, 21, 82, 180, 217, 232, 112] as const
    const baseMint = 'Base111111111111111111111111111111111111111'
    const signer = 'User111111111111111111111111111111111111111'
    const accounts = ['a0', signer, 'a2', baseMint, NATIVE_SOL_MINT]
    const data = encodeIxData(BUY_EXACT_QUOTE_IN_DISC, 123_000_000n, 9_999n)

    const parsed = tryParseInstruction(PUMPSWAP_PROGRAM, accounts, data)

    expect(parsed).not.toBeNull()
    expect(parsed?.type).toBe('pumpswap-buy')
    expect(parsed?.tokenFrom).toBe(NATIVE_SOL_MINT)
    expect(parsed?.tokenTo).toBe(baseMint)
    expect(parsed?.amountFrom).toBe(123_000_000n)
    expect(parsed?.amountTo).toBe(9_999n)
    expect(parsed?.signer).toBe(signer)
  })

  test('parses Raydium CPMM swap_base_input', () => {
    const SWAP_BASE_INPUT_DISC = [143, 190, 90, 218, 196, 30, 51, 222] as const
    const signer = 'User111111111111111111111111111111111111111'
    const outputMint = 'Out1111111111111111111111111111111111111111'
    const accounts = new Array<string>(12).fill('x')
    accounts[0] = signer
    accounts[10] = NATIVE_SOL_MINT
    accounts[11] = outputMint
    const data = encodeIxData(SWAP_BASE_INPUT_DISC, 2_000_000_000n, 20_000n)

    const parsed = tryParseInstruction(RAYDIUM_CPMM_PROGRAM, accounts, data)

    expect(parsed).not.toBeNull()
    expect(parsed?.type).toBe('raydium-cpmm-buy')
    expect(parsed?.tokenFrom).toBe(NATIVE_SOL_MINT)
    expect(parsed?.tokenTo).toBe(outputMint)
    expect(parsed?.amountFrom).toBe(2_000_000_000n)
    expect(parsed?.amountTo).toBe(20_000n)
    expect(parsed?.signer).toBe(signer)
  })

  test('parses Raydium LaunchLab sell_exact_out', () => {
    const SELL_EXACT_OUT_DISC = [95, 200, 71, 34, 8, 9, 11, 166] as const
    const signer = 'User111111111111111111111111111111111111111'
    const baseMint = 'Base111111111111111111111111111111111111111'
    const quoteMint = NATIVE_SOL_MINT
    const accounts = new Array<string>(11).fill('x')
    accounts[0] = signer
    accounts[9] = baseMint
    accounts[10] = quoteMint
    const data = encodeBase58(
      Uint8Array.from([...SELL_EXACT_OUT_DISC, ...u64le(150_000_000n), ...u64le(12_345n), ...u64le(0n)]),
    )

    const parsed = tryParseInstruction(RAYDIUM_LAUNCHLAB_PROGRAM, accounts, data)

    expect(parsed).not.toBeNull()
    expect(parsed?.type).toBe('raydium-launchlab-sell')
    expect(parsed?.tokenFrom).toBe(baseMint)
    expect(parsed?.tokenTo).toBe(quoteMint)
    expect(parsed?.amountFrom).toBe(12_345n)
    expect(parsed?.amountTo).toBe(150_000_000n)
    expect(parsed?.signer).toBe(signer)
  })

  test('parses Meteora DBC swap', () => {
    const SWAP_DISC = [248, 198, 158, 145, 225, 117, 135, 200] as const
    const accounts = new Array<string>(10).fill('x')
    accounts[3] = 'InputAccount1111111111111111111111111111111'
    accounts[7] = 'TokenA1111111111111111111111111111111111111'
    accounts[8] = NATIVE_SOL_MINT
    accounts[9] = 'Signer1111111111111111111111111111111111111'
    const data = encodeIxData(SWAP_DISC, 111_000_000n, 22_000n)
    const ctx: ParseContext = {
      allKeys: accounts,
      preTokenBalances: [tokenBalance(3, NATIVE_SOL_MINT)],
      postTokenBalances: [],
    }

    const parsed = tryParseInstruction(METEORA_DBC_PROGRAM, accounts, data, ctx)

    expect(parsed).not.toBeNull()
    expect(parsed?.type).toBe('meteora-dbc-buy')
    expect(parsed?.tokenFrom).toBe(NATIVE_SOL_MINT)
    expect(parsed?.tokenTo).toBe(accounts[7])
    expect(parsed?.amountFrom).toBe(111_000_000n)
    expect(parsed?.amountTo).toBe(22_000n)
    expect(parsed?.signer).toBe(accounts[9])
  })

  test('parses Meteora DAMMv2 swap2 exact-out mode', () => {
    const SWAP2_DISC = [65, 75, 63, 76, 235, 91, 91, 136] as const
    const accounts = new Array<string>(9).fill('x')
    const mintA = 'MintA11111111111111111111111111111111111111'
    const mintB = 'MintB11111111111111111111111111111111111111'
    const signer = 'Signer1111111111111111111111111111111111111'
    accounts[2] = 'InputAccount1111111111111111111111111111111'
    accounts[6] = mintA
    accounts[7] = mintB
    accounts[8] = signer
    const data = encodeBase58(
      Uint8Array.from([
        ...SWAP2_DISC,
        ...u64le(77n),
        ...u64le(123n),
        1, // ExactOut: amount_0 is exact out, amount_1 is max in
      ]),
    )
    const ctx: ParseContext = {
      allKeys: accounts,
      preTokenBalances: [tokenBalance(2, mintA)],
      postTokenBalances: [],
    }

    const parsed = tryParseInstruction(METEORA_DAMMV2_PROGRAM, accounts, data, ctx)

    expect(parsed).not.toBeNull()
    expect(parsed?.type).toBe('meteora-dammv2-sell')
    expect(parsed?.tokenFrom).toBe(mintA)
    expect(parsed?.tokenTo).toBe(mintB)
    expect(parsed?.amountFrom).toBe(123n)
    expect(parsed?.amountTo).toBe(77n)
    expect(parsed?.signer).toBe(signer)
  })

  test('parses PumpFun buy_exact_sol_in', () => {
    const BUY_EXACT_SOL_IN_DISC = [56, 252, 116, 8, 158, 223, 205, 95] as const
    const mint = 'Mint111111111111111111111111111111111111111'
    const signer = 'User111111111111111111111111111111111111111'
    const accounts = ['a0', 'a1', mint, 'a3', 'a4', 'a5', signer]
    const solAmount = 5_000_000_000n
    const minTokenOutput = 42_000n
    const data = encodeIxData(BUY_EXACT_SOL_IN_DISC, solAmount, minTokenOutput)

    const parsed = tryParseInstruction(PUMPFUN_PROGRAM, accounts, data)

    expect(parsed).not.toBeNull()
    expect(parsed?.type).toBe('pumpfun-buy')
    expect(parsed?.tokenFrom).toBe(NATIVE_SOL_MINT)
    expect(parsed?.amountFrom).toBe(solAmount)
    expect(parsed?.tokenTo).toBe(mint)
    expect(parsed?.amountTo).toBe(minTokenOutput)
    expect(parsed?.signer).toBe(signer)
  })

  test('parses PumpFun sell', () => {
    const SELL_DISC = [51, 230, 133, 164, 1, 127, 131, 173] as const
    const mint = 'Mint111111111111111111111111111111111111111'
    const signer = 'User111111111111111111111111111111111111111'
    const accounts = ['a0', 'a1', mint, 'a3', 'a4', 'a5', signer]
    const tokenAmount = 100_000n
    const minSolOutput = 3_000_000_000n
    const data = encodeIxData(SELL_DISC, tokenAmount, minSolOutput)

    const parsed = tryParseInstruction(PUMPFUN_PROGRAM, accounts, data)

    expect(parsed).not.toBeNull()
    expect(parsed?.type).toBe('pumpfun-sell')
    expect(parsed?.tokenFrom).toBe(mint)
    expect(parsed?.tokenTo).toBe(NATIVE_SOL_MINT)
    expect(parsed?.amountFrom).toBe(tokenAmount)
    expect(parsed?.amountTo).toBe(minSolOutput)
    expect(parsed?.signer).toBe(signer)
  })

  test('parses PumpSwap buy', () => {
    const BUY_DISC = [102, 6, 61, 18, 1, 218, 235, 234] as const
    const baseMint = 'Base111111111111111111111111111111111111111'
    const signer = 'User111111111111111111111111111111111111111'
    const accounts = ['a0', signer, 'a2', baseMint, NATIVE_SOL_MINT]
    const baseAmountOut = 50_000n
    const maxQuoteAmountIn = 2_000_000_000n
    const data = encodeIxData(BUY_DISC, baseAmountOut, maxQuoteAmountIn)

    const parsed = tryParseInstruction(PUMPSWAP_PROGRAM, accounts, data)

    expect(parsed).not.toBeNull()
    expect(parsed?.type).toBe('pumpswap-buy')
    expect(parsed?.tokenFrom).toBe(NATIVE_SOL_MINT)
    expect(parsed?.amountFrom).toBe(maxQuoteAmountIn)
    expect(parsed?.tokenTo).toBe(baseMint)
    expect(parsed?.amountTo).toBe(baseAmountOut)
    expect(parsed?.signer).toBe(signer)
  })

  test('parses PumpSwap sell', () => {
    const SELL_DISC = [51, 230, 133, 164, 1, 127, 131, 173] as const
    const baseMint = 'Base111111111111111111111111111111111111111'
    const signer = 'User111111111111111111111111111111111111111'
    const accounts = ['a0', signer, 'a2', baseMint, NATIVE_SOL_MINT]
    const baseAmountIn = 10_000n
    const minQuoteAmountOut = 1_500_000_000n
    const data = encodeIxData(SELL_DISC, baseAmountIn, minQuoteAmountOut)

    const parsed = tryParseInstruction(PUMPSWAP_PROGRAM, accounts, data)

    expect(parsed).not.toBeNull()
    expect(parsed?.type).toBe('pumpswap-sell')
    expect(parsed?.tokenFrom).toBe(baseMint)
    expect(parsed?.tokenTo).toBe(NATIVE_SOL_MINT)
    expect(parsed?.amountFrom).toBe(baseAmountIn)
    expect(parsed?.amountTo).toBe(minQuoteAmountOut)
    expect(parsed?.signer).toBe(signer)
  })

  test('parses Raydium LaunchLab buy_exact_in', () => {
    const BUY_EXACT_IN_DISC = [250, 234, 13, 123, 213, 156, 19, 236] as const
    const signer = 'User111111111111111111111111111111111111111'
    const baseMint = 'Base111111111111111111111111111111111111111'
    const quoteMint = NATIVE_SOL_MINT
    const accounts = new Array<string>(11).fill('x')
    accounts[0] = signer
    accounts[9] = baseMint
    accounts[10] = quoteMint
    const amountIn = 1_000_000_000n
    const minAmountOut = 500n
    const data = encodeBase58(
      Uint8Array.from([...BUY_EXACT_IN_DISC, ...u64le(amountIn), ...u64le(minAmountOut), ...u64le(0n)]),
    )

    const parsed = tryParseInstruction(RAYDIUM_LAUNCHLAB_PROGRAM, accounts, data)

    expect(parsed).not.toBeNull()
    expect(parsed?.type).toBe('raydium-launchlab-buy')
    expect(parsed?.tokenFrom).toBe(quoteMint)
    expect(parsed?.amountFrom).toBe(amountIn)
    expect(parsed?.tokenTo).toBe(baseMint)
    expect(parsed?.amountTo).toBe(minAmountOut)
    expect(parsed?.signer).toBe(signer)
  })

  test('parses Raydium LaunchLab buy_exact_out', () => {
    const BUY_EXACT_OUT_DISC = [24, 211, 116, 40, 105, 3, 153, 56] as const
    const signer = 'User111111111111111111111111111111111111111'
    const baseMint = 'Base111111111111111111111111111111111111111'
    const quoteMint = NATIVE_SOL_MINT
    const accounts = new Array<string>(11).fill('x')
    accounts[0] = signer
    accounts[9] = baseMint
    accounts[10] = quoteMint
    const amountOut = 7_777n
    const maxAmountIn = 3_000_000_000n
    const data = encodeBase58(
      Uint8Array.from([...BUY_EXACT_OUT_DISC, ...u64le(amountOut), ...u64le(maxAmountIn), ...u64le(0n)]),
    )

    const parsed = tryParseInstruction(RAYDIUM_LAUNCHLAB_PROGRAM, accounts, data)

    expect(parsed).not.toBeNull()
    expect(parsed?.type).toBe('raydium-launchlab-buy')
    expect(parsed?.tokenFrom).toBe(quoteMint)
    expect(parsed?.amountFrom).toBe(maxAmountIn)
    expect(parsed?.tokenTo).toBe(baseMint)
    expect(parsed?.amountTo).toBe(amountOut)
    expect(parsed?.signer).toBe(signer)
  })

  test('parses Raydium LaunchLab sell_exact_in', () => {
    const SELL_EXACT_IN_DISC = [149, 39, 222, 155, 211, 124, 152, 26] as const
    const signer = 'User111111111111111111111111111111111111111'
    const baseMint = 'Base111111111111111111111111111111111111111'
    const quoteMint = NATIVE_SOL_MINT
    const accounts = new Array<string>(11).fill('x')
    accounts[0] = signer
    accounts[9] = baseMint
    accounts[10] = quoteMint
    const amountIn = 25_000n
    const minAmountOut = 900_000_000n
    const data = encodeBase58(
      Uint8Array.from([...SELL_EXACT_IN_DISC, ...u64le(amountIn), ...u64le(minAmountOut), ...u64le(0n)]),
    )

    const parsed = tryParseInstruction(RAYDIUM_LAUNCHLAB_PROGRAM, accounts, data)

    expect(parsed).not.toBeNull()
    expect(parsed?.type).toBe('raydium-launchlab-sell')
    expect(parsed?.tokenFrom).toBe(baseMint)
    expect(parsed?.tokenTo).toBe(quoteMint)
    expect(parsed?.amountFrom).toBe(amountIn)
    expect(parsed?.amountTo).toBe(minAmountOut)
    expect(parsed?.signer).toBe(signer)
  })

  test('parses Raydium CPMM swap_base_output', () => {
    const SWAP_BASE_OUTPUT_DISC = [55, 217, 98, 86, 163, 74, 180, 173] as const
    const signer = 'User111111111111111111111111111111111111111'
    const outputMint = 'Out1111111111111111111111111111111111111111'
    const accounts = new Array<string>(12).fill('x')
    accounts[0] = signer
    accounts[10] = NATIVE_SOL_MINT
    accounts[11] = outputMint
    const maxAmountIn = 4_000_000_000n
    const amountOut = 88_000n
    const data = encodeIxData(SWAP_BASE_OUTPUT_DISC, maxAmountIn, amountOut)

    const parsed = tryParseInstruction(RAYDIUM_CPMM_PROGRAM, accounts, data)

    expect(parsed).not.toBeNull()
    expect(parsed?.type).toBe('raydium-cpmm-buy')
    expect(parsed?.tokenFrom).toBe(NATIVE_SOL_MINT)
    expect(parsed?.tokenTo).toBe(outputMint)
    expect(parsed?.amountFrom).toBe(maxAmountIn)
    expect(parsed?.amountTo).toBe(amountOut)
    expect(parsed?.signer).toBe(signer)
  })

  test('parses Meteora DBC swap2 ExactIn', () => {
    const SWAP2_DISC = [65, 75, 63, 76, 235, 91, 91, 136] as const
    const mintA = 'MintA11111111111111111111111111111111111111'
    const mintB = NATIVE_SOL_MINT
    const signer = 'Signer1111111111111111111111111111111111111'
    const accounts = new Array<string>(10).fill('x')
    accounts[3] = 'InputAccount1111111111111111111111111111111'
    accounts[7] = mintA
    accounts[8] = mintB
    accounts[9] = signer
    const exactIn = 200_000n
    const minOut = 1_500_000_000n
    const data = encodeBase58(
      Uint8Array.from([
        ...SWAP2_DISC,
        ...u64le(exactIn),
        ...u64le(minOut),
        0, // ExactIn: amount_0 is exact in, amount_1 is min out
      ]),
    )
    const ctx: ParseContext = {
      allKeys: accounts,
      preTokenBalances: [tokenBalance(3, mintA)],
      postTokenBalances: [],
    }

    const parsed = tryParseInstruction(METEORA_DBC_PROGRAM, accounts, data, ctx)

    expect(parsed).not.toBeNull()
    expect(parsed?.type).toBe('meteora-dbc-sell')
    expect(parsed?.tokenFrom).toBe(mintA)
    expect(parsed?.tokenTo).toBe(mintB)
    expect(parsed?.amountFrom).toBe(exactIn)
    expect(parsed?.amountTo).toBe(minOut)
    expect(parsed?.signer).toBe(signer)
  })

  test('returns null for unknown programs or malformed data', () => {
    const accounts = ['a0']
    expect(tryParseInstruction('Unknown111111111111111111111111111111111111', accounts, '1111')).toBeNull()
    expect(tryParseInstruction(PUMPFUN_PROGRAM, accounts, '0OIl')).toBeNull()
  })
})
