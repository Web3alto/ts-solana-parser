import { SOL_DECIMALS, SOL_MINT, WSOL_MINT } from '../constants.ts'
import { NATIVE_SOL_MINT } from '../idl/types.ts'
import type { TokenChange, WarningCode } from '../types.ts'
import type { NormalizedTransactionMeta } from './accounts.ts'

export interface OwnerTokenState {
  deltasByOwner: Map<string, Map<string, bigint>>
  decimalsByOwner: Map<string, Map<string, number>>
  malformedBalanceEntries: number
}

export function normalizeMint(mint: string): string {
  return mint === NATIVE_SOL_MINT ? SOL_MINT : mint
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  const existing = map.get(key)
  if (existing !== undefined) return existing
  const next = create()
  map.set(key, next)
  return next
}

export function buildOwnerTokenState(meta: NormalizedTransactionMeta): OwnerTokenState {
  const deltasByOwner = new Map<string, Map<string, bigint>>()
  const decimalsByOwner = new Map<string, Map<string, number>>()
  let malformedBalanceEntries = 0

  function parseRawAmount(raw: string): bigint | null {
    if (!/^[0-9]+$/.test(raw)) return null
    try {
      return BigInt(raw)
    } catch {
      return null
    }
  }

  for (const tb of meta.preTokenBalances) {
    const owner = tb.owner
    const parsedAmount = parseRawAmount(tb.uiTokenAmount.amount)
    if (!owner || parsedAmount === null) {
      malformedBalanceEntries++
      continue
    }
    const ownerDeltas = getOrCreate(deltasByOwner, owner, () => new Map())
    ownerDeltas.set(tb.mint, (ownerDeltas.get(tb.mint) ?? 0n) - parsedAmount)

    const ownerDecimals = getOrCreate(decimalsByOwner, owner, () => new Map())
    ownerDecimals.set(tb.mint, tb.uiTokenAmount.decimals)
  }

  for (const tb of meta.postTokenBalances) {
    const owner = tb.owner
    const parsedAmount = parseRawAmount(tb.uiTokenAmount.amount)
    if (!owner || parsedAmount === null) {
      malformedBalanceEntries++
      continue
    }
    const ownerDeltas = getOrCreate(deltasByOwner, owner, () => new Map())
    ownerDeltas.set(tb.mint, (ownerDeltas.get(tb.mint) ?? 0n) + parsedAmount)

    const ownerDecimals = getOrCreate(decimalsByOwner, owner, () => new Map())
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

export function mergeChanges(tokenChanges: TokenChange[], solChange: TokenChange | null): TokenChange[] {
  const byMint = new Map<string, { mint: string; rawDelta: bigint; decimals: number }>()

  for (const change of tokenChanges) {
    const mint = change.mint === WSOL_MINT ? SOL_MINT : change.mint
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

export function selectInputOutputChanges(
  merged: TokenChange[],
  selectedIdl: {
    candidate: { swap: { tokenFrom: string; tokenTo: string } }
  } | null,
  warnings: WarningCode[],
): { input: TokenChange; output: TokenChange } | null {
  const inputs = merged.filter((c) => c.rawDelta < 0n)
  const outputs = merged.filter((c) => c.rawDelta > 0n)
  if (inputs.length === 0 || outputs.length === 0) return null

  if (selectedIdl) {
    const idlFrom = normalizeMint(selectedIdl.candidate.swap.tokenFrom)
    const idlTo = normalizeMint(selectedIdl.candidate.swap.tokenTo)
    const anchoredInput = inputs.find((c) => c.mint === idlFrom)
    const anchoredOutput = outputs.find((c) => c.mint === idlTo)
    if (anchoredInput && anchoredOutput) {
      return { input: anchoredInput, output: anchoredOutput }
    }
    warnings.push('idl-mints-not-found-in-primary-deltas')
  }

  const input = inputs.reduce((a, b) => (a.rawDelta < b.rawDelta ? a : b))
  const output = outputs.reduce((a, b) => (a.rawDelta > b.rawDelta ? a : b))
  return { input, output }
}
