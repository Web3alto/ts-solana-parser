import { formatTokenAmountDecimal, toApproxTokenAmountNumber } from './amount.ts'
import { DecodeError, UnsupportedEncodingError } from './errors.ts'
import { normalizeTransactionData } from './normalize.ts'
import {
  buildAccountIndexMap,
  buildFullAccountKeys,
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
import { detectProtocols, extractPoolAddress } from './parser/detection.ts'
import {
  approximatelyEqualBigInt,
  collectIdlCandidates,
  countRouteHops,
  resolveTokenPrograms,
  selectBestIdlCandidate,
} from './parser/idl-scoring.ts'
import { buildSignerSet, findSwapUser } from './parser/user.ts'
import type {
  ParseCode,
  ParsedSwap,
  ParseOutcome,
  ParserOptions,
  SwapType,
  TransactionNotification,
  WarningCode,
} from './types.ts'

// Re-export submodule public API for backwards compatibility
export {
  buildFullAccountKeys,
  getInstructionProgramId,
  isCompiledInstruction,
  isUnparsedInstruction,
  resolveAccountKey,
} from './parser/accounts.ts'
export { computeSolChange, computeTokenChanges, mergeChanges } from './parser/balance.ts'
export { detectProtocols, extractPoolAddress } from './parser/detection.ts'
export { findSwapUser } from './parser/user.ts'

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

export function parseTransactionDetailed(notification: TransactionNotification, options?: ParserOptions): ParseOutcome {
  const warnings: WarningCode[] = []

  let message: import('./types.ts').TransactionMessage
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
      warnings.push('alt-resolution-incomplete')
    }
    const meta = normalizeMetaWithLookups(notification.transaction.meta, resolvedLookups)
    const { signature, slot, blockTime } = notification

    if (meta.err !== null) return makeOutcome('not_swap', warnings, 'META_ERR')

    const allInstructions = getAllInstructions(message, meta)

    if (hasUnresolvedAddressLookupIndexes(message, meta, allInstructions)) {
      return makeOutcome(
        'unsupported',
        warnings,
        resolvedLookups ? 'ALT_RESOLUTION_FAILED' : 'MISSING_LOADED_ADDRESSES',
        'Versioned transaction references address lookup indexes without loaded addresses',
      )
    }

    const fullKeys = buildFullAccountKeys(message, meta)
    if (fullKeys.length === 0) return makeOutcome('not_swap', warnings, 'NO_SWAP_SIGNAL')

    const feePayer = fullKeys[0]
    if (!feePayer) return makeOutcome('error', warnings, 'INTERNAL_ERROR', 'Missing fee payer')

    const accountIndexMap = buildAccountIndexMap(fullKeys)
    const protocols = detectProtocols(allInstructions, fullKeys)
    if (protocols.length === 0) return makeOutcome('not_swap', warnings, 'NO_SWAP_SIGNAL')

    const state = buildOwnerTokenState(meta)
    if (state.malformedBalanceEntries > 0) {
      warnings.push('malformed-balance-entries-skipped')
    }
    const idlCandidates = collectIdlCandidates(allInstructions, meta, fullKeys)
    let hopCount = countRouteHops(idlCandidates)
    if (hopCount === 1 && protocols.length > 1) {
      hopCount = protocols.length
    }
    const routeType: ParsedSwap['routeType'] = hopCount > 1 ? 'multi-hop' : 'single-hop'
    if (routeType === 'multi-hop') warnings.push('multi-hop-route')

    const idlSelection = selectBestIdlCandidate(idlCandidates, state, feePayer)
    const selectedIdl = idlSelection && idlSelection.score >= 6 ? idlSelection : null

    if (idlSelection && idlSelection.confidence === 'low') {
      warnings.push('low-confidence-idl-attribution')
    }
    if (idlSelection && !selectedIdl) {
      warnings.push('idl-score-too-low-fallback-to-heuristic-user')
    }

    const signerSet = buildSignerSet(message, feePayer)
    const user = selectedIdl?.candidate.swap.signer ?? findSwapUser(state, accountIndexMap, meta, feePayer, signerSet)
    if (!user) {
      return makeOutcome('not_swap', warnings, 'NO_USER_CANDIDATE')
    }

    const tokenChanges = computeTokenChanges(state, user)
    const solChange = computeSolChange(meta, accountIndexMap, user)
    const merged = mergeChanges(tokenChanges, solChange)
    if (merged.length === 0) return makeOutcome('not_swap', warnings, 'NO_BALANCE_DELTA')
    const selectedPair = selectInputOutputChanges(merged, selectedIdl)
    if (!selectedPair) return makeOutcome('not_swap', warnings, 'NO_INPUT_OUTPUT_PAIR')
    const { input, output } = selectedPair
    for (const w of selectedPair.warnings) warnings.push(w)

    const pool = extractPoolAddress(allInstructions, fullKeys, protocols)

    const inputRaw = -input.rawDelta
    const outputRaw = output.rawDelta
    const inputAmountDecimal = formatTokenAmountDecimal(inputRaw, input.decimals)
    const outputAmountDecimal = formatTokenAmountDecimal(outputRaw, output.decimals)

    let swapType: SwapType | undefined
    if (selectedIdl) {
      // input.mint and output.mint are already normalized by mergeChanges
      const idlFrom = normalizeMint(selectedIdl.candidate.swap.tokenFrom)
      const idlTo = normalizeMint(selectedIdl.candidate.swap.tokenTo)
      const flipped = idlFrom === output.mint && idlTo === input.mint

      if (idlFrom === input.mint && idlTo === output.mint) {
        swapType = selectedIdl.candidate.swap.type
      } else if (flipped) {
        swapType = selectedIdl.candidate.swap.type
      } else {
        warnings.push('idl-mint-mismatch-with-balance-delta')
      }

      const expectedInput = flipped ? selectedIdl.candidate.swap.amountTo : selectedIdl.candidate.swap.amountFrom
      const expectedOutput = flipped ? selectedIdl.candidate.swap.amountFrom : selectedIdl.candidate.swap.amountTo
      if (!approximatelyEqualBigInt(expectedInput, inputRaw) || !approximatelyEqualBigInt(expectedOutput, outputRaw)) {
        warnings.push('idl-balance-amount-mismatch')
      }
    }

    const tokenProgramInfo = resolveTokenPrograms(options, input.mint, output.mint)
    if (warnings.includes('idl-balance-amount-mismatch')) {
      if (
        !options?.resolveMintTokenProgram ||
        tokenProgramInfo.inputTokenProgram === 'token-2022' ||
        tokenProgramInfo.outputTokenProgram === 'token-2022'
      ) {
        warnings.push('possible-token2022-transfer-fee')
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
      inputMint: input.mint,
      inputRaw: inputRaw.toString(),
      inputDecimals: input.decimals,
      inputAmountDecimal,
      inputAmountNumber: toApproxTokenAmountNumber(inputRaw, input.decimals),
      inputTokenProgram: tokenProgramInfo.inputTokenProgram,
      inputToken2022TransferFeeBps:
        tokenProgramInfo.inputTokenProgram === 'token-2022' ? tokenProgramInfo.token2022TransferFeeBps : null,
      outputMint: output.mint,
      outputRaw: outputRaw.toString(),
      outputDecimals: output.decimals,
      outputAmountDecimal,
      outputAmountNumber: toApproxTokenAmountNumber(outputRaw, output.decimals),
      outputTokenProgram: tokenProgramInfo.outputTokenProgram,
      outputToken2022TransferFeeBps:
        tokenProgramInfo.outputTokenProgram === 'token-2022' ? tokenProgramInfo.token2022TransferFeeBps : null,
      token2022TransferFeeBps: tokenProgramInfo.token2022TransferFeeBps,
      pool,
      swapType,
      confidence: selectedIdl?.confidence ?? 'medium',
      warnings,
      fee: meta.fee,
    }

    return makeOutcome('swap', warnings, undefined, undefined, swap)
  } catch (err) {
    options?.onInternalError?.(err)
    if (warnings.includes('malformed-balance-entries-skipped')) {
      return makeOutcome('error', warnings, 'MALFORMED_BALANCE_DATA', String(err))
    }
    return makeOutcome('error', warnings, 'INTERNAL_ERROR', String(err))
  }
}

export function parseTransaction(notification: TransactionNotification, options?: ParserOptions): ParsedSwap | null {
  const outcome = parseTransactionDetailed(notification, options)
  return outcome.swap ?? null
}
