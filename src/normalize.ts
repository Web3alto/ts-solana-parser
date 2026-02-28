import { zstdDecompressSync } from 'node:zlib'
import { deserializeTransaction } from './deserialize.ts'
import { DecodeError, UnsupportedEncodingError } from './errors.ts'
import { decodeBase58, decodeBase64 } from './idl/codec.ts'
import type { EncodedTransactionTuple, TransactionData, TransactionMessage } from './types.ts'

export function normalizeTransactionData(data: TransactionData | EncodedTransactionTuple): {
  message: TransactionMessage
  signatures: string[]
} {
  if (!Array.isArray(data)) {
    return data
  }

  const [encoded, encoding] = data
  let bytes: Uint8Array
  switch (encoding) {
    case 'base64+zstd':
      try {
        bytes = zstdDecompressSync(decodeBase64(encoded), {
          maxOutputLength: 65_536,
        })
      } catch {
        throw new DecodeError('Invalid base64+zstd payload')
      }
      break
    case 'base64':
      bytes = decodeBase64(encoded)
      break
    case 'base58':
      bytes = decodeBase58(encoded)
      break
    default:
      throw new UnsupportedEncodingError(encoding)
  }

  return deserializeTransaction(bytes)
}
