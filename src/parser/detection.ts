import { AGGREGATOR_PROGRAM_IDS, type Aggregator } from '../aggregators/constants.ts'
import { POOL_ACCOUNT_INDEX, PROGRAM_ID_TO_PROTOCOL, type Protocol } from '../constants.ts'
import type { Instruction } from '../types.ts'
import { getInstructionProgramId, isCompiledInstruction, isUnparsedInstruction } from './accounts.ts'

type KnownProgramId = keyof typeof PROGRAM_ID_TO_PROTOCOL

function isKnownProgramId(pid: string): pid is KnownProgramId {
  return pid in PROGRAM_ID_TO_PROTOCOL
}

export function detectProtocols(allInstructions: Instruction[], fullKeys: string[]): Protocol[] {
  const found = new Set<Protocol>()
  for (const instr of allInstructions) {
    const pid = getInstructionProgramId(instr, fullKeys)
    if (pid && isKnownProgramId(pid)) {
      found.add(PROGRAM_ID_TO_PROTOCOL[pid])
    }
  }
  return [...found]
}

export function extractPoolAddress(
  allInstructions: Instruction[],
  fullKeys: string[],
  protocols: readonly Protocol[],
): string | undefined {
  for (const protocol of protocols) {
    const idx = POOL_ACCOUNT_INDEX[protocol]
    if (idx === undefined) continue

    for (const instr of allInstructions) {
      if (isUnparsedInstruction(instr)) {
        if (!isKnownProgramId(instr.programId) || PROGRAM_ID_TO_PROTOCOL[instr.programId] !== protocol) continue
        const pool = instr.accounts[idx]
        if (pool) return pool
        continue
      }

      if (!isCompiledInstruction(instr)) continue
      const pid = fullKeys[instr.programIdIndex]
      if (!pid || !isKnownProgramId(pid) || PROGRAM_ID_TO_PROTOCOL[pid] !== protocol) continue

      const accountIdx = instr.accounts[idx]
      if (accountIdx === undefined) continue
      const pool = fullKeys[accountIdx]
      if (pool) return pool
    }
  }

  return undefined
}

type KnownAggregatorProgramId = keyof typeof AGGREGATOR_PROGRAM_IDS

function isKnownAggregatorProgramId(pid: string): pid is KnownAggregatorProgramId {
  return pid in AGGREGATOR_PROGRAM_IDS
}

export function detectAggregator(topLevelInstructions: Instruction[], fullKeys: string[]): Aggregator | undefined {
  for (const instr of topLevelInstructions) {
    const pid = getInstructionProgramId(instr, fullKeys)
    if (pid && isKnownAggregatorProgramId(pid)) {
      return AGGREGATOR_PROGRAM_IDS[pid]
    }
  }
  return undefined
}
