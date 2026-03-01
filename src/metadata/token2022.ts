import { readLengthPrefixedString } from './decode.ts'

const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
const BASE_MINT_SIZE = 82
const METADATA_EXTENSION_TYPE = 19

/**
 * Parse Token-2022 metadata extension from mint account data.
 * Base mint layout is 82 bytes. After that: account type discriminator (1 byte) + padding,
 * then TLV extensions: type(2 LE) + length(2 LE) + value(length bytes).
 * Metadata extension type = 19. Value contains:
 *   update_authority(32) + mint(32) + name(4+var) + symbol(4+var) + uri(4+var)
 */
export function parseToken2022MetadataExtension(
  data: Uint8Array,
): { name: string; symbol: string; uri: string; decimals: number } | null {
  if (data.byteLength < BASE_MINT_SIZE + 4) return null

  // Decimals at offset 44, 1 byte (u8)
  const decimals = data[44]!

  // Scan TLV extensions after base mint + account type byte + padding
  // Account type discriminator is 1 byte at offset 82, followed by possible extension data at 83+
  let offset = BASE_MINT_SIZE + 1 // skip account type byte

  // Skip any padding bytes (look for valid TLV structure)
  // Some implementations add padding bytes; scan for a valid TLV header
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  while (offset + 4 <= data.byteLength) {
    const extType = view.getUint16(offset, true)
    const extLen = view.getUint16(offset + 2, true)

    if (extLen === 0 && extType === 0) {
      // Skip padding
      offset += 4
      continue
    }

    if (offset + 4 + extLen > data.byteLength) return null

    if (extType === METADATA_EXTENSION_TYPE) {
      const extData = data.subarray(offset + 4, offset + 4 + extLen)
      return parseMetadataExtensionValue(extData, decimals)
    }

    offset += 4 + extLen
  }

  return null
}

function parseMetadataExtensionValue(
  data: Uint8Array,
  decimals: number,
): { name: string; symbol: string; uri: string; decimals: number } | null {
  // update_authority(32) + mint(32) + name(4+var) + symbol(4+var) + uri(4+var)
  if (data.byteLength < 64 + 12) return null

  let offset = 32 + 32 // skip update_authority + mint

  const nameResult = readLengthPrefixedString(data, offset, 10_000)
  if (!nameResult) return null
  offset += nameResult.bytesRead

  const symbolResult = readLengthPrefixedString(data, offset, 10_000)
  if (!symbolResult) return null
  offset += symbolResult.bytesRead

  const uriResult = readLengthPrefixedString(data, offset, 10_000)
  if (!uriResult) return null

  return {
    name: nameResult.value,
    symbol: symbolResult.value,
    uri: uriResult.value,
    decimals,
  }
}

export { TOKEN_2022_PROGRAM }
