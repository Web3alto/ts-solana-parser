import type { ParsedSwap } from '../types.ts'
import type { TokenMetadataResolver } from './resolver.ts'
import type { TokenMetadata } from './types.ts'

export interface EnrichedSwap extends ParsedSwap {
  readonly inputTokenMetadata?: TokenMetadata | undefined
  readonly outputTokenMetadata?: TokenMetadata | undefined
}

export async function enrichSwapWithMetadata(
  swap: ParsedSwap,
  resolver: TokenMetadataResolver | ((mint: string) => Promise<TokenMetadata | null>),
): Promise<EnrichedSwap> {
  const resolveFn = typeof resolver === 'function' ? resolver : (mint: string) => resolver.resolve(mint)

  const [inputTokenMetadata, outputTokenMetadata] = await Promise.all([
    resolveFn(swap.inputMint).catch(() => null),
    resolveFn(swap.outputMint).catch(() => null),
  ])

  return {
    ...swap,
    inputTokenMetadata: inputTokenMetadata ?? undefined,
    outputTokenMetadata: outputTokenMetadata ?? undefined,
  }
}
