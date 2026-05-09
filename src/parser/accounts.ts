import type { ParseContext } from '../idl/types.ts'
import { parseLamports, parseLamportsArray } from '../lamports.ts'
import type {
  AccountKey,
  AddressLookupResolution,
  CompiledInstruction,
  InnerInstructionSet,
  Instruction,
  TokenBalance,
  TransactionMessage,
  TransactionMeta,
  UnparsedInstruction,
} from '../types.ts'

export interface NormalizedTransactionMeta
  extends Omit<
    TransactionMeta,
    | 'fee'
    | 'preBalances'
    | 'postBalances'
    | 'preTokenBalances'
    | 'postTokenBalances'
    | 'innerInstructions'
    | 'loadedAddresses'
  > {
  fee: bigint
  preBalances: bigint[]
  postBalances: bigint[]
  preTokenBalances: TokenBalance[]
  postTokenBalances: TokenBalance[]
  innerInstructions: InnerInstructionSet[]
  loadedAddresses: {
    writable: string[]
    readonly: string[]
  }
}

export function resolveAccountKey(key: AccountKey): string {
  return typeof key === 'string' ? key : key.pubkey
}

export function normalizeMetaWithLookups(
  meta: TransactionMeta,
  resolvedLookups?: AddressLookupResolution | null,
): NormalizedTransactionMeta {
  const loadedWritable = meta.loadedAddresses?.writable ?? []
  const loadedReadonly = meta.loadedAddresses?.readonly ?? []
  const hasLoaded = loadedWritable.length > 0 || loadedReadonly.length > 0

  const writable = hasLoaded ? loadedWritable : (resolvedLookups?.writable ?? [])
  const readonly = hasLoaded ? loadedReadonly : (resolvedLookups?.readonly ?? [])

  return {
    err: meta.err,
    fee: parseLamports(meta.fee, 'fee'),
    preBalances: parseLamportsArray(meta.preBalances, 'preBalances'),
    postBalances: parseLamportsArray(meta.postBalances, 'postBalances'),
    preTokenBalances: meta.preTokenBalances ?? [],
    postTokenBalances: meta.postTokenBalances ?? [],
    innerInstructions: meta.innerInstructions ?? [],
    loadedAddresses: {
      writable,
      readonly,
    },
  }
}

export function hasUnresolvedAddressLookupIndexes(
  message: TransactionMessage,
  meta: NormalizedTransactionMeta,
  allInstructions: Instruction[],
): boolean {
  if (!message.addressTableLookups || message.addressTableLookups.length === 0) {
    return false
  }
  const staticKeyCount = message.accountKeys.length
  const dynamicKeyCount = meta.loadedAddresses.writable.length + meta.loadedAddresses.readonly.length
  const maxResolvedIndex = staticKeyCount + dynamicKeyCount - 1
  for (const instr of allInstructions) {
    if (!isCompiledInstruction(instr)) continue
    if (instr.programIdIndex > maxResolvedIndex) return true
    for (const idx of instr.accounts) {
      if (idx > maxResolvedIndex) return true
    }
  }
  return false
}

export function buildFullAccountKeys(message: TransactionMessage, meta: NormalizedTransactionMeta): string[] {
  const base = message.accountKeys.map(resolveAccountKey)
  base.push(...meta.loadedAddresses.writable, ...meta.loadedAddresses.readonly)
  return base
}

export function isCompiledInstruction(instr: Instruction): instr is CompiledInstruction {
  return 'programIdIndex' in instr
}

export function isUnparsedInstruction(instr: Instruction): instr is UnparsedInstruction {
  return (
    'programId' in instr &&
    'accounts' in instr &&
    'data' in instr &&
    Array.isArray(instr.accounts) &&
    ((instr.accounts as unknown[]).length === 0 || typeof (instr.accounts as unknown[])[0] === 'string')
  )
}

export function getInstructionProgramId(instr: Instruction, fullKeys: string[]): string | undefined {
  if (isCompiledInstruction(instr)) {
    return fullKeys[instr.programIdIndex]
  }
  return instr.programId
}

export function buildParseContext(meta: NormalizedTransactionMeta, fullKeys: string[]): ParseContext {
  const keyIndexMap = new Map<string, number>()
  for (let i = 0; i < fullKeys.length; i++) keyIndexMap.set(fullKeys[i]!, i)

  const accountMintMap = new Map<number, string>()
  for (const b of meta.preTokenBalances) accountMintMap.set(b.accountIndex, b.mint)
  for (const b of meta.postTokenBalances) {
    if (!accountMintMap.has(b.accountIndex)) accountMintMap.set(b.accountIndex, b.mint)
  }

  return {
    preTokenBalances: meta.preTokenBalances,
    postTokenBalances: meta.postTokenBalances,
    allKeys: fullKeys,
    keyIndexMap,
    accountMintMap,
  }
}

export function getAllInstructions(message: TransactionMessage, meta: NormalizedTransactionMeta): Instruction[] {
  const out: Instruction[] = [...message.instructions]
  for (const inner of meta.innerInstructions) {
    out.push(...inner.instructions)
  }
  return out
}
