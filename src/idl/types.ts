import type { SwapType, TokenBalance } from '../types.ts'

export interface RawSwap {
  type: SwapType
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
  /** Pre-built key→index map for O(1) lookups (avoids allKeys.indexOf) */
  keyIndexMap: Map<string, number>
  /** Pre-built accountIndex→mint map from token balances */
  accountMintMap: Map<number, string>
}

/** Resolve the mint for a token account address via pre-built lookup maps. */
export function resolveMintForAccount(accountKey: string, ctx: ParseContext): string | null {
  const idx = ctx.keyIndexMap.get(accountKey)
  if (idx === undefined) return null
  return ctx.accountMintMap.get(idx) ?? null
}

export interface ProgramParser {
  programId: string
  parseInstruction(data: Uint8Array, accounts: string[], ctx?: ParseContext): RawSwap | null
}
