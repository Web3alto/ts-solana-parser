export enum Protocol {
  PumpFun = 'PumpFun',
  PumpSwap = 'PumpSwap',
  RaydiumLaunchLab = 'RaydiumLaunchLab',
  RaydiumCPMM = 'RaydiumCPMM',
  RaydiumCLMM = 'RaydiumCLMM',
  MeteoraDBC = 'MeteoraDBC',
  MeteoraDAMMv2 = 'MeteoraDAMMv2',
  MeteoraDLMM = 'MeteoraDLMM',
  RaydiumAMM = 'RaydiumAMM',
  MeteoraDAMM = 'MeteoraDAMM',
}

export const PROGRAM_ID_TO_PROTOCOL = {
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': Protocol.PumpFun,
  pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA: Protocol.PumpSwap,
  LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj: Protocol.RaydiumLaunchLab,
  CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C: Protocol.RaydiumCPMM,
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: Protocol.RaydiumCLMM,
  dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN: Protocol.MeteoraDBC,
  cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG: Protocol.MeteoraDAMMv2,
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: Protocol.MeteoraDLMM,
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': Protocol.RaydiumAMM,
  Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB: Protocol.MeteoraDAMM,
} as const satisfies Record<string, Protocol>

export const ALL_PROGRAM_IDS = Object.keys(PROGRAM_ID_TO_PROTOCOL)

/**
 * Synthetic SOL mint address used internally to represent native SOL.
 * This is NOT the on-chain Wrapped SOL (WSOL) mint. Consumers must compare
 * against this constant rather than hardcoding the WSOL address.
 * WSOL balances are normalized to this mint in parser output.
 */
export const SOL_MINT = 'So11111111111111111111111111111111111111111'
export const WSOL_MINT = 'So11111111111111111111111111111111111111112'
export const SOL_DECIMALS = 9

/**
 * Which account index in the compiled instruction holds the pool/AMM address.
 * Best-effort — undefined if unknown or if the protocol doesn't expose it
 * in a fixed position.
 */
export const POOL_ACCOUNT_INDEX = {
  [Protocol.PumpFun]: 3, // bondingCurve (idx 2 = mint)
  [Protocol.PumpSwap]: 0, // pool (idx 1 = user, idx 3/4 = mints)
  [Protocol.RaydiumCPMM]: 3, // poolState (idx 0 = payer, idx 1 = authority)
  [Protocol.RaydiumCLMM]: 2, // poolState (idx 0 = payer, idx 1 = ammConfig)
  [Protocol.RaydiumLaunchLab]: 2, // poolState (idx 0 = payer, idx 1 = authority)
  [Protocol.MeteoraDBC]: 0, // pool (idx 3 = inputToken, idx 9 = payer)
  [Protocol.MeteoraDAMMv2]: 0, // pool (idx 2 = inputToken, idx 8 = payer)
  [Protocol.MeteoraDLMM]: 0, // lb_pair (idx 4 = userTokenIn, idx 10 = payer)
  [Protocol.RaydiumAMM]: 1, // amm (idx 15 = sourceToken, idx 17 = payer)
  [Protocol.MeteoraDAMM]: 0, // pool (idx 1 = sourceToken, idx 12 = payer)
} as const satisfies Partial<Record<Protocol, number>>
