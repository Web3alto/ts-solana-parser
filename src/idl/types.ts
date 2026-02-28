import { WSOL_MINT } from '../constants.ts'
import type { TokenBalance } from '../types.ts'

export type { SwapType } from '../types.ts'
export type { TokenBalance }

export const NATIVE_SOL_MINT = WSOL_MINT

export interface RawSwap {
  type: import('../types.ts').SwapType
  tokenFrom: string
  amountFrom: bigint
  tokenTo: string
  amountTo: bigint
  signer: string
}

export interface ParseContext {
  preTokenBalances: TokenBalance[]
  postTokenBalances: TokenBalance[]
  allKeys: string[]
}

export interface ProgramParser {
  programId: string
  parseInstruction(data: Uint8Array, accounts: string[], ctx?: ParseContext): RawSwap | null
}
