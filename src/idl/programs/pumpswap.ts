import { matchDiscriminator, readU64LE } from '../codec.ts'
import { NATIVE_SOL_MINT } from '../types.ts'
import type { ProgramParser, RawSwap } from '../types.ts'

const PROGRAM_ID = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'

// sha256("global:buy")[0..8]
const BUY_DISC = [102, 6, 61, 18, 1, 218, 235, 234] as const
// sha256("global:sell")[0..8]
const SELL_DISC = [51, 230, 133, 164, 1, 127, 131, 173] as const
// sha256("global:buy_exact_quote_in")[0..8]
const BUY_EXACT_QUOTE_IN_DISC = [198, 46, 21, 82, 180, 217, 232, 112] as const

const USER_INDEX = 1
const BASE_MINT_INDEX = 3
const QUOTE_MINT_INDEX = 4

function parseInstruction(
  data: Uint8Array,
  accounts: string[],
): RawSwap | null {
  if (data.length < 24) return null

  const signer = accounts[USER_INDEX]
  const baseMint = accounts[BASE_MINT_INDEX]
  const quoteMint = accounts[QUOTE_MINT_INDEX]
  if (!signer || !baseMint || !quoteMint) return null

  // buy: user receives base, pays quote
  // data = [disc][base_amount_out][max_quote_amount_in]
  if (matchDiscriminator(data, BUY_DISC)) {
    const tokenFrom = quoteMint // what user sends
    const tokenTo = baseMint // what user receives
    return {
      type: tokenFrom === NATIVE_SOL_MINT ? 'pumpswap-buy' : 'pumpswap-sell',
      tokenFrom,
      amountFrom: readU64LE(data, 16), // max_quote_amount_in
      tokenTo,
      amountTo: readU64LE(data, 8), // base_amount_out
      signer,
    }
  }

  // buy_exact_quote_in: user pays exact quote, receives base
  // data = [disc][spendable_quote_in][min_base_amount_out]
  if (matchDiscriminator(data, BUY_EXACT_QUOTE_IN_DISC)) {
    const tokenFrom = quoteMint
    const tokenTo = baseMint
    return {
      type: tokenFrom === NATIVE_SOL_MINT ? 'pumpswap-buy' : 'pumpswap-sell',
      tokenFrom,
      amountFrom: readU64LE(data, 8), // spendable_quote_in
      tokenTo,
      amountTo: readU64LE(data, 16), // min_base_amount_out
      signer,
    }
  }

  // sell: user pays base, receives quote
  // data = [disc][base_amount_in][min_quote_amount_out]
  if (matchDiscriminator(data, SELL_DISC)) {
    const tokenFrom = baseMint // what user sends
    const tokenTo = quoteMint // what user receives
    return {
      type: tokenFrom === NATIVE_SOL_MINT ? 'pumpswap-buy' : 'pumpswap-sell',
      tokenFrom,
      amountFrom: readU64LE(data, 8), // base_amount_in
      tokenTo,
      amountTo: readU64LE(data, 16), // min_quote_amount_out
      signer,
    }
  }

  return null
}

export const pumpswapParser: ProgramParser = {
  programId: PROGRAM_ID,
  parseInstruction,
}
