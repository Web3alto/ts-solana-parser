import { lookupTipProvider, SYSTEM_PROGRAM_ID } from './constants.ts'
import { decodeSystemInstruction } from './decoders/system.ts'
import { decodeBase58 } from './idl/codec.ts'
import type { DecodedInstructionEntry } from './instruction-types.ts'
import { getInstructionProgramId, isCompiledInstruction, isUnparsedInstruction } from './parser/accounts.ts'
import type { Instruction, MevTip } from './types.ts'

function makeTip(destination: string, lamports: bigint): MevTip | undefined {
  const provider = lookupTipProvider(destination)
  if (!provider) return undefined
  return { provider, lamports, recipient: destination }
}

/**
 * Detect MEV tips from already-decoded instruction entries.
 * Used by the full transaction parser path (`parseFullTransaction`).
 */
export function detectTips(entries: readonly DecodedInstructionEntry[]): MevTip[] | undefined {
  let tips: MevTip[] | undefined

  for (const entry of entries) {
    const instr = entry.instruction
    if (instr.program === 'system' && instr.type === 'transferSol') {
      const tip = makeTip(instr.destination, instr.lamports)
      if (tip) {
        if (!tips) tips = []
        tips.push(tip)
      }
    }
    for (const inner of entry.innerInstructions) {
      if (inner.program === 'system' && inner.type === 'transferSol') {
        const tip = makeTip(inner.destination, inner.lamports)
        if (tip) {
          if (!tips) tips = []
          tips.push(tip)
        }
      }
    }
  }

  return tips
}

/**
 * Detect MEV tips from raw instructions (compiled or unparsed).
 * Used by the swap-only parser path (`parseTransactionDetailed`).
 */
export function detectTipsFromRawInstructions(
  allInstructions: Instruction[],
  fullKeys: string[],
): MevTip[] | undefined {
  let tips: MevTip[] | undefined

  for (const instr of allInstructions) {
    const programId = getInstructionProgramId(instr, fullKeys)
    if (programId !== SYSTEM_PROGRAM_ID) continue

    let data: Uint8Array
    let accounts: string[]

    if (isCompiledInstruction(instr)) {
      try {
        data = decodeBase58(instr.data)
      } catch {
        continue
      }
      accounts = instr.accounts.map((idx) => fullKeys[idx] ?? '')
    } else if (isUnparsedInstruction(instr)) {
      try {
        data = decodeBase58(instr.data)
      } catch {
        continue
      }
      accounts = instr.accounts
    } else {
      continue
    }

    const decoded = decodeSystemInstruction(data, accounts)
    if (!decoded || decoded.type !== 'transferSol') continue

    const tip = makeTip(decoded.destination, decoded.lamports)
    if (tip) {
      if (!tips) tips = []
      tips.push(tip)
    }
  }

  return tips
}
