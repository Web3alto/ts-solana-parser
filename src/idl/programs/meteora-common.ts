import { WSOL_MINT } from '../../constants.ts'
import { matchDiscriminator, readU64LE } from '../codec.ts'
import type { ParseContext, ProgramParser, RawSwap, SwapType } from '../types.ts'

// sha256("global:swap")[0..8]
const SWAP_DISC = [248, 198, 158, 145, 225, 117, 135, 200] as const
// sha256("global:swap2")[0..8]
const SWAP2_DISC = [65, 75, 63, 76, 235, 91, 91, 136] as const

interface MeteoraAccountLayout {
  inputTokenAccountIndex: number
  mintAIndex: number
  mintBIndex: number
  payerIndex: number
}

interface MeteoraConfig {
  programId: string
  layout: MeteoraAccountLayout
  buyType: SwapType
  sellType: SwapType
}

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

function resolveSwapDirection(
  inputAccount: string,
  mintA: string,
  mintB: string,
  ctx?: ParseContext,
): { tokenFrom: string; tokenTo: string; isBuy: boolean } | null {
  const inputMint = resolveInputMint(inputAccount, ctx)

  let tokenFrom: string
  let tokenTo: string

  if (inputMint === mintB) {
    tokenFrom = mintB
    tokenTo = mintA
  } else if (inputMint === mintA) {
    tokenFrom = mintA
    tokenTo = mintB
  } else if (!inputMint) {
    // Ephemeral input account (not in token balances).
    // If one mint is native SOL, the ephemeral account is WSOL.
    if (mintB === WSOL_MINT) {
      tokenFrom = mintB
      tokenTo = mintA
    } else if (mintA === WSOL_MINT) {
      tokenFrom = mintA
      tokenTo = mintB
    } else {
      return null
    }
  } else {
    return null
  }

  // buy = paying SOL; non-SOL pools: paying mintB for mintA
  const isBuy = tokenFrom === WSOL_MINT || (tokenTo !== WSOL_MINT && tokenFrom === mintB)

  return { tokenFrom, tokenTo, isBuy }
}

export function createMeteoraParser(config: MeteoraConfig): ProgramParser {
  const { layout, buyType, sellType } = config

  function parseInstruction(data: Uint8Array, accounts: string[], ctx?: ParseContext): RawSwap | null {
    const signer = accounts[layout.payerIndex]
    const inputAccount = accounts[layout.inputTokenAccountIndex]
    const mintA = accounts[layout.mintAIndex]
    const mintB = accounts[layout.mintBIndex]
    if (!signer || !inputAccount || !mintA || !mintB) return null

    // swap: [disc][amount_in: u64][minimum_amount_out: u64]
    if (matchDiscriminator(data, SWAP_DISC)) {
      if (data.length < 24) return null

      const swap = resolveSwapDirection(inputAccount, mintA, mintB, ctx)
      if (!swap) return null

      return {
        type: swap.isBuy ? buyType : sellType,
        tokenFrom: swap.tokenFrom,
        amountFrom: readU64LE(data, 8),
        tokenTo: swap.tokenTo,
        amountTo: readU64LE(data, 16),
        signer,
      }
    }

    // swap2: [disc][amount_0: u64][amount_1: u64][swap_mode: u8]
    if (matchDiscriminator(data, SWAP2_DISC)) {
      if (data.length < 25) return null

      const swap = resolveSwapDirection(inputAccount, mintA, mintB, ctx)
      if (!swap) return null

      const amount0 = readU64LE(data, 8)
      const amount1 = readU64LE(data, 16)
      const swapMode = data[24]

      // swap_mode 0 = ExactIn: amount_0 = exact in, amount_1 = min out
      // swap_mode 1 = ExactOut: amount_0 = exact out, amount_1 = max in
      const amountFrom = swapMode === 1 ? amount1 : amount0
      const amountTo = swapMode === 1 ? amount0 : amount1

      return {
        type: swap.isBuy ? buyType : sellType,
        tokenFrom: swap.tokenFrom,
        amountFrom,
        tokenTo: swap.tokenTo,
        amountTo,
        signer,
      }
    }

    return null
  }

  return {
    programId: config.programId,
    parseInstruction,
  }
}
