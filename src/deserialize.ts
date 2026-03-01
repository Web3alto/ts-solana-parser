import { getCompiledTransactionMessageDecoder, getTransactionDecoder } from '@solana/kit'
import { DecodeError } from './errors.ts'
import { encodeBase58 } from './idl/codec.ts'
import type { CompiledInstruction, TransactionMessage } from './types.ts'

const txDecoder = getTransactionDecoder()
const msgDecoder = getCompiledTransactionMessageDecoder()

export function deserializeTransaction(bytes: Uint8Array): {
  message: TransactionMessage
  signatures: string[]
} {
  let messageBytes: Uint8Array
  let signaturesMap: Record<string, Uint8Array>
  try {
    const decoded = txDecoder.decode(bytes)
    // Kit returns branded ReadonlyUint8Array and SignaturesMap — cast at the boundary
    messageBytes = new Uint8Array(decoded.messageBytes as unknown as ArrayLike<number>)
    signaturesMap = decoded.signatures as unknown as Record<string, Uint8Array>
  } catch (err) {
    // Kit throws on unsupported versions — propagate with our expected message format
    const msg = err instanceof Error ? err.message : ''
    const versionMatch = msg.match(/version (\d+)/)
    if (versionMatch) {
      throw new DecodeError(`Unsupported transaction version: ${versionMatch[1]}`)
    }
    throw new DecodeError('Failed to decode transaction bytes')
  }

  let header: { numSignerAccounts: number; numReadonlySignerAccounts: number; numReadonlyNonSignerAccounts: number }
  let staticAccounts: string[]
  let lifetimeToken: string
  let kitInstructions: Array<{
    programAddressIndex: number
    accountIndices?: readonly number[]
    data?: ArrayLike<number>
  }>
  let kitLookups:
    | Array<{
        lookupTableAddress: string
        writableIndexes: readonly number[]
        readonlyIndexes: readonly number[]
      }>
    | undefined
  try {
    // Cast through unknown: Kit returns branded Address[], ReadonlyUint8Array, etc.
    const msg = msgDecoder.decode(messageBytes) as unknown as {
      header: typeof header
      staticAccounts: string[]
      lifetimeToken: string
      instructions: typeof kitInstructions
      addressTableLookups?: typeof kitLookups
    }
    header = msg.header
    staticAccounts = msg.staticAccounts
    lifetimeToken = msg.lifetimeToken
    kitInstructions = msg.instructions
    kitLookups = msg.addressTableLookups
  } catch {
    throw new DecodeError('Failed to decode transaction message bytes')
  }

  // Convert Kit's signature map {base58Address: SignatureBytes} to base58 strings
  const signatures: string[] = []
  for (const sigBytes of Object.values(signaturesMap)) {
    signatures.push(encodeBase58(new Uint8Array(sigBytes)))
  }

  // Convert Kit instructions to our CompiledInstruction format
  const instructions: CompiledInstruction[] = kitInstructions.map((ix) => ({
    programIdIndex: ix.programAddressIndex,
    accounts: ix.accountIndices ? Array.from(ix.accountIndices) : [],
    data: ix.data ? encodeBase58(new Uint8Array(ix.data as ArrayLike<number>)) : '',
  }))

  // Convert Kit address table lookups to our format
  let addressTableLookups: TransactionMessage['addressTableLookups'] | undefined
  if (kitLookups && kitLookups.length > 0) {
    addressTableLookups = kitLookups.map((lookup) => ({
      accountKey: lookup.lookupTableAddress,
      writableIndexes: Array.from(lookup.writableIndexes),
      readonlyIndexes: Array.from(lookup.readonlyIndexes),
    }))
  }

  return {
    message: {
      accountKeys: Array.from(staticAccounts),
      instructions,
      recentBlockhash: lifetimeToken,
      addressTableLookups,
      header: {
        numRequiredSignatures: header.numSignerAccounts,
        numReadonlySignedAccounts: header.numReadonlySignerAccounts,
        numReadonlyUnsignedAccounts: header.numReadonlyNonSignerAccounts,
      },
    },
    signatures,
  }
}
