import { PROGRAM_ID_TO_PROTOCOL, type Protocol } from '../constants.ts'
import { decodeInstructionData } from '../decoders/registry.ts'
import { decodeBase58 } from '../idl/codec.ts'
import { hasParser, tryParseInstructionData } from '../idl/registry.ts'
import type { ParseContext, RawSwap } from '../idl/types.ts'
import type { DecodedInstruction } from '../instruction-types.ts'
import type { Instruction } from '../types.ts'
import { getInstructionProgramId, isCompiledInstruction, isUnparsedInstruction } from './accounts.ts'
import type { IdlCandidate } from './idl-scoring.ts'

type KnownProgramId = keyof typeof PROGRAM_ID_TO_PROTOCOL

function getProtocol(programId: string | undefined): Protocol | undefined {
  return programId ? PROGRAM_ID_TO_PROTOCOL[programId as KnownProgramId] : undefined
}

export interface PreparedInstruction {
  readonly instruction: Instruction
  readonly programId?: string | undefined
  readonly accounts: readonly string[]
  readonly dataBase58?: string | undefined
  data?: Uint8Array | null | undefined
  rawSwap?: RawSwap | null | undefined
  decoded?: DecodedInstruction | undefined
}

export function prepareInstructions(
  instructions: readonly Instruction[],
  fullKeys: readonly string[],
): PreparedInstruction[] {
  const prepared: PreparedInstruction[] = []

  for (const instruction of instructions) {
    const programId = getInstructionProgramId(instruction, fullKeys as string[])

    if (isCompiledInstruction(instruction)) {
      prepared.push({
        instruction,
        programId,
        accounts: instruction.accounts.map((idx) => fullKeys[idx] ?? ''),
        dataBase58: instruction.data,
      })
      continue
    }

    if (isUnparsedInstruction(instruction)) {
      prepared.push({
        instruction,
        programId,
        accounts: instruction.accounts,
        dataBase58: instruction.data,
      })
      continue
    }

    prepared.push({ instruction, programId, accounts: [] })
  }

  return prepared
}

export function getPreparedData(prepared: PreparedInstruction): Uint8Array | null {
  if (prepared.data !== undefined) return prepared.data
  if (prepared.dataBase58 === undefined) {
    prepared.data = null
    return null
  }

  try {
    prepared.data = decodeBase58(prepared.dataBase58)
  } catch {
    prepared.data = null
  }

  return prepared.data
}

export function parsePreparedIdlCandidate(prepared: PreparedInstruction, ctx: ParseContext): IdlCandidate | null {
  if (!prepared.programId || !hasParser(prepared.programId)) return null
  if (prepared.rawSwap !== undefined) {
    return prepared.rawSwap ? { programId: prepared.programId, swap: prepared.rawSwap } : null
  }

  const data = getPreparedData(prepared)
  if (!data) {
    prepared.rawSwap = null
    return null
  }

  prepared.rawSwap = tryParseInstructionData(prepared.programId, [...prepared.accounts], data, ctx)
  return prepared.rawSwap ? { programId: prepared.programId, swap: prepared.rawSwap } : null
}

export function collectPreparedIdlCandidates(
  preparedInstructions: readonly PreparedInstruction[],
  ctx: ParseContext,
): IdlCandidate[] {
  const out: IdlCandidate[] = []
  for (const prepared of preparedInstructions) {
    const candidate = parsePreparedIdlCandidate(prepared, ctx)
    if (candidate) out.push(candidate)
  }
  return out
}

export function detectPreparedProtocols(preparedInstructions: readonly PreparedInstruction[]): Protocol[] {
  const found = new Set<Protocol>()
  for (const prepared of preparedInstructions) {
    const protocol = getProtocol(prepared.programId)
    if (protocol) found.add(protocol)
  }
  return [...found]
}

export function protocolsFromIdlCandidates(candidates: readonly IdlCandidate[]): Protocol[] {
  const found = new Set<Protocol>()
  for (const candidate of candidates) {
    const protocol = getProtocol(candidate.programId)
    if (protocol) found.add(protocol)
  }
  return [...found]
}

export function decodePreparedInstruction(prepared: PreparedInstruction, ctx: ParseContext): DecodedInstruction {
  if (!prepared.programId) return { program: 'unknown', programId: '', accounts: [], data: '' }
  if (prepared.decoded) return prepared.decoded

  const data = getPreparedData(prepared)
  if (!data || prepared.dataBase58 === undefined) {
    prepared.decoded = { program: 'unknown', programId: prepared.programId, accounts: [...prepared.accounts], data: '' }
    return prepared.decoded
  }

  prepared.decoded = decodeInstructionData(prepared.programId, prepared.dataBase58, data, [...prepared.accounts], ctx)
  return prepared.decoded
}
