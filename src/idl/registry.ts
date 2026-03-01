import { decodeBase58 } from './codec.ts'
import { meteoraDammv2Parser } from './programs/meteora-dammv2.ts'
import { meteoraDbcParser } from './programs/meteora-dbc.ts'
import { pumpfunParser } from './programs/pumpfun.ts'
import { pumpswapParser } from './programs/pumpswap.ts'
import { raydiumClmmParser } from './programs/raydium-clmm.ts'
import { raydiumCpmmParser } from './programs/raydium-cpmm.ts'
import { raydiumLaunchLabParser } from './programs/raydium-launchlab.ts'
import type { ParseContext, ProgramParser, RawSwap } from './types.ts'

const registry = new Map<string, ProgramParser>()

for (const parser of [
  pumpfunParser,
  pumpswapParser,
  raydiumCpmmParser,
  raydiumClmmParser,
  raydiumLaunchLabParser,
  meteoraDbcParser,
  meteoraDammv2Parser,
]) {
  registry.set(parser.programId, parser)
}

export function hasParser(programId: string): boolean {
  return registry.has(programId)
}

export function tryParseInstruction(
  programId: string,
  accounts: string[],
  dataBase58: string,
  ctx?: ParseContext,
): RawSwap | null {
  const parser = registry.get(programId)
  if (!parser) return null

  let data: Uint8Array
  try {
    data = decodeBase58(dataBase58)
  } catch {
    return null
  }

  try {
    return parser.parseInstruction(data, accounts, ctx)
  } catch {
    return null
  }
}
