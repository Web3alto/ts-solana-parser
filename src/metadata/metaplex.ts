import { address, getAddressEncoder, getProgramDerivedAddress } from '@solana/kit'
import { readLengthPrefixedString } from './decode.ts'

const METAPLEX_TOKEN_METADATA_PROGRAM = address('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
const METADATA_SEED = new TextEncoder().encode('metadata')
const addressEncoder = getAddressEncoder()

/**
 * Derive the Metaplex metadata PDA for a given mint address.
 * Seeds: ['metadata', metaplex_program_id, mint_pubkey]
 */
export async function deriveMetaplexMetadataPda(mint: string): Promise<string> {
  const mintAddress = address(mint)
  const [pda] = await getProgramDerivedAddress({
    programAddress: METAPLEX_TOKEN_METADATA_PROGRAM,
    seeds: [METADATA_SEED, addressEncoder.encode(METAPLEX_TOKEN_METADATA_PROGRAM), addressEncoder.encode(mintAddress)],
  })
  return pda
}

/**
 * Parse Metaplex Token Metadata v1 account data.
 * Layout: key(1) + update_authority(32) + mint(32) + name(4+var) + symbol(4+var) + uri(4+var)
 */
export function parseMetaplexMetadata(data: Uint8Array): { name: string; symbol: string; uri: string } | null {
  if (data.byteLength < 1 + 32 + 32 + 12) return null

  const key = data[0]
  if (key !== 4) return null // MetadataV1 discriminator

  let offset = 1 + 32 + 32 // skip key + update_authority + mint

  const nameResult = readLengthPrefixedString(data, offset, 1000)
  if (!nameResult) return null
  offset += nameResult.bytesRead

  const symbolResult = readLengthPrefixedString(data, offset, 1000)
  if (!symbolResult) return null
  offset += symbolResult.bytesRead

  const uriResult = readLengthPrefixedString(data, offset, 1000)
  if (!uriResult) return null

  return {
    name: nameResult.value,
    symbol: symbolResult.value,
    uri: uriResult.value,
  }
}
