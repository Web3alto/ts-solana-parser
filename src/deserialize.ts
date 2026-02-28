import { encodeBase58, readCompactU16 } from './idl/codec.ts'
import type { CompiledInstruction, TransactionMessage } from './types.ts'

export function deserializeTransaction(bytes: Uint8Array): {
  message: TransactionMessage
  signatures: string[]
} {
  let offset = 0

  // 1. Signatures
  const numSigs = readCompactU16(bytes, offset)
  offset += numSigs.size

  const signatures: string[] = []
  for (let i = 0; i < numSigs.value; i++) {
    signatures.push(encodeBase58(bytes.subarray(offset, offset + 64)))
    offset += 64
  }

  // 2. Detect version: if first byte has high bit set, it's versioned (v0)
  if ((bytes[offset]! & 0x80) !== 0) {
    offset++ // skip version prefix byte
  }

  // 3. Message header (3 bytes)
  offset += 3

  // 4. Account keys
  const numKeys = readCompactU16(bytes, offset)
  offset += numKeys.size

  const accountKeys: string[] = []
  for (let i = 0; i < numKeys.value; i++) {
    accountKeys.push(encodeBase58(bytes.subarray(offset, offset + 32)))
    offset += 32
  }

  // 5. Recent blockhash
  const recentBlockhash = encodeBase58(bytes.subarray(offset, offset + 32))
  offset += 32

  // 6. Instructions
  const numIxs = readCompactU16(bytes, offset)
  offset += numIxs.size

  const instructions: CompiledInstruction[] = []
  for (let i = 0; i < numIxs.value; i++) {
    const programIdIndex = bytes[offset]!
    offset++

    const numAccounts = readCompactU16(bytes, offset)
    offset += numAccounts.size

    const accounts: number[] = []
    for (let j = 0; j < numAccounts.value; j++) {
      accounts.push(bytes[offset]!)
      offset++
    }

    const dataLen = readCompactU16(bytes, offset)
    offset += dataLen.size

    const data = encodeBase58(bytes.subarray(offset, offset + dataLen.value))
    offset += dataLen.value

    instructions.push({ programIdIndex, accounts, data })
  }

  return {
    message: {
      accountKeys,
      instructions,
      recentBlockhash,
    },
    signatures,
  }
}
