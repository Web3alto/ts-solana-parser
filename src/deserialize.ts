import { DecodeError } from './errors.ts'
import { encodeBase58, readCompactU16 } from './idl/codec.ts'
import type { CompiledInstruction, TransactionMessage } from './types.ts'

export function deserializeTransaction(bytes: Uint8Array): {
  message: TransactionMessage
  signatures: string[]
} {
  let offset = 0
  const ensureAvailable = (size: number, section: string) => {
    if (offset + size > bytes.length) {
      throw new DecodeError(`Unexpected end of transaction bytes while reading ${section}`)
    }
  }

  // 1. Signatures
  const numSigs = readCompactU16(bytes, offset)
  offset += numSigs.size

  const signatures: string[] = []
  for (let i = 0; i < numSigs.value; i++) {
    ensureAvailable(64, 'signature')
    signatures.push(encodeBase58(bytes.subarray(offset, offset + 64)))
    offset += 64
  }

  // 2. Detect version: if first byte has high bit set, it's versioned (v0)
  ensureAvailable(1, 'version byte')
  const firstMessageByte = bytes[offset]!
  const isVersioned = (firstMessageByte & 0x80) !== 0
  if (isVersioned) {
    const version = firstMessageByte & 0x7f
    if (version !== 0) {
      throw new DecodeError(`Unsupported transaction version: ${version}`)
    }
    offset++ // skip version prefix byte
  }

  // 3. Message header (3 bytes)
  ensureAvailable(3, 'message header')
  const numRequiredSignatures = bytes[offset]!
  const numReadonlySignedAccounts = bytes[offset + 1]!
  const numReadonlyUnsignedAccounts = bytes[offset + 2]!
  offset += 3

  // 4. Account keys
  const numKeys = readCompactU16(bytes, offset)
  offset += numKeys.size

  const accountKeys: string[] = []
  for (let i = 0; i < numKeys.value; i++) {
    ensureAvailable(32, 'account key')
    accountKeys.push(encodeBase58(bytes.subarray(offset, offset + 32)))
    offset += 32
  }

  // 5. Recent blockhash
  ensureAvailable(32, 'recent blockhash')
  const recentBlockhash = encodeBase58(bytes.subarray(offset, offset + 32))
  offset += 32

  // 6. Instructions
  const numIxs = readCompactU16(bytes, offset)
  offset += numIxs.size

  const instructions: CompiledInstruction[] = []
  for (let i = 0; i < numIxs.value; i++) {
    ensureAvailable(1, 'instruction programIdIndex')
    const programIdIndex = bytes[offset]!
    offset++

    const numAccounts = readCompactU16(bytes, offset)
    offset += numAccounts.size

    const accounts: number[] = []
    for (let j = 0; j < numAccounts.value; j++) {
      ensureAvailable(1, 'instruction account index')
      accounts.push(bytes[offset]!)
      offset++
    }

    const dataLen = readCompactU16(bytes, offset)
    offset += dataLen.size

    ensureAvailable(dataLen.value, 'instruction data')
    const data = encodeBase58(bytes.subarray(offset, offset + dataLen.value))
    offset += dataLen.value

    instructions.push({ programIdIndex, accounts, data })
  }

  let addressTableLookups: TransactionMessage['addressTableLookups'] | undefined
  if (isVersioned) {
    const numLookups = readCompactU16(bytes, offset)
    offset += numLookups.size

    const lookups: NonNullable<TransactionMessage['addressTableLookups']> = []
    for (let i = 0; i < numLookups.value; i++) {
      ensureAvailable(32, 'address table lookup account key')
      const accountKey = encodeBase58(bytes.subarray(offset, offset + 32))
      offset += 32

      const writableLen = readCompactU16(bytes, offset)
      offset += writableLen.size
      const writableIndexes: number[] = []
      for (let j = 0; j < writableLen.value; j++) {
        ensureAvailable(1, 'address table writable index')
        writableIndexes.push(bytes[offset]!)
        offset++
      }

      const readonlyLen = readCompactU16(bytes, offset)
      offset += readonlyLen.size
      const readonlyIndexes: number[] = []
      for (let j = 0; j < readonlyLen.value; j++) {
        ensureAvailable(1, 'address table readonly index')
        readonlyIndexes.push(bytes[offset]!)
        offset++
      }

      lookups.push({ accountKey, writableIndexes, readonlyIndexes })
    }

    if (lookups.length > 0) {
      addressTableLookups = lookups
    }
  }

  return {
    message: {
      accountKeys,
      instructions,
      recentBlockhash,
      addressTableLookups,
      header: {
        numRequiredSignatures,
        numReadonlySignedAccounts,
        numReadonlyUnsignedAccounts,
      },
    },
    signatures,
  }
}
