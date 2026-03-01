import { WSOL_MINT } from '../../constants.ts'
import { matchDiscriminator, readU64LE } from '../codec.ts'
import type { ParseContext, ProgramParser, RawSwap } from '../types.ts'

const PROGRAM_ID = 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK'

// sha256("global:swap")[0..8]
const SWAP_DISC = [248, 198, 158, 145, 225, 117, 135, 200] as const
// sha256("global:swap_v2")[0..8]
const SWAP_V2_DISC = [43, 4, 237, 11, 26, 201, 30, 98] as const

const PAYER_INDEX = 0

// swap_v2 has explicit mint accounts
const SWAP_V2_INPUT_MINT_INDEX = 11
const SWAP_V2_OUTPUT_MINT_INDEX = 12

/**
 * For the deprecated `swap` instruction, mints aren't in the account list.
 * Resolve them from the input/output token accounts via balance context.
 */
function resolveMintFromTokenAccount(tokenAccountKey: string, ctx: ParseContext | undefined): string | undefined {
  if (!ctx) return undefined
  const keyIndex = ctx.allKeys.indexOf(tokenAccountKey)
  if (keyIndex === -1) return undefined
  // Check post then pre balances for the mint
  for (const bal of ctx.postTokenBalances) {
    if (bal.accountIndex === keyIndex) return bal.mint
  }
  for (const bal of ctx.preTokenBalances) {
    if (bal.accountIndex === keyIndex) return bal.mint
  }
  return undefined
}

function resolveDirection(inputMint: string, outputMint: string): 'raydium-clmm-buy' | 'raydium-clmm-sell' {
  if (inputMint === WSOL_MINT) return 'raydium-clmm-buy'
  if (outputMint === WSOL_MINT) return 'raydium-clmm-sell'
  return 'raydium-clmm-sell'
}

function parseInstruction(data: Uint8Array, accounts: string[], ctx?: ParseContext): RawSwap | null {
  // Both swap and swap_v2 have: [8 disc][8 amount][8 other_amount_threshold][...]
  if (data.length < 24) return null

  const signer = accounts[PAYER_INDEX]
  if (!signer) return null

  let inputMint: string | undefined
  let outputMint: string | undefined

  if (matchDiscriminator(data, SWAP_V2_DISC)) {
    inputMint = accounts[SWAP_V2_INPUT_MINT_INDEX]
    outputMint = accounts[SWAP_V2_OUTPUT_MINT_INDEX]
  } else if (matchDiscriminator(data, SWAP_DISC)) {
    // Deprecated swap: input_token_account at 3, output_token_account at 4
    const inputTokenAccount = accounts[3]
    const outputTokenAccount = accounts[4]
    if (inputTokenAccount) inputMint = resolveMintFromTokenAccount(inputTokenAccount, ctx)
    if (outputTokenAccount) outputMint = resolveMintFromTokenAccount(outputTokenAccount, ctx)
  } else {
    return null
  }

  if (!inputMint || !outputMint) return null

  return {
    type: resolveDirection(inputMint, outputMint),
    tokenFrom: inputMint,
    amountFrom: readU64LE(data, 8),
    tokenTo: outputMint,
    amountTo: readU64LE(data, 16),
    signer,
  }
}

export const raydiumClmmParser: ProgramParser = {
  programId: PROGRAM_ID,
  parseInstruction,
}
