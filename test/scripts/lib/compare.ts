import { SOL_MINT, WSOL_MINT } from '../../../src/constants.ts'
import type { ParsedSwap } from '../../../src/types.ts'
import type { SolscanBalanceData, ValidationCheck, ValidationResult } from './types.ts'

const RELATIVE_TOLERANCE = 0.0001 // 0.01%

function amountsMatch(parsed: number, solscan: number): boolean {
  if (parsed === 0 && solscan === 0) return true
  if (parsed === 0 || solscan === 0) return false

  const rel = Math.abs(parsed - solscan) / Math.max(Math.abs(parsed), Math.abs(solscan))
  return rel <= RELATIVE_TOLERANCE
}

function normalizeMint(mint: string): string {
  return mint === WSOL_MINT ? SOL_MINT : mint
}

export function compareSwapWithSolscan(parsedSwap: ParsedSwap, solscanData: SolscanBalanceData): ValidationResult {
  const parsedInputAmount = Number(parsedSwap.inputAmountDecimal)
  const parsedOutputAmount = Number(parsedSwap.outputAmountDecimal)
  const isFeePayer = parsedSwap.user === parsedSwap.feePayer

  const checks: ValidationCheck = {
    userFound: false,
    inputMintMatch: false,
    outputMintMatch: false,
    inputAmountMatch: false,
    outputAmountMatch: false,
  }

  const details: string[] = []

  // Build owner → mint → totalChange from Solscan data
  const ownerChanges = new Map<string, Map<string, number>>()

  for (const tc of solscanData.tokenChanges) {
    const normalizedMint = normalizeMint(tc.mint)
    if (!ownerChanges.has(tc.owner)) {
      ownerChanges.set(tc.owner, new Map())
    }
    const mintMap = ownerChanges.get(tc.owner)!
    mintMap.set(normalizedMint, (mintMap.get(normalizedMint) ?? 0) + tc.change)
  }

  // Add SOL changes (use SOL_MINT)
  for (const sc of solscanData.solChanges) {
    if (!ownerChanges.has(sc.address)) {
      ownerChanges.set(sc.address, new Map())
    }
    const mintMap = ownerChanges.get(sc.address)!
    mintMap.set(SOL_MINT, (mintMap.get(SOL_MINT) ?? 0) + sc.change)
  }

  // Check 1: userFound
  const user = parsedSwap.user
  checks.userFound = ownerChanges.has(user)
  if (!checks.userFound) {
    details.push(`User ${user.slice(0, 8)}... not found in Solscan data`)
    return {
      signature: parsedSwap.signature,
      status: 'FAIL',
      checks,
      details: details.join('; '),
    }
  }

  const userMints = ownerChanges.get(user)!

  // Normalize parsed mints
  const inputMint = normalizeMint(parsedSwap.inputMint)
  const outputMint = normalizeMint(parsedSwap.outputMint)

  // Check 2: inputMintMatch — user has a negative change for inputMint
  const inputChange = userMints.get(inputMint)
  if (inputChange !== undefined && inputChange < 0) {
    checks.inputMintMatch = true
  } else {
    details.push(`Input mint ${inputMint.slice(0, 8)}...: expected negative change, got ${inputChange ?? 'none'}`)
  }

  // Check 3: outputMintMatch — user has a positive change for outputMint
  const outputChange = userMints.get(outputMint)
  if (outputChange !== undefined && outputChange > 0) {
    checks.outputMintMatch = true
  } else {
    details.push(`Output mint ${outputMint.slice(0, 8)}...: expected positive change, got ${outputChange ?? 'none'}`)
  }

  // Check 4 & 5: amount matching
  // Handle SOL fee adjustment: when inputMint is SOL and user is fee payer,
  // Solscan's SOL delta includes the tx fee. We need to add fee back before comparing.
  let adjustedInputChange = inputChange ?? 0
  if (inputMint === SOL_MINT && inputChange !== undefined && isFeePayer) {
    // Solscan shows the raw SOL delta (including fee deduction).
    // Our parser adds the fee back to isolate swap movement.
    // So we add the fee to Solscan's number to make them comparable.
    const feeInSol = parsedSwap.fee / 1e9
    adjustedInputChange = inputChange + feeInSol
  }

  const parsedInputAbs = Math.abs(parsedInputAmount)
  const solscanInputAbs = Math.abs(adjustedInputChange)

  if (checks.inputMintMatch) {
    checks.inputAmountMatch = amountsMatch(parsedInputAbs, solscanInputAbs)
    if (!checks.inputAmountMatch) {
      details.push(`Input amount: parser=${parsedInputAbs}, solscan=${solscanInputAbs}`)
    }
  }

  // Output amount — SOL fee adjustment for output side
  let adjustedOutputChange = outputChange ?? 0
  if (outputMint === SOL_MINT && outputChange !== undefined && isFeePayer) {
    const feeInSol = parsedSwap.fee / 1e9
    adjustedOutputChange = outputChange + feeInSol
  }

  const parsedOutputAbs = Math.abs(parsedOutputAmount)
  const solscanOutputAbs = Math.abs(adjustedOutputChange)

  if (checks.outputMintMatch) {
    checks.outputAmountMatch = amountsMatch(parsedOutputAbs, solscanOutputAbs)
    if (!checks.outputAmountMatch) {
      details.push(`Output amount: parser=${parsedOutputAbs}, solscan=${solscanOutputAbs}`)
    }
  }

  const allPassed = Object.values(checks).every(Boolean)

  return {
    signature: parsedSwap.signature,
    status: allPassed ? 'PASS' : 'FAIL',
    checks,
    details: details.length > 0 ? details.join('; ') : undefined,
  }
}
