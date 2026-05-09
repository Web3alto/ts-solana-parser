import { formatTokenAmountDecimal, toApproxTokenAmountNumber } from './amount.ts'
import type { Protocol } from './constants.ts'
import { DecodeError, UnsupportedEncodingError } from './errors.ts'
import type { AmountConstraintKind, ParseContext } from './idl/types.ts'
import { normalizeTransactionData } from './normalize.ts'
import type { NormalizedTransactionMeta } from './parser/accounts.ts'
import {
  buildFullAccountKeys,
  buildParseContext,
  getAllInstructions,
  hasUnresolvedAddressLookupIndexes,
  normalizeMetaWithLookups,
} from './parser/accounts.ts'
import {
  buildOwnerTokenState,
  computeSolChange,
  computeTokenChanges,
  mergeChanges,
  normalizeMint,
  selectInputOutputChanges,
} from './parser/balance.ts'
import { detectAggregator, extractPoolAddress } from './parser/detection.ts'
import {
  approximatelyEqualBigInt,
  countRouteHops,
  type IdlCandidate,
  resolveTokenPrograms,
  selectBestIdlCandidate,
} from './parser/idl-scoring.ts'
import {
  collectPreparedIdlCandidates,
  prepareInstructions,
  protocolsFromIdlCandidates,
  type PreparedInstruction,
} from './parser/prepared-instructions.ts'
import { TransactionNotificationSchema, validateWithZod } from './schemas.ts'
import { detectTipsFromPreparedInstructions } from './tips.ts'
import type {
  Instruction,
  MevTip,
  ParseCode,
  ParsedSwap,
  ParseOutcome,
  ParserOptions,
  SwapType,
  TransactionMessage,
  TransactionNotification,
  WarningCode,
} from './types.ts'

function makeOutcome(
  kind: ParseOutcome['kind'],
  warnings: WarningCode[],
  code?: ParseCode,
  errorMessage?: string,
  swap?: ParsedSwap,
): ParseOutcome {
  return {
    kind,
    code,
    errorMessage,
    warnings,
    swap,
  }
}

function validateAmountConstraint(
  side: 'input' | 'output',
  kind: AmountConstraintKind | undefined,
  expected: bigint,
  actual: bigint,
): WarningCode | null {
  switch (kind ?? 'exact') {
    case 'exact':
      return approximatelyEqualBigInt(expected, actual) ? null : 'IDL_BALANCE_AMOUNT_MISMATCH'
    case 'max':
      if (actual <= expected) return null
      return side === 'input' ? 'IDL_INPUT_AMOUNT_EXCEEDS_MAX' : 'IDL_BALANCE_AMOUNT_MISMATCH'
    case 'min':
      if (actual >= expected) return null
      return side === 'output' ? 'IDL_OUTPUT_AMOUNT_BELOW_MIN' : 'IDL_BALANCE_AMOUNT_MISMATCH'
    case 'unknown':
      return null
  }
}

function pushUniqueWarning(warnings: WarningCode[], warning: WarningCode | null): void {
  if (warning && !warnings.includes(warning)) warnings.push(warning)
}

/**
 * Parse a swap from a `TransactionNotification`. Validates with Zod internally.
 * @returns Full {@link ParseOutcome} with diagnostic info (kind, warnings, errors).
 */
export function parseTransactionDetailed(
  notification: TransactionNotification,
  options?: ParserOptions,
  /** @internal Pre-computed normalization to skip redundant work (used by parseFullTransaction) */
  _prepared?: {
    message: TransactionMessage
    meta: NormalizedTransactionMeta
    fullKeys: string[]
    ctx?: ParseContext
    tips?: readonly MevTip[] | undefined
    preparedInstructions?: readonly PreparedInstruction[] | undefined
    idlCandidates?: readonly IdlCandidate[] | undefined
    protocols?: readonly Protocol[] | undefined
  },
  /** @internal Skip Zod validation (caller already validated) */
  _skipValidation?: boolean,
): ParseOutcome {
  const warnings: WarningCode[] = []

  let message: TransactionMessage
  let meta: NormalizedTransactionMeta
  let fullKeys: string[]
  let allInstructions: Instruction[] | undefined
  let ctx: ParseContext | undefined = _prepared?.ctx
  let preparedInstructions: readonly PreparedInstruction[] | undefined = _prepared?.preparedInstructions

  if (_prepared) {
    ;({ message, meta, fullKeys } = _prepared)
  } else {
    if (!_skipValidation) {
      validateWithZod(TransactionNotificationSchema, notification)
    }

    try {
      ;({ message } = normalizeTransactionData(notification.transaction.transaction))
    } catch (err) {
      if (err instanceof UnsupportedEncodingError) {
        return makeOutcome('unsupported', warnings, 'UNSUPPORTED_ENCODING', err.message)
      }
      if (err instanceof DecodeError) {
        if (err.message.startsWith('Unsupported transaction version')) {
          return makeOutcome('unsupported', warnings, 'UNSUPPORTED_TX_VERSION', err.message)
        }
        return makeOutcome('error', warnings, 'DECODE_ERROR', err.message)
      }
      options?.onInternalError?.(err)
      return makeOutcome('error', warnings, 'INTERNAL_ERROR', String(err))
    }

    try {
      const resolvedLookups =
        message.addressTableLookups?.length && options?.resolveAddressTableLookups
          ? options.resolveAddressTableLookups(message.addressTableLookups)
          : null
      if (message.addressTableLookups?.length && !resolvedLookups && options?.resolveAddressTableLookups) {
        warnings.push('ALT_RESOLUTION_INCOMPLETE')
      }
      meta = normalizeMetaWithLookups(notification.transaction.meta, resolvedLookups)

      if (meta.err !== null) return makeOutcome('not_swap', warnings, 'META_ERR')

      allInstructions = getAllInstructions(message, meta)
      if (hasUnresolvedAddressLookupIndexes(message, meta, allInstructions)) {
        return makeOutcome(
          'unsupported',
          warnings,
          resolvedLookups ? 'ALT_RESOLUTION_FAILED' : 'MISSING_LOADED_ADDRESSES',
          'Versioned transaction references address lookup indexes without loaded addresses',
        )
      }

      fullKeys = buildFullAccountKeys(message, meta)
      if (fullKeys.length === 0) return makeOutcome('not_swap', warnings, 'NO_SWAP_SIGNAL')
    } catch (err) {
      options?.onInternalError?.(err)
      return makeOutcome('error', warnings, 'INTERNAL_ERROR', String(err))
    }
  }

  try {
    if (meta.err !== null) return makeOutcome('not_swap', warnings, 'META_ERR')
    if (fullKeys.length === 0) return makeOutcome('not_swap', warnings, 'NO_SWAP_SIGNAL')

    const feePayer = fullKeys[0]
    if (!feePayer) return makeOutcome('error', warnings, 'INTERNAL_ERROR', 'Missing fee payer')

    const { signature, slot, blockTime } = notification
    if (!allInstructions) allInstructions = getAllInstructions(message, meta)
    if (!ctx) ctx = buildParseContext(meta, fullKeys)
    if (!preparedInstructions) preparedInstructions = prepareInstructions(allInstructions, fullKeys)
    const idlCandidates = _prepared?.idlCandidates ?? collectPreparedIdlCandidates(preparedInstructions, ctx)
    const protocols = _prepared?.protocols ?? protocolsFromIdlCandidates(idlCandidates)
    const routedVia = detectAggregator(message.instructions, fullKeys)
    if (protocols.length === 0 || idlCandidates.length === 0) {
      return makeOutcome('not_swap', warnings, 'NO_SWAP_SIGNAL')
    }

    const state = buildOwnerTokenState(meta)
    if (state.malformedBalanceEntries > 0) {
      warnings.push('MALFORMED_BALANCE_ENTRIES_SKIPPED')
    }
    let hopCount = countRouteHops(idlCandidates)
    if (hopCount === 1 && protocols.length > 1) {
      hopCount = protocols.length
    }
    const routeType: ParsedSwap['routeType'] = hopCount > 1 ? 'multi-hop' : 'single-hop'
    if (routeType === 'multi-hop') warnings.push('MULTI_HOP_ROUTE')

    const idlSelection = selectBestIdlCandidate(idlCandidates, state, feePayer)
    const selectedIdl = idlSelection && idlSelection.score >= 6 ? idlSelection : null

    if (idlSelection && idlSelection.confidence === 'low') {
      warnings.push('LOW_CONFIDENCE_IDL_ATTRIBUTION')
    }
    if (idlSelection && !selectedIdl) {
      warnings.push('IDL_SCORE_TOO_LOW_FALLBACK_TO_HEURISTIC_USER')
    }
    if (!selectedIdl) {
      return makeOutcome('not_swap', warnings, 'NO_SWAP_SIGNAL')
    }

    const user = selectedIdl.candidate.swap.signer
    if (!user) {
      return makeOutcome('not_swap', warnings, 'NO_USER_CANDIDATE')
    }

    const tokenChanges = computeTokenChanges(state, user)
    const solChange = computeSolChange(meta, ctx.keyIndexMap, user)
    const merged = mergeChanges(tokenChanges, solChange)
    if (merged.length === 0) return makeOutcome('not_swap', warnings, 'NO_BALANCE_DELTA')

    // Normalize IDL mints once, reuse for both selectInputOutputChanges and swap type detection
    const idlMints = selectedIdl
      ? {
          from: normalizeMint(selectedIdl.candidate.swap.tokenFrom),
          to: normalizeMint(selectedIdl.candidate.swap.tokenTo),
        }
      : undefined
    const selectedPair = selectInputOutputChanges(merged, selectedIdl, idlMints)
    if (!selectedPair) return makeOutcome('not_swap', warnings, 'NO_INPUT_OUTPUT_PAIR')
    const { input, output } = selectedPair
    for (const w of selectedPair.warnings) warnings.push(w)

    const pool = extractPoolAddress(allInstructions, fullKeys, protocols)
    const tips = _prepared?.tips ?? detectTipsFromPreparedInstructions(preparedInstructions)

    const inputRaw = -input.rawDelta
    const outputRaw = output.rawDelta
    const inputAmountDecimal = formatTokenAmountDecimal(inputRaw, input.decimals)
    const outputAmountDecimal = formatTokenAmountDecimal(outputRaw, output.decimals)

    let swapType: SwapType | undefined
    if (selectedIdl && idlMints) {
      const flipped = idlMints.from === output.mint && idlMints.to === input.mint

      if (idlMints.from === input.mint && idlMints.to === output.mint) {
        swapType = selectedIdl.candidate.swap.type
      } else if (flipped) {
        swapType = selectedIdl.candidate.swap.type
      } else {
        warnings.push('IDL_MINT_MISMATCH_WITH_BALANCE_DELTA')
      }

      const expectedInput = flipped ? selectedIdl.candidate.swap.amountTo : selectedIdl.candidate.swap.amountFrom
      const expectedOutput = flipped ? selectedIdl.candidate.swap.amountFrom : selectedIdl.candidate.swap.amountTo
      const expectedInputKind = flipped
        ? selectedIdl.candidate.swap.amountToKind
        : selectedIdl.candidate.swap.amountFromKind
      const expectedOutputKind = flipped
        ? selectedIdl.candidate.swap.amountFromKind
        : selectedIdl.candidate.swap.amountToKind

      pushUniqueWarning(warnings, validateAmountConstraint('input', expectedInputKind, expectedInput, inputRaw))
      pushUniqueWarning(warnings, validateAmountConstraint('output', expectedOutputKind, expectedOutput, outputRaw))
    }

    const tokenProgramInfo = resolveTokenPrograms(options, input.mint, output.mint)
    if (warnings.includes('IDL_BALANCE_AMOUNT_MISMATCH')) {
      if (
        !options?.resolveMintTokenProgram ||
        tokenProgramInfo.inputTokenProgram === 'token-2022' ||
        tokenProgramInfo.outputTokenProgram === 'token-2022'
      ) {
        warnings.push('POSSIBLE_TOKEN2022_TRANSFER_FEE')
      }
    }

    const swap: ParsedSwap = {
      signature,
      slot,
      blockTime: blockTime ?? undefined,
      user,
      feePayer,
      protocols,
      hopCount,
      routeType,
      routedVia,
      inputMint: input.mint,
      inputRaw: inputRaw.toString(),
      inputDecimals: input.decimals,
      inputAmountDecimal,
      inputAmountNumber: toApproxTokenAmountNumber(inputRaw, input.decimals),
      inputTokenProgram: tokenProgramInfo.inputTokenProgram,
      outputMint: output.mint,
      outputRaw: outputRaw.toString(),
      outputDecimals: output.decimals,
      outputAmountDecimal,
      outputAmountNumber: toApproxTokenAmountNumber(outputRaw, output.decimals),
      outputTokenProgram: tokenProgramInfo.outputTokenProgram,
      tips,
      pool,
      swapType,
      confidence: selectedIdl?.confidence ?? 'medium',
      warnings,
      fee: meta.fee.toString(),
    }

    return makeOutcome('swap', warnings, undefined, undefined, swap)
  } catch (err) {
    options?.onInternalError?.(err)
    if (warnings.includes('MALFORMED_BALANCE_ENTRIES_SKIPPED')) {
      return makeOutcome('error', warnings, 'MALFORMED_BALANCE_DATA', String(err))
    }
    return makeOutcome('error', warnings, 'INTERNAL_ERROR', String(err))
  }
}

/** @internal Used by parseFullTransaction to avoid double normalization */
export function _parseTransactionWithPrepared(
  message: TransactionMessage,
  meta: NormalizedTransactionMeta,
  fullKeys: string[],
  ctx: ParseContext,
  notification: TransactionNotification,
  options?: ParserOptions,
  tips?: readonly MevTip[] | undefined,
  preparedInstructions?: readonly PreparedInstruction[] | undefined,
  idlCandidates?: readonly IdlCandidate[] | undefined,
  protocols?: readonly Protocol[] | undefined,
): ParsedSwap | null {
  const outcome = parseTransactionDetailed(notification, options, {
    message,
    meta,
    fullKeys,
    ctx,
    tips,
    preparedInstructions,
    idlCandidates,
    protocols,
  })
  return outcome.swap ?? null
}
