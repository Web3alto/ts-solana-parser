import { WSOL_MINT } from '../../constants.ts'
import { matchDiscriminator, readU64LE } from '../codec.ts'
import type { ParseContext, ProgramParser, RawSwap } from '../types.ts'

const PROGRAM_ID = 'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB'

// sha256("global:swap")[0..8]
const SWAP_DISC = [248, 198, 158, 145, 225, 117, 135, 200] as const

// Account layout for swap:
// [0] pool
// [1] userSourceToken
// [2] userDestinationToken
// [12] user (signer)
const SOURCE_TOKEN_INDEX = 1
const DEST_TOKEN_INDEX = 2
const PAYER_INDEX = 12

function resolveMintFromTokenAccount(tokenAccountKey: string, ctx: ParseContext): string | null {
  const idx = ctx.allKeys.indexOf(tokenAccountKey)
  if (idx === -1) return null
  for (const b of ctx.preTokenBalances) {
    if (b.accountIndex === idx) return b.mint
  }
  for (const b of ctx.postTokenBalances) {
    if (b.accountIndex === idx) return b.mint
  }
  return null
}

function resolveDirection(sourceMint: string, destMint: string): 'meteora-damm-buy' | 'meteora-damm-sell' {
  if (sourceMint === WSOL_MINT) return 'meteora-damm-buy'
  if (destMint === WSOL_MINT) return 'meteora-damm-sell'
  return 'meteora-damm-sell'
}

function parseInstruction(data: Uint8Array, accounts: string[], ctx?: ParseContext): RawSwap | null {
  if (!matchDiscriminator(data, SWAP_DISC)) return null
  if (data.length < 24) return null

  const signer = accounts[PAYER_INDEX]
  const sourceAccount = accounts[SOURCE_TOKEN_INDEX]
  const destAccount = accounts[DEST_TOKEN_INDEX]
  if (!signer || !sourceAccount || !destAccount || !ctx) return null

  const sourceMint = resolveMintFromTokenAccount(sourceAccount, ctx)
  const destMint = resolveMintFromTokenAccount(destAccount, ctx)
  if (!sourceMint || !destMint) return null

  return {
    type: resolveDirection(sourceMint, destMint),
    tokenFrom: sourceMint,
    amountFrom: readU64LE(data, 8),
    tokenTo: destMint,
    amountTo: readU64LE(data, 16),
    signer,
  }
}

export const meteoraDammParser: ProgramParser = {
  programId: PROGRAM_ID,
  parseInstruction,
}
