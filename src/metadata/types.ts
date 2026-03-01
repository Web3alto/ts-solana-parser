export interface TokenMetadata {
  readonly symbol: string
  readonly name: string
  readonly decimals: number
  readonly uri?: string | undefined
}

export interface MetadataResolverConfig {
  rpcUrl: string
  cacheTtlMs?: number | undefined
  maxCacheEntries?: number | undefined
  commitment?: 'processed' | 'confirmed' | 'finalized' | undefined
  fetcher?: ((input: string, init?: RequestInit) => Promise<Response>) | undefined
  requestTimeoutMs?: number | undefined
  retries?: number | undefined
  retryBaseMs?: number | undefined
}
