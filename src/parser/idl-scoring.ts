import { tryParseInstruction } from '../idl/registry.ts'
import type { ParseContext, RawSwap } from '../idl/types.ts'
import type { Instruction, ParserOptions, TokenProgramKind } from '../types.ts'
import type { NormalizedTransactionMeta } from './accounts.ts'
import { isCompiledInstruction, isUnparsedInstruction } from './accounts.ts'
import { normalizeMint, type OwnerTokenState } from './balance.ts'

export interface IdlCandidate {
  programId: string
  swap: RawSwap
}

export interface IdlSelection {
  candidate: IdlCandidate
  confidence: 'high' | 'medium' | 'low'
  score: number
}

export function collectIdlCandidates(
  allInstructions: Instruction[],
  meta: NormalizedTransactionMeta,
  fullKeys: string[],
): IdlCandidate[] {
  const ctx: ParseContext = {
    preTokenBalances: meta.preTokenBalances,
    postTokenBalances: meta.postTokenBalances,
    allKeys: fullKeys,
  }

  const out: IdlCandidate[] = []

  function addCandidate(instr: Instruction): void {
    if (isUnparsedInstruction(instr)) {
      const swap = tryParseInstruction(instr.programId, instr.accounts, instr.data, ctx)
      if (swap) out.push({ programId: instr.programId, swap })
      return
    }

    if (!isCompiledInstruction(instr)) return

    const programId = fullKeys[instr.programIdIndex]
    if (!programId) return

    const resolvedAccounts: string[] = []
    for (const idx of instr.accounts) {
      const key = fullKeys[idx]
      if (!key) return
      resolvedAccounts.push(key)
    }

    const swap = tryParseInstruction(programId, resolvedAccounts, instr.data, ctx)
    if (swap) out.push({ programId, swap })
  }

  for (const instr of allInstructions) {
    addCandidate(instr)
  }

  return out
}

export function classifyConfidence(score: number): 'high' | 'medium' | 'low' {
  if (score >= 10) return 'high'
  if (score >= 6) return 'medium'
  return 'low'
}

export function scoreCandidate(candidate: IdlCandidate, state: OwnerTokenState, feePayer: string): number {
  const userDeltas = state.deltasByOwner.get(candidate.swap.signer)
  if (!userDeltas) return -3

  const fromMint = normalizeMint(candidate.swap.tokenFrom)
  const toMint = normalizeMint(candidate.swap.tokenTo)

  const fromDelta = userDeltas.get(fromMint) ?? 0n
  const toDelta = userDeltas.get(toMint) ?? 0n

  let score = 0
  if (fromDelta < 0n) score += 5
  if (toDelta > 0n) score += 5

  if (fromDelta !== 0n) score += 1
  if (toDelta !== 0n) score += 1
  if (fromMint === toMint) score -= 4
  if (candidate.swap.signer === feePayer) score += 1

  return score
}

export function selectBestIdlCandidate(
  candidates: IdlCandidate[],
  state: OwnerTokenState,
  feePayer: string,
): IdlSelection | null {
  if (candidates.length === 0) return null

  let best: IdlSelection | null = null

  for (const candidate of candidates) {
    const score = scoreCandidate(candidate, state, feePayer)
    const confidence = classifyConfidence(score)
    if (!best || score > best.score) {
      best = { candidate, score, confidence }
    }
  }

  return best
}

export function countRouteHops(candidates: IdlCandidate[]): number {
  if (candidates.length === 0) return 1
  const unique = new Set<string>()
  for (const c of candidates) {
    unique.add(`${c.programId}:${c.swap.signer}:${normalizeMint(c.swap.tokenFrom)}:${normalizeMint(c.swap.tokenTo)}`)
  }
  return Math.max(1, unique.size)
}

export function approximatelyEqualBigInt(a: bigint, b: bigint, toleranceBps = 1000): boolean {
  if (a === b) return true
  const diff = a > b ? a - b : b - a
  const largest = a > b ? a : b
  if (largest === 0n) return false
  return diff * 10_000n <= largest * BigInt(toleranceBps)
}

export function resolveTokenPrograms(
  options: ParserOptions | undefined,
  inputMint: string,
  outputMint: string,
): {
  inputTokenProgram?: TokenProgramKind | undefined
  outputTokenProgram?: TokenProgramKind | undefined
  token2022TransferFeeBps?: number | null | undefined
} {
  if (!options?.resolveMintTokenProgram) return {}

  const inputTokenProgram = options.resolveMintTokenProgram(inputMint)
  const outputTokenProgram = options.resolveMintTokenProgram(outputMint)

  let token2022TransferFeeBps: number | null | undefined
  if (options.resolveToken2022TransferFeeBps) {
    if (inputTokenProgram === 'token-2022') {
      token2022TransferFeeBps = options.resolveToken2022TransferFeeBps(inputMint)
    } else if (outputTokenProgram === 'token-2022') {
      token2022TransferFeeBps = options.resolveToken2022TransferFeeBps(outputMint)
    }
  }

  return { inputTokenProgram, outputTokenProgram, token2022TransferFeeBps }
}
