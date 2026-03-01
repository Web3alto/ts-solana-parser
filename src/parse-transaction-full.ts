import { decodeInstruction } from './decoders/registry.ts'
import type { ParseContext } from './idl/types.ts'
import type { DecodedInstruction, DecodedInstructionEntry, FullTransactionResult } from './instruction-types.ts'
import { normalizeTransactionData } from './normalize.ts'
import {
  buildFullAccountKeys,
  buildParseContext,
  getInstructionProgramId,
  isCompiledInstruction,
  isUnparsedInstruction,
  normalizeMetaWithLookups,
} from './parser/accounts.ts'
import { _parseTransactionWithPrepared } from './parser.ts'
import { TransactionNotificationSchema, validateWithZod } from './schemas.ts'
import { detectTips } from './tips.ts'
import type {
  CompiledInstruction,
  Instruction,
  ParserOptions,
  TransactionMessage,
  TransactionNotification,
} from './types.ts'

export function parseFullTransaction(
  notification: TransactionNotification,
  options?: ParserOptions,
  /** @internal Skip Zod validation (caller already validated) */
  _skipValidation?: boolean,
): FullTransactionResult | null {
  // 1. Validate input
  if (!_skipValidation) {
    validateWithZod(TransactionNotificationSchema, notification)
  }

  // 2. Normalize transaction data
  let message: TransactionMessage
  try {
    ;({ message } = normalizeTransactionData(notification.transaction.transaction))
  } catch {
    return null
  }

  // 3. Resolve lookups and build full account keys
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

  // Build parse context (shared with DEX decoders and swap parser)
  const ctx = buildParseContext(meta, fullKeys)

  // 4. Pre-index inner instructions by outer instruction index
  const innerByIndex = new Map<number, (typeof meta.innerInstructions)[number]>()
  for (const inner of meta.innerInstructions) {
    innerByIndex.set(inner.index, inner)
  }

  // 5. Decode each top-level instruction
  const entries: DecodedInstructionEntry[] = []
  for (let i = 0; i < message.instructions.length; i++) {
    const instr = message.instructions[i]!
    const decoded = decodeTopLevel(instr, fullKeys, ctx)

    // Collect inner instructions for this index
    const innerSet = innerByIndex.get(i)
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

  // 6. Detect MEV tips
  const tips = detectTips(entries)

  // 7. Optionally detect swap (pass pre-computed ctx + tips to avoid redundant work)
  const swap = _parseTransactionWithPrepared(message, meta, fullKeys, ctx, notification, options, tips) ?? undefined

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
    tips,
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

  if (isUnparsedInstruction(instr)) {
    return decodeInstruction(programId, instr.data, instr.accounts, ctx)
  }

  // Fallback for pre-parsed instructions (from jsonParsed encoding)
  return { program: 'unknown', programId, accounts: [], data: '' }
}

function resolveCompiledAccounts(instr: CompiledInstruction, fullKeys: string[]): string[] {
  return instr.accounts.map((idx) => fullKeys[idx] ?? '')
}
