import { decodeBase58, decodeBase64 } from './idl/codec.ts'
import { deserializeTransaction } from './deserialize.ts'
import type {
  EncodedTransactionTuple,
  TransactionData,
  TransactionMessage,
} from './types.ts'

export function normalizeTransactionData(
  data: TransactionData | EncodedTransactionTuple,
): { message: TransactionMessage; signatures: string[] } {
  if (!Array.isArray(data)) {
    return data
  }

  const [encoded, encoding] = data
  const bytes =
    encoding === 'base64' ? decodeBase64(encoded) : decodeBase58(encoded)

  return deserializeTransaction(bytes)
}
