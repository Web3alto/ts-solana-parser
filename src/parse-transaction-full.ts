import type { DecodedInstruction, DecodedInstructionEntry, FullTransactionResult } from './instruction-types.ts'
import { normalizeTransactionData } from './normalize.ts'
import { buildFullAccountKeys, buildParseContext, normalizeMetaWithLookups } from './parser/accounts.ts'
import {
  collectPreparedIdlCandidates,
  decodePreparedInstruction,
  prepareInstructions,
  protocolsFromIdlCandidates,
  type PreparedInstruction,
} from './parser/prepared-instructions.ts'
import { _parseTransactionWithPrepared } from './parser.ts'
import { TransactionNotificationSchema, validateWithZod } from './schemas.ts'
import { detectTips } from './tips.ts'
import type { ParserOptions, TransactionMessage, TransactionNotification } from './types.ts'

/**
 * Decode all instructions and detect swap without input validation.
 * @returns Full decoded transaction or null on decode failure.
 */
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
  } catch (err) {
    options?.onInternalError?.(err)
    return null
  }

  // 3. Resolve lookups and build full account keys
  const resolvedLookups =
    message.addressTableLookups?.length && options?.resolveAddressTableLookups
      ? options.resolveAddressTableLookups(message.addressTableLookups)
      : null
  const meta = normalizeMetaWithLookups(notification.transaction.meta, resolvedLookups)
  const fullKeys = buildFullAccountKeys(message, meta)
  if (fullKeys.length === 0) {
    options?.onInternalError?.(new Error('No account keys resolved from transaction'))
    return null
  }

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
  const topLevelPrepared = prepareInstructions(message.instructions, fullKeys)
  const allPrepared: PreparedInstruction[] = [...topLevelPrepared]
  for (let i = 0; i < message.instructions.length; i++) {
    const decoded = decodePreparedInstruction(topLevelPrepared[i]!, ctx)

    // Collect inner instructions for this index
    const innerSet = innerByIndex.get(i)
    const innerDecoded: DecodedInstruction[] = []
    if (innerSet) {
      const innerPrepared = prepareInstructions(innerSet.instructions, fullKeys)
      allPrepared.push(...innerPrepared)
      for (const prepared of innerPrepared) {
        innerDecoded.push(decodePreparedInstruction(prepared, ctx))
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
  const idlCandidates = collectPreparedIdlCandidates(allPrepared, ctx)
  const protocols = protocolsFromIdlCandidates(idlCandidates)

  // 7. Optionally detect swap (pass pre-computed ctx + tips to avoid redundant work)
  const swap =
    _parseTransactionWithPrepared(
      message,
      meta,
      fullKeys,
      ctx,
      notification,
      options,
      tips,
      allPrepared,
      idlCandidates,
      protocols,
    ) ?? undefined

  const { logMessages, computeUnitsConsumed } = notification.transaction.meta

  return {
    signature: notification.signature,
    slot: notification.slot,
    blockTime: notification.blockTime ?? undefined,
    version,
    fee: meta.fee.toString(),
    feePayer,
    err: meta.err,
    computeUnitsConsumed: computeUnitsConsumed ?? undefined,
    logMessages: logMessages ?? undefined,
    instructions: entries,
    tips,
    swap,
  }
}
