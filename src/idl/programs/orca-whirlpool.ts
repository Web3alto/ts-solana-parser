import { WSOL_MINT } from '../../constants.ts'
import { matchDiscriminator, readU64LE } from '../codec.ts'
import { type ParseContext, type ProgramParser, type RawSwap, resolveMintForAccount } from '../types.ts'

const PROGRAM_ID = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'

// --- Discriminators: sha256("global:<method>")[0..8] ---
const SWAP_DISC = [248, 198, 158, 145, 225, 117, 135, 200] as const // global:swap
const SWAP_V2_DISC = [43, 4, 237, 11, 26, 201, 30, 98] as const // global:swap_v2
const TWO_HOP_SWAP_DISC = [195, 96, 237, 108, 68, 162, 219, 230] as const // global:two_hop_swap
const TWO_HOP_SWAP_V2_DISC = [186, 143, 209, 29, 254, 2, 194, 117] as const // global:two_hop_swap_v2

// --- swap account layout ---
// 0: token_program, 1: token_authority (signer), 2: whirlpool,
// 3: token_owner_account_a, 4: token_vault_a,
// 5: token_owner_account_b, 6: token_vault_b, 7-9: tick_arrays, 10: oracle

// --- swap_v2 account layout ---
// 0: token_program_a, 1: token_program_b, 2: memo_program,
// 3: token_authority (signer), 4: whirlpool,
// 5: token_mint_a, 6: token_mint_b,
// 7: token_owner_account_a, 8: token_vault_a,
// 9: token_owner_account_b, 10: token_vault_b, 11-13: tick_arrays, 14: oracle

// --- two_hop_swap account layout ---
// 0: token_program, 1: token_authority (signer),
// 2: whirlpool_one, 3: whirlpool_two,
// 4: token_owner_account_one_a, 5: token_vault_one_a,
// 6: token_owner_account_one_b, 7: token_vault_one_b,
// 8: token_owner_account_two_a, 9: token_vault_two_a,
// 10: token_owner_account_two_b, 11: token_vault_two_b, ...

// --- two_hop_swap_v2 account layout ---
// 0: whirlpool_one, 1: whirlpool_two,
// 2: token_mint_input, 3: token_mint_intermediate, 4: token_mint_output,
// 5-7: token_programs, 8: token_owner_account_input, 9-12: vaults,
// 13: token_owner_account_output, 14: token_authority (signer), ...

// Data layout for swap / swap_v2:
// [0..8]:  discriminator
// [8..16]: amount (u64)
// [16..24]: other_amount_threshold (u64)
// [24..40]: sqrt_price_limit (u128)
// [40]:    amount_specified_is_input (bool)
// [41]:    a_to_b (bool)

// Data layout for two_hop_swap / two_hop_swap_v2:
// [0..8]:  discriminator
// [8..16]: amount (u64)
// [16..24]: other_amount_threshold (u64)
// [24]:    amount_specified_is_input (bool)
// [25]:    a_to_b_one (bool)
// [26]:    a_to_b_two (bool)

function resolveDirection(inputMint: string, outputMint: string): 'orca-whirlpool-buy' | 'orca-whirlpool-sell' {
  if (inputMint === WSOL_MINT) return 'orca-whirlpool-buy'
  if (outputMint === WSOL_MINT) return 'orca-whirlpool-sell'
  return 'orca-whirlpool-sell'
}

function buildRawSwap(data: Uint8Array, inputMint: string, outputMint: string, signer: string): RawSwap {
  return {
    type: resolveDirection(inputMint, outputMint),
    tokenFrom: inputMint,
    amountFrom: readU64LE(data, 8),
    tokenTo: outputMint,
    amountTo: readU64LE(data, 16),
    signer,
  }
}

function parseSwap(data: Uint8Array, accounts: string[], ctx?: ParseContext): RawSwap | null {
  // 8 disc + 8 amount + 8 threshold + 16 sqrt_price + 1 amount_specified + 1 a_to_b = 42 bytes
  if (data.length < 42) return null

  const signer = accounts[1] // token_authority
  if (!signer) return null

  const aToB = data[41] !== 0

  // Legacy swap: resolve mints from token owner accounts
  const tokenAccountA = accounts[3]
  const tokenAccountB = accounts[5]
  if (!tokenAccountA || !tokenAccountB) return null

  const mintA = ctx ? resolveMintForAccount(tokenAccountA, ctx) : null
  const mintB = ctx ? resolveMintForAccount(tokenAccountB, ctx) : null
  if (!mintA || !mintB) return null

  const inputMint = aToB ? mintA : mintB
  const outputMint = aToB ? mintB : mintA

  return buildRawSwap(data, inputMint, outputMint, signer)
}

function parseSwapV2(data: Uint8Array, accounts: string[]): RawSwap | null {
  if (data.length < 42) return null

  const signer = accounts[3] // token_authority
  const mintA = accounts[5] // token_mint_a
  const mintB = accounts[6] // token_mint_b
  if (!signer || !mintA || !mintB) return null

  const aToB = data[41] !== 0
  const inputMint = aToB ? mintA : mintB
  const outputMint = aToB ? mintB : mintA

  return buildRawSwap(data, inputMint, outputMint, signer)
}

function parseTwoHopSwap(data: Uint8Array, accounts: string[], ctx?: ParseContext): RawSwap | null {
  // 8 disc + 8 amount + 8 threshold + 1 amount_specified + 1 a_to_b_one + 1 a_to_b_two = 27 bytes min
  if (data.length < 27) return null

  const signer = accounts[1] // token_authority
  if (!signer) return null

  const aToBOne = data[25] !== 0
  const aToBTwo = data[26] !== 0

  // Overall input: first pool's input token account
  // If a_to_b_one: input = account_one_a[4], else input = account_one_b[6]
  const inputTokenAccount = aToBOne ? accounts[4] : accounts[6]
  // Overall output: second pool's output token account
  // If a_to_b_two: output = account_two_b[10], else output = account_two_a[8]
  const outputTokenAccount = aToBTwo ? accounts[10] : accounts[8]
  if (!inputTokenAccount || !outputTokenAccount) return null

  const inputMint = ctx ? resolveMintForAccount(inputTokenAccount, ctx) : null
  const outputMint = ctx ? resolveMintForAccount(outputTokenAccount, ctx) : null
  if (!inputMint || !outputMint) return null

  return buildRawSwap(data, inputMint, outputMint, signer)
}

function parseTwoHopSwapV2(data: Uint8Array, accounts: string[]): RawSwap | null {
  if (data.length < 27) return null

  const signer = accounts[14] // token_authority
  const inputMint = accounts[2] // token_mint_input
  const outputMint = accounts[4] // token_mint_output
  if (!signer || !inputMint || !outputMint) return null

  return buildRawSwap(data, inputMint, outputMint, signer)
}

function parseInstruction(data: Uint8Array, accounts: string[], ctx?: ParseContext): RawSwap | null {
  if (data.length < 8) return null

  // Check v2 variants first (more common, explicit mints)
  if (matchDiscriminator(data, SWAP_V2_DISC)) return parseSwapV2(data, accounts)
  if (matchDiscriminator(data, TWO_HOP_SWAP_V2_DISC)) return parseTwoHopSwapV2(data, accounts)
  // Legacy variants (require ctx for mint resolution)
  if (matchDiscriminator(data, SWAP_DISC)) return parseSwap(data, accounts, ctx)
  if (matchDiscriminator(data, TWO_HOP_SWAP_DISC)) return parseTwoHopSwap(data, accounts, ctx)

  return null
}

export const orcaWhirlpoolParser: ProgramParser = {
  programId: PROGRAM_ID,
  parseInstruction,
}
