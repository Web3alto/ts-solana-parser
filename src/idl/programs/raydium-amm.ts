import { WSOL_MINT } from '../../constants.ts'
import { readU64LE } from '../codec.ts'
import { type ParseContext, type ProgramParser, type RawSwap, resolveMintForAccount } from '../types.ts'

const PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'

// Non-Anchor program — uses 1-byte instruction index, not 8-byte sha256 discriminators.
// swapBaseIn = instruction 9, swapBaseOut = instruction 11.
const SWAP_BASE_IN_INDEX = 9
const SWAP_BASE_OUT_INDEX = 11

// Account layout (shared for swapBaseIn and swapBaseOut):
// [1] amm (pool)
// [15] uerSourceTokenAccount (user's input token account)
// [16] uerDestinationTokenAccount (user's output token account)
// [17] userSourceOwner (signer)
const SOURCE_TOKEN_ACCOUNT_INDEX = 15
const DEST_TOKEN_ACCOUNT_INDEX = 16
const PAYER_INDEX = 17

function resolveDirection(sourceMint: string, destMint: string): 'raydium-amm-buy' | 'raydium-amm-sell' {
  if (sourceMint === WSOL_MINT) return 'raydium-amm-buy'
  if (destMint === WSOL_MINT) return 'raydium-amm-sell'
  return 'raydium-amm-sell'
}

function parseInstruction(data: Uint8Array, accounts: string[], ctx?: ParseContext): RawSwap | null {
  // Data layout: [1 byte index][8 amount0][8 amount1] = 17 bytes minimum
  if (data.length < 17) return null

  const instructionIndex = data[0]
  if (instructionIndex !== SWAP_BASE_IN_INDEX && instructionIndex !== SWAP_BASE_OUT_INDEX) return null

  const signer = accounts[PAYER_INDEX]
  const sourceAccount = accounts[SOURCE_TOKEN_ACCOUNT_INDEX]
  const destAccount = accounts[DEST_TOKEN_ACCOUNT_INDEX]
  if (!signer || !sourceAccount || !destAccount || !ctx) return null

  const sourceMint = resolveMintForAccount(sourceAccount, ctx)
  const destMint = resolveMintForAccount(destAccount, ctx)
  if (!sourceMint || !destMint) return null

  return {
    type: resolveDirection(sourceMint, destMint),
    tokenFrom: sourceMint,
    amountFrom: readU64LE(data, 1),
    tokenTo: destMint,
    amountTo: readU64LE(data, 9),
    signer,
  }
}

export const raydiumAmmParser: ProgramParser = {
  programId: PROGRAM_ID,
  parseInstruction,
}
