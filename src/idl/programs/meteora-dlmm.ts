import { WSOL_MINT } from '../../constants.ts'
import { matchDiscriminator, readU64LE } from '../codec.ts'
import type { ParseContext, ProgramParser, RawSwap } from '../types.ts'

const PROGRAM_ID = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo'

// sha256("global:swap")[0..8]
const SWAP_DISC = [248, 198, 158, 145, 225, 117, 135, 200] as const
// sha256("global:swap2")[0..8]
const SWAP2_DISC = [65, 75, 63, 76, 235, 91, 91, 136] as const
// sha256("global:swap_exact_out")[0..8]
const SWAP_EXACT_OUT_DISC = [250, 73, 101, 33, 38, 207, 75, 184] as const
// sha256("global:swap_exact_out2")[0..8]
const SWAP_EXACT_OUT2_DISC = [43, 215, 247, 132, 137, 60, 243, 81] as const
// sha256("global:swap_with_price_impact")[0..8]
const SWAP_WITH_PRICE_IMPACT_DISC = [56, 173, 230, 208, 173, 228, 156, 205] as const
// sha256("global:swap_with_price_impact2")[0..8]
const SWAP_WITH_PRICE_IMPACT2_DISC = [74, 98, 192, 214, 177, 51, 75, 51] as const

// Account layout (shared across all swap variants):
// [0] lb_pair (pool)
// [4] user_token_in
// [5] user_token_out
// [6] token_x_mint
// [7] token_y_mint
// [10] user (signer)
const USER_TOKEN_IN_INDEX = 4
const MINT_X_INDEX = 6
const MINT_Y_INDEX = 7
const PAYER_INDEX = 10

function resolveInputMint(inputAccount: string, ctx?: ParseContext): string | null {
  if (!ctx) return null
  const idx = ctx.allKeys.indexOf(inputAccount)
  if (idx === -1) return null

  for (const b of ctx.preTokenBalances) {
    if (b.accountIndex === idx) return b.mint
  }
  for (const b of ctx.postTokenBalances) {
    if (b.accountIndex === idx) return b.mint
  }

  return null
}

function resolveDirection(
  inputAccount: string,
  mintX: string,
  mintY: string,
  ctx?: ParseContext,
): { tokenFrom: string; tokenTo: string; isBuy: boolean } | null {
  const inputMint = resolveInputMint(inputAccount, ctx)

  let tokenFrom: string
  let tokenTo: string

  if (inputMint === mintY) {
    tokenFrom = mintY
    tokenTo = mintX
  } else if (inputMint === mintX) {
    tokenFrom = mintX
    tokenTo = mintY
  } else if (!inputMint) {
    // Ephemeral input account (not in token balances).
    // If one mint is native SOL, the ephemeral account is WSOL.
    if (mintY === WSOL_MINT) {
      tokenFrom = mintY
      tokenTo = mintX
    } else if (mintX === WSOL_MINT) {
      tokenFrom = mintX
      tokenTo = mintY
    } else {
      return null
    }
  } else {
    return null
  }

  // buy = paying SOL; non-SOL pools: paying mintY for mintX
  const isBuy = tokenFrom === WSOL_MINT || (tokenTo !== WSOL_MINT && tokenFrom === mintY)

  return { tokenFrom, tokenTo, isBuy }
}

function parseInstruction(data: Uint8Array, accounts: string[], ctx?: ParseContext): RawSwap | null {
  const signer = accounts[PAYER_INDEX]
  const inputAccount = accounts[USER_TOKEN_IN_INDEX]
  const mintX = accounts[MINT_X_INDEX]
  const mintY = accounts[MINT_Y_INDEX]
  if (!signer || !inputAccount || !mintX || !mintY) return null

  // swap / swap2 / swap_exact_out / swap_exact_out2:
  // [8 disc][8 amount_from][8 amount_to] — 24 bytes minimum
  if (
    matchDiscriminator(data, SWAP_DISC) ||
    matchDiscriminator(data, SWAP2_DISC) ||
    matchDiscriminator(data, SWAP_EXACT_OUT_DISC) ||
    matchDiscriminator(data, SWAP_EXACT_OUT2_DISC)
  ) {
    if (data.length < 24) return null

    const swap = resolveDirection(inputAccount, mintX, mintY, ctx)
    if (!swap) return null

    return {
      type: swap.isBuy ? 'meteora-dlmm-buy' : 'meteora-dlmm-sell',
      tokenFrom: swap.tokenFrom,
      amountFrom: readU64LE(data, 8),
      tokenTo: swap.tokenTo,
      amountTo: readU64LE(data, 16),
      signer,
    }
  }

  // swap_with_price_impact / swap_with_price_impact2:
  // [8 disc][8 amount_in][Option<i32> active_id][u16 max_price_impact_bps]
  // Only amount_in available — no min_amount_out
  if (matchDiscriminator(data, SWAP_WITH_PRICE_IMPACT_DISC) || matchDiscriminator(data, SWAP_WITH_PRICE_IMPACT2_DISC)) {
    if (data.length < 16) return null

    const swap = resolveDirection(inputAccount, mintX, mintY, ctx)
    if (!swap) return null

    return {
      type: swap.isBuy ? 'meteora-dlmm-buy' : 'meteora-dlmm-sell',
      tokenFrom: swap.tokenFrom,
      amountFrom: readU64LE(data, 8),
      tokenTo: swap.tokenTo,
      amountTo: 0n,
      signer,
    }
  }

  return null
}

export const meteoraDlmmParser: ProgramParser = {
  programId: PROGRAM_ID,
  parseInstruction,
}
