import { matchDiscriminator, readU64LE } from '../codec.ts'
import type { ProgramParser, RawSwap } from '../types.ts'
import { NATIVE_SOL_MINT } from '../types.ts'

const PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'

// sha256("global:buy")[0..8]
const BUY_DISC = [102, 6, 61, 18, 1, 218, 235, 234] as const
// sha256("global:sell")[0..8]
const SELL_DISC = [51, 230, 133, 164, 1, 127, 131, 173] as const
// sha256("global:buy_exact_sol_in")[0..8]
const BUY_EXACT_SOL_IN_DISC = [56, 252, 116, 8, 158, 223, 205, 95] as const

const MINT_INDEX = 2
const USER_INDEX = 6

function parseInstruction(data: Uint8Array, accounts: string[]): RawSwap | null {
  if (data.length < 24) return null

  const mint = accounts[MINT_INDEX]
  const signer = accounts[USER_INDEX]
  if (!mint || !signer) return null

  // buy: data = [disc][tokenAmount][maxSolCost]
  if (matchDiscriminator(data, BUY_DISC)) {
    return {
      type: 'pumpfun-buy',
      tokenFrom: NATIVE_SOL_MINT,
      amountFrom: readU64LE(data, 16),
      tokenTo: mint,
      amountTo: readU64LE(data, 8),
      signer,
    }
  }

  // buy_exact_sol_in: data = [disc][solAmount][minTokenOutput]
  if (matchDiscriminator(data, BUY_EXACT_SOL_IN_DISC)) {
    return {
      type: 'pumpfun-buy',
      tokenFrom: NATIVE_SOL_MINT,
      amountFrom: readU64LE(data, 8),
      tokenTo: mint,
      amountTo: readU64LE(data, 16),
      signer,
    }
  }

  // sell: data = [disc][tokenAmount][minSolOutput]
  if (matchDiscriminator(data, SELL_DISC)) {
    return {
      type: 'pumpfun-sell',
      tokenFrom: mint,
      amountFrom: readU64LE(data, 8),
      tokenTo: NATIVE_SOL_MINT,
      amountTo: readU64LE(data, 16),
      signer,
    }
  }

  return null
}

export const pumpfunParser: ProgramParser = {
  programId: PROGRAM_ID,
  parseInstruction,
}
