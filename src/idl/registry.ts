import { decodeBase58 } from './codec.ts'
import type { ParseContext, ProgramParser, RawSwap } from './types.ts'
import { pumpfunParser } from './programs/pumpfun.ts'
import { pumpswapParser } from './programs/pumpswap.ts'
import { raydiumCpmmParser } from './programs/raydium-cpmm.ts'
import { raydiumLaunchLabParser } from './programs/raydium-launchlab.ts'
import { meteoraDbcParser } from './programs/meteora-dbc.ts'
import { meteoraDammv2Parser } from './programs/meteora-dammv2.ts'

const registry = new Map<string, ProgramParser>()

for (const parser of [
  pumpfunParser,
  pumpswapParser,
  raydiumCpmmParser,
  raydiumLaunchLabParser,
  meteoraDbcParser,
  meteoraDammv2Parser,
]) {
  registry.set(parser.programId, parser)
}

export function tryParseInstruction(
  programId: string,
  accounts: string[],
  dataBase58: string,
  ctx?: ParseContext,
): RawSwap | null {
  const parser = registry.get(programId)
  if (!parser) return null

  const data = decodeBase58(dataBase58)
  return parser.parseInstruction(data, accounts, ctx)
}
