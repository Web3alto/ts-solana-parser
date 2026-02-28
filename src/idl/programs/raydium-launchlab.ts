import { matchDiscriminator, readU64LE } from '../codec.ts'
import type { ProgramParser, RawSwap } from '../types.ts'

const PROGRAM_ID = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj'

// sha256("global:buy_exact_in")[0..8]
const BUY_EXACT_IN_DISC = [250, 234, 13, 123, 213, 156, 19, 236] as const
// sha256("global:buy_exact_out")[0..8]
const BUY_EXACT_OUT_DISC = [24, 211, 116, 40, 105, 3, 153, 56] as const
// sha256("global:sell_exact_in")[0..8]
const SELL_EXACT_IN_DISC = [149, 39, 222, 155, 211, 124, 152, 26] as const
// sha256("global:sell_exact_out")[0..8]
const SELL_EXACT_OUT_DISC = [95, 200, 71, 34, 8, 9, 11, 166] as const

const PAYER_INDEX = 0
const BASE_TOKEN_MINT_INDEX = 9
const QUOTE_TOKEN_MINT_INDEX = 10

function parseInstruction(data: Uint8Array, accounts: string[]): RawSwap | null {
  if (data.length < 32) return null

  const signer = accounts[PAYER_INDEX]
  const baseMint = accounts[BASE_TOKEN_MINT_INDEX]
  const quoteMint = accounts[QUOTE_TOKEN_MINT_INDEX]
  if (!signer || !baseMint || !quoteMint) return null

  // buy_exact_in: user pays exact quote, receives base
  // data = [disc][amount_in][min_amount_out][share_fee_rate]
  if (matchDiscriminator(data, BUY_EXACT_IN_DISC)) {
    return {
      type: 'raydium-launchlab-buy',
      tokenFrom: quoteMint,
      amountFrom: readU64LE(data, 8),
      tokenTo: baseMint,
      amountTo: readU64LE(data, 16),
      signer,
    }
  }

  // buy_exact_out: user pays quote, receives exact base
  // data = [disc][amount_out][max_amount_in][share_fee_rate]
  if (matchDiscriminator(data, BUY_EXACT_OUT_DISC)) {
    return {
      type: 'raydium-launchlab-buy',
      tokenFrom: quoteMint,
      amountFrom: readU64LE(data, 16),
      tokenTo: baseMint,
      amountTo: readU64LE(data, 8),
      signer,
    }
  }

  // sell_exact_in: user pays exact base, receives quote
  // data = [disc][amount_in][min_amount_out][share_fee_rate]
  if (matchDiscriminator(data, SELL_EXACT_IN_DISC)) {
    return {
      type: 'raydium-launchlab-sell',
      tokenFrom: baseMint,
      amountFrom: readU64LE(data, 8),
      tokenTo: quoteMint,
      amountTo: readU64LE(data, 16),
      signer,
    }
  }

  // sell_exact_out: user pays base, receives exact quote
  // data = [disc][amount_out][max_amount_in][share_fee_rate]
  if (matchDiscriminator(data, SELL_EXACT_OUT_DISC)) {
    return {
      type: 'raydium-launchlab-sell',
      tokenFrom: baseMint,
      amountFrom: readU64LE(data, 16),
      tokenTo: quoteMint,
      amountTo: readU64LE(data, 8),
      signer,
    }
  }

  return null
}

export const raydiumLaunchLabParser: ProgramParser = {
  programId: PROGRAM_ID,
  parseInstruction,
}
