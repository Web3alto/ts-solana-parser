import { SOL_DECIMALS, SOL_MINT, WSOL_MINT } from '../constants.ts'
import type { TokenChange, WarningCode } from '../types.ts'
import type { NormalizedTransactionMeta } from './accounts.ts'
import type { IdlSelection } from './idl-scoring.ts'

export interface OwnerTokenState {
  deltasByOwner: Map<string, Map<string, bigint>>
  decimalsByOwner: Map<string, Map<string, number>>
  malformedBalanceEntries: number
}

export function normalizeMint(mint: string): string {
  return mint === WSOL_MINT ? SOL_MINT : mint
}

function getOrCreateMap<V>(map: Map<string, Map<string, V>>, key: string): Map<string, V> {
  let inner = map.get(key)
  if (inner) return inner
  inner = new Map()
  map.set(key, inner)
  return inner
}

const DIGITS_ONLY = /^[0-9]+$/

function parseRawAmount(raw: string): bigint | null {
  if (!DIGITS_ONLY.test(raw)) return null
  return BigInt(raw)
}

export function buildOwnerTokenState(meta: NormalizedTransactionMeta): OwnerTokenState {
  const deltasByOwner = new Map<string, Map<string, bigint>>()
  const decimalsByOwner = new Map<string, Map<string, number>>()
  let malformedBalanceEntries = 0

  for (const tb of meta.preTokenBalances) {
    const owner = tb.owner
    const parsedAmount = parseRawAmount(tb.uiTokenAmount.amount)
    if (!owner || parsedAmount === null) {
      malformedBalanceEntries++
      continue
    }
    const ownerDeltas = getOrCreateMap(deltasByOwner, owner)
    ownerDeltas.set(tb.mint, (ownerDeltas.get(tb.mint) ?? 0n) - parsedAmount)

    const ownerDecimals = getOrCreateMap(decimalsByOwner, owner)
    ownerDecimals.set(tb.mint, tb.uiTokenAmount.decimals)
  }

  for (const tb of meta.postTokenBalances) {
    const owner = tb.owner
    const parsedAmount = parseRawAmount(tb.uiTokenAmount.amount)
    if (!owner || parsedAmount === null) {
      malformedBalanceEntries++
      continue
    }
    const ownerDeltas = getOrCreateMap(deltasByOwner, owner)
    ownerDeltas.set(tb.mint, (ownerDeltas.get(tb.mint) ?? 0n) + parsedAmount)

    const ownerDecimals = getOrCreateMap(decimalsByOwner, owner)
    ownerDecimals.set(tb.mint, tb.uiTokenAmount.decimals)
  }

  return { deltasByOwner, decimalsByOwner, malformedBalanceEntries }
}

export function computeTokenChanges(state: OwnerTokenState, user: string): TokenChange[] {
  const userDeltas = state.deltasByOwner.get(user)
  const userDecimals = state.decimalsByOwner.get(user)
  if (!userDeltas || !userDecimals) return []

  const out: TokenChange[] = []
  for (const [mint, rawDelta] of userDeltas) {
    if (rawDelta === 0n) continue
    const decimals = userDecimals.get(mint)
    if (decimals === undefined) continue
    out.push({ mint, rawDelta, decimals })
  }
  return out
}

export function computeSolChange(
  meta: NormalizedTransactionMeta,
  accountIndexMap: Map<string, number>,
  user: string,
): TokenChange | null {
  const userIdx = accountIndexMap.get(user)
  if (userIdx === undefined) return null

  const pre = meta.preBalances[userIdx]
  const post = meta.postBalances[userIdx]
  if (pre === undefined || post === undefined) return null

  const feeAdjust = userIdx === 0 ? BigInt(meta.fee) : 0n
  const trueDelta = BigInt(post) - BigInt(pre) + feeAdjust
  if (trueDelta === 0n) return null

  return { mint: SOL_MINT, rawDelta: trueDelta, decimals: SOL_DECIMALS }
}

/**
 * Consolidates token changes by normalized mint, merging WSOL into SOL,
 * then folds in the native SOL lamport change. Entries that net to zero
 * after consolidation are filtered out.
 */
export function mergeChanges(tokenChanges: TokenChange[], solChange: TokenChange | null): TokenChange[] {
  const byMint = new Map<string, { mint: string; rawDelta: bigint; decimals: number }>()

  for (const change of tokenChanges) {
    const mint = normalizeMint(change.mint)
    const existing = byMint.get(mint)
    if (existing) {
      existing.rawDelta += change.rawDelta
      continue
    }
    byMint.set(mint, {
      mint,
      rawDelta: change.rawDelta,
      decimals: change.decimals,
    })
  }

  if (solChange) {
    const existing = byMint.get(SOL_MINT)
    if (existing) {
      existing.rawDelta += solChange.rawDelta
    } else {
      byMint.set(SOL_MINT, {
        mint: solChange.mint,
        rawDelta: solChange.rawDelta,
        decimals: solChange.decimals,
      })
    }
  }

  return [...byMint.values()].filter((c) => c.rawDelta !== 0n)
}

interface InputOutputResult {
  input: TokenChange
  output: TokenChange
  warnings: WarningCode[]
}

/**
 * Picks the single input (negative delta) and output (positive delta) token
 * changes that represent the swap. Uses a two-strategy approach:
 *
 * 1. **IDL-anchored** (when `selectedIdl` is present): matches the IDL-declared
 *    fromMint/toMint against the merged changes for an exact anchor.
 * 2. **Heuristic fallback**: selects the largest-magnitude negative change as
 *    input and largest positive change as output. If IDL anchoring was attempted
 *    but failed, a `'IDL_MINTS_NOT_FOUND_IN_PRIMARY_DELTAS'` warning is emitted.
 *
 * Returns `null` if there are no negative or no positive changes.
 */
export function selectInputOutputChanges(
  merged: TokenChange[],
  selectedIdl: IdlSelection | null,
  /** Pre-normalized IDL mints to avoid redundant normalization */
  normalizedIdlMints?: { from: string; to: string },
): InputOutputResult | null {
  const inputs = merged.filter((c) => c.rawDelta < 0n)
  const outputs = merged.filter((c) => c.rawDelta > 0n)
  if (inputs.length === 0 || outputs.length === 0) return null

  if (selectedIdl) {
    const idlFrom = normalizedIdlMints?.from ?? normalizeMint(selectedIdl.candidate.swap.tokenFrom)
    const idlTo = normalizedIdlMints?.to ?? normalizeMint(selectedIdl.candidate.swap.tokenTo)
    const anchoredInput = inputs.find((c) => c.mint === idlFrom)
    const anchoredOutput = outputs.find((c) => c.mint === idlTo)
    if (anchoredInput && anchoredOutput) {
      return { input: anchoredInput, output: anchoredOutput, warnings: [] }
    }
    // Fall through to heuristic with warning
    const input = inputs.reduce((a, b) => (a.rawDelta < b.rawDelta ? a : b))
    const output = outputs.reduce((a, b) => (a.rawDelta > b.rawDelta ? a : b))
    return { input, output, warnings: ['IDL_MINTS_NOT_FOUND_IN_PRIMARY_DELTAS'] }
  }

  const input = inputs.reduce((a, b) => (a.rawDelta < b.rawDelta ? a : b))
  const output = outputs.reduce((a, b) => (a.rawDelta > b.rawDelta ? a : b))
  return { input, output, warnings: [] }
}
