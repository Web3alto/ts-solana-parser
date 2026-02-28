import { matchDiscriminator, readU64LE } from '../codec.ts'
import { NATIVE_SOL_MINT } from '../types.ts'
import type { ProgramParser, RawSwap } from '../types.ts'

const PROGRAM_ID = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'

// sha256("global:swap_base_input")[0..8]
const SWAP_BASE_INPUT_DISC = [143, 190, 90, 218, 196, 30, 51, 222] as const
// sha256("global:swap_base_output")[0..8]
const SWAP_BASE_OUTPUT_DISC = [55, 217, 98, 86, 163, 74, 180, 173] as const

const PAYER_INDEX = 0
const INPUT_TOKEN_MINT_INDEX = 10
const OUTPUT_TOKEN_MINT_INDEX = 11

function parseInstruction(
  data: Uint8Array,
  accounts: string[],
): RawSwap | null {
  if (data.length < 24) return null

  const signer = accounts[PAYER_INDEX]
  const inputMint = accounts[INPUT_TOKEN_MINT_INDEX]
  const outputMint = accounts[OUTPUT_TOKEN_MINT_INDEX]
  if (!signer || !inputMint || !outputMint) return null

  // Both swap variants use the same data layout: [disc][u64][u64]
  // swap_base_input:  [disc][amount_in][min_amount_out]
  // swap_base_output: [disc][max_amount_in][amount_out]
  const isSwap = matchDiscriminator(data, SWAP_BASE_INPUT_DISC) ||
    matchDiscriminator(data, SWAP_BASE_OUTPUT_DISC)

  if (!isSwap) return null

  return {
    type: inputMint === NATIVE_SOL_MINT ? 'raydium-cpmm-buy' : 'raydium-cpmm-sell',
    tokenFrom: inputMint,
    amountFrom: readU64LE(data, 8),
    tokenTo: outputMint,
    amountTo: readU64LE(data, 16),
    signer,
  }
}

export const raydiumCpmmParser: ProgramParser = {
  programId: PROGRAM_ID,
  parseInstruction,
}
