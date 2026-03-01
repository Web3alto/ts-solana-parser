import { hasParser, tryParseInstruction } from '../idl/registry.ts'
import type { ParseContext, RawSwap } from '../idl/types.ts'
import type { Instruction, ParserOptions, TokenProgramKind } from '../types.ts'
import { isCompiledInstruction, isUnparsedInstruction } from './accounts.ts'
import { normalizeMint, type OwnerTokenState } from './balance.ts'

interface IdlCandidate {
  programId: string
  swap: RawSwap
}

export interface IdlSelection {
  candidate: IdlCandidate
  confidence: 'high' | 'medium' | 'low'
  score: number
}

export function collectIdlCandidates(allInstructions: Instruction[], ctx: ParseContext): IdlCandidate[] {
  const { allKeys } = ctx
  const out: IdlCandidate[] = []

  function addCandidate(instr: Instruction): void {
    if (isUnparsedInstruction(instr)) {
      if (!hasParser(instr.programId)) return
      const swap = tryParseInstruction(instr.programId, instr.accounts, instr.data, ctx)
      if (swap) out.push({ programId: instr.programId, swap })
      return
    }

    if (!isCompiledInstruction(instr)) return

    const programId = allKeys[instr.programIdIndex]
    if (!programId || !hasParser(programId)) return

    const resolvedAccounts: string[] = []
    for (const idx of instr.accounts) {
      const key = allKeys[idx]
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

function classifyConfidence(score: number): 'high' | 'medium' | 'low' {
  if (score >= 10) return 'high'
  if (score >= 6) return 'medium'
  return 'low'
}

function scoreCandidate(candidate: IdlCandidate, state: OwnerTokenState, feePayer: string): number {
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
} {
  if (!options?.resolveMintTokenProgram) return {}

  const inputTokenProgram = options.resolveMintTokenProgram(inputMint)
  const outputTokenProgram = options.resolveMintTokenProgram(outputMint)

  return { inputTokenProgram, outputTokenProgram }
}
