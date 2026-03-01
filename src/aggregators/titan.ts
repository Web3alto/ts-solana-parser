import { matchDiscriminator } from '../idl/codec.ts'

// Titan route instruction discriminators (sha256("global:<method>")[0..8])
// Titan is a Jupiter-like aggregator with swap_* naming convention.
// swap_route_v2 is the dominant variant on-chain (>99% of transactions).
const ROUTE_DISCRIMINATORS = [
  { variant: 'swap_route_v2', disc: [249, 91, 84, 33, 69, 22, 0, 135] as const, signerIndex: 0 },
  { variant: 'swap_route', disc: [86, 183, 163, 144, 0, 50, 173, 28] as const, signerIndex: 1 },
  { variant: 'swap_v2', disc: [43, 4, 237, 11, 26, 201, 30, 98] as const, signerIndex: 0 },
  { variant: 'swap', disc: [248, 198, 158, 145, 225, 117, 135, 200] as const, signerIndex: 1 },
  {
    variant: 'shared_accounts_swap_route',
    disc: [240, 184, 123, 254, 103, 28, 179, 125] as const,
    signerIndex: 2,
  },
  {
    variant: 'shared_accounts_swap_route_v2',
    disc: [68, 158, 178, 157, 208, 244, 62, 231] as const,
    signerIndex: 1,
  },
  {
    variant: 'swap_route_with_token_ledger',
    disc: [137, 183, 238, 196, 115, 204, 162, 66] as const,
    signerIndex: 1,
  },
] as const

export function parseTitanInstruction(
  data: Uint8Array,
  accounts: string[],
): { variant: string; signer: string } | null {
  for (const entry of ROUTE_DISCRIMINATORS) {
    if (matchDiscriminator(data, entry.disc)) {
      const signer = accounts[entry.signerIndex]
      if (!signer) return null
      return { variant: entry.variant, signer }
    }
  }
  // Non-swap instructions (set_token_ledger, etc.) return null
  return null
}
