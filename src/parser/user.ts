import type { TransactionMessage } from '../types.ts'
import type { NormalizedTransactionMeta } from './accounts.ts'
import type { OwnerTokenState } from './balance.ts'

export function buildSignerSet(message: TransactionMessage, feePayer: string): Set<string> {
  const out = new Set<string>()
  out.add(feePayer)
  for (const key of message.accountKeys) {
    if (typeof key === 'string') continue
    if (key.signer) out.add(key.pubkey)
  }
  return out
}

function hasBidirectionalDelta(deltas: Map<string, bigint>): boolean {
  let hasPositive = false
  let hasNegative = false
  for (const delta of deltas.values()) {
    if (delta > 0n) hasPositive = true
    if (delta < 0n) hasNegative = true
    if (hasPositive && hasNegative) return true
  }
  return false
}

/**
 * Identifies the most likely swap initiator among all token-holding accounts.
 * Uses a two-phase scoring strategy:
 *
 * **Phase 1 -- Bidirectional deltas:** Only considers owners whose token deltas
 * include both a positive and negative change (strong swap signal). Scores:
 * - **+4** if the owner is the fee payer
 * - **+3** if the owner is a transaction signer
 * - **+2** if the owner has a non-zero native SOL delta
 *
 * **Phase 2 -- Fallback:** If no bidirectional-delta owner is found, falls back
 * to any owner with a non-zero token change, a SOL delta, and preferring signers.
 * If no match is found at all, defaults to the fee payer.
 */
export function findSwapUser(
  state: OwnerTokenState,
  accountIndexMap: Map<string, number>,
  meta: NormalizedTransactionMeta,
  feePayer: string,
  signerSet: Set<string>,
): string {
  let bestOwner: string | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  for (const [owner, deltas] of state.deltasByOwner) {
    if (!hasBidirectionalDelta(deltas)) continue
    const ownerIdx = accountIndexMap.get(owner)
    const preSol = ownerIdx !== undefined ? meta.preBalances[ownerIdx] : undefined
    const postSol = ownerIdx !== undefined ? meta.postBalances[ownerIdx] : undefined
    const hasSolDelta = preSol !== undefined && postSol !== undefined && preSol !== postSol

    let score = 0
    if (owner === feePayer) score += 4
    if (signerSet.has(owner)) score += 3
    if (hasSolDelta) score += 2

    if (score > bestScore) {
      bestScore = score
      bestOwner = owner
    }
  }
  if (bestOwner) return bestOwner

  let bestFallback: string | null = null
  for (const [owner, deltas] of state.deltasByOwner) {
    let hasTokenChange = false
    for (const delta of deltas.values()) {
      if (delta !== 0n) {
        hasTokenChange = true
        break
      }
    }
    if (!hasTokenChange) continue

    const ownerIdx = accountIndexMap.get(owner)
    if (ownerIdx === undefined) continue

    const preSol = meta.preBalances[ownerIdx]
    const postSol = meta.postBalances[ownerIdx]
    if (preSol !== undefined && postSol !== undefined && preSol !== postSol) {
      if (signerSet.has(owner)) return owner
      if (!bestFallback) bestFallback = owner
    }
  }

  return bestFallback ?? feePayer
}
