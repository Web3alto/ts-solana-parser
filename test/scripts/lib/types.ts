import { Protocol } from '../../../src/constants.ts'
import type { ParsedSwap } from '../../../src/types.ts'

export interface FixtureEntry {
  signature: string
  swap: ParsedSwap
}

export interface SolscanTokenChange {
  owner: string
  mint: string
  change: number
}

export interface SolscanSolChange {
  address: string
  change: number
}

export interface SolscanBalanceData {
  solChanges: SolscanSolChange[]
  tokenChanges: SolscanTokenChange[]
}

export interface ValidationCheck {
  userFound: boolean
  inputMintMatch: boolean
  outputMintMatch: boolean
  inputAmountMatch: boolean
  outputAmountMatch: boolean
}

export interface ValidationResult {
  signature: string
  status: 'PASS' | 'FAIL' | 'ERROR'
  checks: ValidationCheck
  details?: string | undefined
}

export const PROTOCOL_DIRS: Record<Protocol, string> = {
  [Protocol.PumpFun]: 'pumpfun',
  [Protocol.PumpSwap]: 'pumpswap',
  [Protocol.RaydiumCPMM]: 'raydium-cpmm',
  [Protocol.RaydiumCLMM]: 'raydium-clmm',
  [Protocol.RaydiumLaunchLab]: 'raydium-launchlab',
  [Protocol.MeteoraDBC]: 'meteora-dbc',
  [Protocol.MeteoraDAMMv2]: 'meteora-dammv2',
}
