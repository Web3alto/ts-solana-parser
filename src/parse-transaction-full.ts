import { decodeInstruction } from './decoders/registry.ts'
import type { ParseContext } from './idl/types.ts'
import type { DecodedInstruction, DecodedInstructionEntry, FullTransactionResult } from './instruction-types.ts'
import { normalizeTransactionData } from './normalize.ts'
import {
  buildFullAccountKeys,
  getInstructionProgramId,
  isCompiledInstruction,
  normalizeMetaWithLookups,
} from './parser/accounts.ts'
import { parseTransaction } from './parser.ts'
import type {
  CompiledInstruction,
  Instruction,
  ParserOptions,
  TransactionNotification,
  UnparsedInstruction,
} from './types.ts'

export function parseFullTransaction(
  notification: TransactionNotification,
  options?: ParserOptions,
): FullTransactionResult | null {
  // 1. Normalize transaction data
  let message: import('./types.ts').TransactionMessage
  try {
    ;({ message } = normalizeTransactionData(notification.transaction.transaction))
  } catch {
    return null
  }

  // 2. Resolve lookups and build full account keys
  const resolvedLookups =
    message.addressTableLookups?.length && options?.resolveAddressTableLookups
      ? options.resolveAddressTableLookups(message.addressTableLookups)
      : null
  const meta = normalizeMetaWithLookups(notification.transaction.meta, resolvedLookups)
  const fullKeys = buildFullAccountKeys(message, meta)
  if (fullKeys.length === 0) return null

  const feePayer = fullKeys[0]!

  // Detect version from message
  const version = message.addressTableLookups?.length ? (0 as const) : ('legacy' as const)

  // Build parse context for DEX decoders
  const ctx: ParseContext = {
    preTokenBalances: meta.preTokenBalances,
    postTokenBalances: meta.postTokenBalances,
    allKeys: fullKeys,
  }

  // 3. Decode each top-level instruction
  const entries: DecodedInstructionEntry[] = []
  for (let i = 0; i < message.instructions.length; i++) {
    const instr = message.instructions[i]!
    const decoded = decodeTopLevel(instr, fullKeys, ctx)

    // Collect inner instructions for this index
    const innerSet = meta.innerInstructions.find((s) => s.index === i)
    const innerDecoded: DecodedInstruction[] = []
    if (innerSet) {
      for (const inner of innerSet.instructions) {
        innerDecoded.push(decodeTopLevel(inner, fullKeys, ctx))
      }
    }

    entries.push({
      index: i,
      instruction: decoded,
      innerInstructions: innerDecoded,
    })
  }

  // 4. Optionally detect swap
  const swap = parseTransaction(notification, options) ?? undefined

  const { logMessages, computeUnitsConsumed } = notification.transaction.meta

  return {
    signature: notification.signature,
    slot: notification.slot,
    blockTime: notification.blockTime ?? undefined,
    version,
    fee: meta.fee,
    feePayer,
    err: meta.err,
    computeUnitsConsumed: computeUnitsConsumed ?? undefined,
    logMessages: logMessages ?? undefined,
    instructions: entries,
    swap,
  }
}

function decodeTopLevel(instr: Instruction, fullKeys: string[], ctx: ParseContext): DecodedInstruction {
  const programId = getInstructionProgramId(instr, fullKeys)
  if (!programId) {
    return { program: 'unknown', programId: '', accounts: [], data: '' }
  }

  if (isCompiledInstruction(instr)) {
    const accounts = resolveCompiledAccounts(instr, fullKeys)
    return decodeInstruction(programId, instr.data, accounts, ctx)
  }

  if (isUnparsedInstr(instr)) {
    return decodeInstruction(programId, instr.data, instr.accounts, ctx)
  }

  // Fallback for pre-parsed instructions (from jsonParsed encoding)
  return { program: 'unknown', programId, accounts: [], data: '' }
}

function resolveCompiledAccounts(instr: CompiledInstruction, fullKeys: string[]): string[] {
  return instr.accounts.map((idx) => fullKeys[idx] ?? '')
}

function isUnparsedInstr(instr: Instruction): instr is UnparsedInstruction {
  return (
    'programId' in instr &&
    'accounts' in instr &&
    'data' in instr &&
    Array.isArray(instr.accounts) &&
    (instr.accounts.length === 0 || typeof instr.accounts[0] === 'string')
  )
}
