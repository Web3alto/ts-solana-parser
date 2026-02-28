export enum Protocol {
  PumpFun = "PumpFun",
  PumpSwap = "PumpSwap",
  RaydiumLaunchLab = "RaydiumLaunchLab",
  RaydiumCPMM = "RaydiumCPMM",
  MeteoraDBC = "MeteoraDBC",
  MeteoraDAMMv2 = "MeteoraDAMMv2",
}

export const PROGRAM_ID_TO_PROTOCOL: Record<string, Protocol> = {
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P": Protocol.PumpFun,
  pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA: Protocol.PumpSwap,
  LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj: Protocol.RaydiumLaunchLab,
  CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C: Protocol.RaydiumCPMM,
  dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN: Protocol.MeteoraDBC,
  cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG: Protocol.MeteoraDAMMv2,
};

export const ALL_PROGRAM_IDS = Object.keys(PROGRAM_ID_TO_PROTOCOL);

export const SOL_MINT = "So11111111111111111111111111111111111111111";
export const WSOL_MINT = "So11111111111111111111111111111111111111112";
export const SOL_DECIMALS = 9;

/**
 * Which account index in the compiled instruction holds the pool/AMM address.
 * Best-effort — undefined if unknown or if the protocol doesn't expose it
 * in a fixed position.
 */
export const POOL_ACCOUNT_INDEX: Partial<Record<Protocol, number>> = {
  [Protocol.PumpFun]: 2,
  [Protocol.PumpSwap]: 2,
  [Protocol.RaydiumCPMM]: 1,
  [Protocol.RaydiumLaunchLab]: 1,
  [Protocol.MeteoraDBC]: 1,
  [Protocol.MeteoraDAMMv2]: 1,
};
