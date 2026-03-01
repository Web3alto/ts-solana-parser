import { matchDiscriminator } from '../idl/codec.ts'

// Jupiter route instruction discriminators (sha256("global:<method>")[0..8])
const ROUTE_DISCRIMINATORS = [
  { variant: 'route', disc: [229, 23, 203, 151, 122, 227, 173, 42] as const, signerIndex: 1 },
  { variant: 'route_v2', disc: [187, 100, 250, 204, 49, 196, 175, 20] as const, signerIndex: 0 },
  { variant: 'shared_accounts_route', disc: [193, 32, 155, 51, 65, 214, 156, 129] as const, signerIndex: 2 },
  { variant: 'shared_accounts_route_v2', disc: [209, 152, 83, 147, 124, 254, 216, 233] as const, signerIndex: 1 },
  { variant: 'exact_out_route', disc: [208, 51, 239, 151, 123, 43, 237, 92] as const, signerIndex: 1 },
  { variant: 'exact_out_route_v2', disc: [157, 138, 184, 82, 21, 244, 243, 36] as const, signerIndex: 0 },
  {
    variant: 'shared_accounts_exact_out_route',
    disc: [176, 209, 105, 168, 154, 125, 69, 62] as const,
    signerIndex: 2,
  },
  {
    variant: 'shared_accounts_exact_out_route_v2',
    disc: [53, 96, 229, 202, 216, 187, 250, 24] as const,
    signerIndex: 1,
  },
  { variant: 'route_with_token_ledger', disc: [150, 86, 71, 116, 167, 93, 14, 104] as const, signerIndex: 1 },
  {
    variant: 'shared_accounts_route_with_token_ledger',
    disc: [230, 121, 143, 80, 119, 159, 106, 170] as const,
    signerIndex: 2,
  },
] as const

export function parseJupiterInstruction(
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
  // Non-swap instructions (claim, close_token, etc.) return null
  return null
}
