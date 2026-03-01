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
  OrcaWhirlpool = 'OrcaWhirlpool',
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
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: Protocol.OrcaWhirlpool,
} as const satisfies Record<string, Protocol>

/**
 * Synthetic SOL mint address used internally to represent native SOL.
 * This is NOT the on-chain Wrapped SOL (WSOL) mint. Consumers must compare
 * against this constant rather than hardcoding the WSOL address.
 * WSOL balances are normalized to this mint in parser output.
 */
export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111'
export const SOL_MINT = 'So11111111111111111111111111111111111111111'
export const WSOL_MINT = 'So11111111111111111111111111111111111111112'
export const SOL_DECIMALS = 9

/**
 * Which account index in the compiled instruction holds the pool/AMM address.
 * Best-effort — undefined if unknown or if the protocol doesn't expose it
 * in a fixed position.
 */
export enum TipProvider {
  Jito = 'Jito',
  Temporal = 'Temporal',
  NextBlock = 'NextBlock',
  BloxRoute = 'BloxRoute',
  ZeroSlot = 'ZeroSlot',
  BlockRazor = 'BlockRazor',
  Helius = 'Helius',
  Astralane = 'Astralane',
  Stellium = 'Stellium',
  Flashblock = 'Flashblock',
  Node1 = 'Node1',
  Falcon = 'Falcon',
}

export const TIP_ADDRESS_TO_PROVIDER = {
  // Jito (8)
  DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh: TipProvider.Jito,
  DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL: TipProvider.Jito,
  HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe: TipProvider.Jito,
  ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49: TipProvider.Jito,
  Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY: TipProvider.Jito,
  ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt: TipProvider.Jito,
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT': TipProvider.Jito,
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5': TipProvider.Jito,
  // Temporal (17)
  TEMPaMeCRFAS9EKF53Jd6KpHxgL47uWLcpFArU1Fanq: TipProvider.Temporal,
  noz3jAjPiHuBPqiSPkkugaJDkJscPuRhYnSpbi8UvC4: TipProvider.Temporal,
  noz3str9KXfpKknefHji8L1mPgimezaiUyCHYMDv1GE: TipProvider.Temporal,
  noz6uoYCDijhu1V7cutCpwxNiSovEwLdRHPwmgCGDNo: TipProvider.Temporal,
  noz9EPNcT7WH6Sou3sr3GGjHQYVkN3DNirpbvDkv9YJ: TipProvider.Temporal,
  nozc5yT15LazbLTFVZzoNZCwjh3yUtW86LoUyqsBu4L: TipProvider.Temporal,
  nozFrhfnNGoyqwVuwPAW4aaGqempx4PU6g6D9CJMv7Z: TipProvider.Temporal,
  nozievPk7HyK1Rqy1MPJwVQ7qQg2QoJGyP71oeDwbsu: TipProvider.Temporal,
  noznbgwYnBLDHu8wcQVCEw6kDrXkPdKkydGJGNXGvL7: TipProvider.Temporal,
  nozNVWs5N8mgzuD3qigrCG2UoKxZttxzZ85pvAQVrbP: TipProvider.Temporal,
  nozpEGbwx4BcGp6pvEdAh1JoC2CQGZdU6HbNP1v2p6P: TipProvider.Temporal,
  nozrhjhkCr3zXT3BiT4WCodYCUFeQvcdUkM7MqhKqge: TipProvider.Temporal,
  nozrwQtWhEdrA6W8dkbt9gnUaMs52PdAv5byipnadq3: TipProvider.Temporal,
  nozUacTVWub3cL4mJmGCYjKZTnE9RbdY5AP46iQgbPJ: TipProvider.Temporal,
  nozWCyTPppJjRuw2fpzDhhWbW355fzosWSzrrMYB1Qk: TipProvider.Temporal,
  nozWNju6dY353eMkMqURqwQEoM3SFgEKC6psLCSfUne: TipProvider.Temporal,
  nozxNBgWohjR75vdspfxR5H9ceC7XXH99xpxhVGt3Bb: TipProvider.Temporal,
  // NextBlock (8)
  NEXTbLoCkB51HpLBLojQfpyVAMorm3zzKg7w9NFdqid: TipProvider.NextBlock,
  nextBLoCkPMgmG8ZgJtABeScP35qLa2AMCNKntAP7Xc: TipProvider.NextBlock,
  NextbLoCkVtMGcV47JzewQdvBpLqT9TxQFozQkN98pE: TipProvider.NextBlock,
  NexTbLoCkWykbLuB1NkjXgFWkX9oAtcoagQegygXXA2: TipProvider.NextBlock,
  NeXTBLoCKs9F1y5PJS9CKrFNNLU1keHW71rfh7KgA1X: TipProvider.NextBlock,
  NexTBLockJYZ7QD7p2byrUa6df8ndV2WSd8GkbWqfbb: TipProvider.NextBlock,
  neXtBLock1LeC67jYd1QdAa32kbVeubsfPNTJC1V5At: TipProvider.NextBlock,
  nEXTBLockYgngeRmRrjDV31mGSekVPqZoMGhQEZtPVG: TipProvider.NextBlock,
  // BloxRoute (1)
  HWEoBxYs7ssKuudEjzjmpfJVX7Dvi7wescFsVx2L5yoY: TipProvider.BloxRoute,
  // ZeroSlot (11)
  '6fQaVhYZA4w3MBSXjJ81Vf6W1EDYeUPXpgVQ6UQyU1Av': TipProvider.ZeroSlot,
  '4HiwLEP2Bzqj3hM2ENxJuzhcPCdsafwiet3oGkMkuQY4': TipProvider.ZeroSlot,
  '7toBU3inhmrARGngC7z6SjyP85HgGMmCTEwGNRAcYnEK': TipProvider.ZeroSlot,
  '8mR3wB1nh4D6J9RUCugxUpc6ya8w38LPxZ3ZjcBhgzws': TipProvider.ZeroSlot,
  '6SiVU5WEwqfFapRuYCndomztEwDjvS5xgtEof3PLEGm9': TipProvider.ZeroSlot,
  TpdxgNJBWZRL8UXF5mrEsyWxDWx9HQexA9P1eTWQ42p: TipProvider.ZeroSlot,
  D8f3WkQu6dCF33cZxuAsrKHrGsqGP2yvAHf8mX6RXnwf: TipProvider.ZeroSlot,
  GQPFicsy3P3NXxB5piJohoxACqTvWE9fKpLgdsMduoHE: TipProvider.ZeroSlot,
  Ey2JEr8hDkgN8qKJGrLf2yFjRhW7rab99HVxwi5rcvJE: TipProvider.ZeroSlot,
  '4iUgjMT8q2hNZnLuhpqZ1QtiV8deFPy2ajvvjEpKKgsS': TipProvider.ZeroSlot,
  '3Rz8uD83QsU8wKvZbgWAPvCNDU6Fy8TSZTMcPm3RB6zt': TipProvider.ZeroSlot,
  // BlockRazor (14)
  FjmZZrFvhnqqb9ThCuMVnENaM3JGVuGWNyCAxRJcFpg9: TipProvider.BlockRazor,
  '6No2i3aawzHsjtThw81iq1EXPJN6rh8eSJCLaYZfKDTG': TipProvider.BlockRazor,
  A9cWowVAiHe9pJfKAj3TJiN9VpbzMUq6E4kEvf5mUT22: TipProvider.BlockRazor,
  Gywj98ophM7GmkDdaWs4isqZnDdFCW7B46TXmKfvyqSm: TipProvider.BlockRazor,
  '68Pwb4jS7eZATjDfhmTXgRJjCiZmw1L7Huy4HNpnxJ3o': TipProvider.BlockRazor,
  '4ABhJh5rZPjv63RBJBuyWzBK3g9gWMUQdTZP2kiW31V9': TipProvider.BlockRazor,
  B2M4NG5eyZp5SBQrSdtemzk5TqVuaWGQnowGaCBt8GyM: TipProvider.BlockRazor,
  '5jA59cXMKQqZAVdtopv8q3yyw9SYfiE3vUCbt7p8MfVf': TipProvider.BlockRazor,
  '5YktoWygr1Bp9wiS1xtMtUki1PeYuuzuCF98tqwYxf61': TipProvider.BlockRazor,
  '295Avbam4qGShBYK7E9H5Ldew4B3WyJGmgmXfiWdeeyV': TipProvider.BlockRazor,
  EDi4rSy2LZgKJX74mbLTFk4mxoTgT6F7HxxzG2HBAFyK: TipProvider.BlockRazor,
  BnGKHAC386n4Qmv9xtpBVbRaUTKixjBe3oagkPFKtoy6: TipProvider.BlockRazor,
  Dd7K2Fp7AtoN8xCghKDRmyqr5U169t48Tw5fEd3wT9mq: TipProvider.BlockRazor,
  AP6qExwrbRgBAVaehg4b5xHENX815sMabtBzUzVB4v8S: TipProvider.BlockRazor,
  // Helius (10)
  '4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE': TipProvider.Helius,
  D2L6yPZ2FmmmTKPgzaMKdhu6EWZcTpLy1Vhx8uvZe7NZ: TipProvider.Helius,
  '9bnz4RShgq1hAnLnZbP8kbgBg1kEmcJBYQq3gQbmnSta': TipProvider.Helius,
  '5VY91ws6B2hMmBFRsXkoAAdsPHBJwRfBht4DXox3xkwn': TipProvider.Helius,
  '2nyhqdwKcJZR2vcqCyrYsaPVdAnFoJjiksCXJ7hfEYgD': TipProvider.Helius,
  '2q5pghRs6arqVjRvT5gfgWfWcHWmw1ZuCzphgd5KfWGJ': TipProvider.Helius,
  wyvPkWjVZz1M8fHQnMMCDTQDbkManefNNhweYk5WkcF: TipProvider.Helius,
  '3KCKozbAaF75qEU33jtzozcJ29yJuaLJTy2jFdzUY8bT': TipProvider.Helius,
  '4vieeGHPYPG2MmyPRcYjdiDmmhN3ww7hsFNap8pVN3Ey': TipProvider.Helius,
  '4TQLFNWK8AovT1gFvda5jfw2oJeRMKEmw7aH6MGBJ3or': TipProvider.Helius,
  // Astralane (8)
  astrazznxsGUhWShqgNtAdfrzP2G83DzcWVJDxwV9bF: TipProvider.Astralane,
  astra4uejePWneqNaJKuFFA8oonqCE1sqF6b45kDMZm: TipProvider.Astralane,
  astra9xWY93QyfG6yM8zwsKsRodscjQ2uU2HKNL5prk: TipProvider.Astralane,
  astraRVUuTHjpwEVvNBeQEgwYx9w9CFyfxjYoobCZhL: TipProvider.Astralane,
  astraEJ2fEj8Xmy6KLG7B3VfbKfsHXhHrNdCQx7iGJK: TipProvider.Astralane,
  astraubkDw81n4LuutzSQ8uzHCv4BhPVhfvTcYv8SKC: TipProvider.Astralane,
  astraZW5GLFefxNPAatceHhYjfA1ciq9gvfEg2S47xk: TipProvider.Astralane,
  astrawVNP4xDBKT7rAdxrLYiTSTdqtUr63fSMduivXK: TipProvider.Astralane,
  // Stellium (5)
  ste11JV3MLMM7x7EJUM2sXcJC1H7F4jBLnP9a9PG8PH: TipProvider.Stellium,
  ste11MWPjXCRfQryCshzi86SGhuXjF4Lv6xMXD2AoSt: TipProvider.Stellium,
  ste11p5x8tJ53H1NbNQsRBg1YNRd4GcVpxtDw8PBpmb: TipProvider.Stellium,
  ste11p7e2KLYou5bwtt35H7BM6uMdo4pvioGjJXKFcN: TipProvider.Stellium,
  ste11TMV68LMi1BguM4RQujtbNCZvf1sjsASpqgAvSX: TipProvider.Stellium,
  // Flashblock (10)
  FLaShB3iXXTWE1vu9wQsChUKq3HFtpMAhb8kAh1pf1wi: TipProvider.Flashblock,
  FLashhsorBmM9dLpuq6qATawcpqk1Y2aqaZfkd48iT3W: TipProvider.Flashblock,
  FLaSHJNm5dWYzEgnHJWWJP5ccu128Mu61NJLxUf7mUXU: TipProvider.Flashblock,
  FLaSHR4Vv7sttd6TyDF4yR1bJyAxRwWKbohDytEMu3wL: TipProvider.Flashblock,
  FLASHRzANfcAKDuQ3RXv9hbkBy4WVEKDzoAgxJ56DiE4: TipProvider.Flashblock,
  FLasHstqx11M8W56zrSEqkCyhMCCpr6ze6Mjdvqope5s: TipProvider.Flashblock,
  FLAShWTjcweNT4NSotpjpxAkwxUr2we3eXQGhpTVzRwy: TipProvider.Flashblock,
  FLasHXTqrbNvpWFB6grN47HGZfK6pze9HLNTgbukfPSk: TipProvider.Flashblock,
  FLAshyAyBcKb39KPxSzXcepiS8iDYUhDGwJcJDPX4g2B: TipProvider.Flashblock,
  FLAsHZTRcf3Dy1APaz6j74ebdMC6Xx4g6i9YxjyrDybR: TipProvider.Flashblock,
  // Node1 (6)
  node1PqAa3BWWzUnTHVbw8NJHC874zn9ngAkXjgWEej: TipProvider.Node1,
  node1UzzTxAAeBTpfZkQPJXBAqixsbdth11ba1NXLBG: TipProvider.Node1,
  node1Qm1bV4fwYnCurP8otJ9s5yrkPq7SPZ5uhj3Tsv: TipProvider.Node1,
  node1PUber6SFmSQgvf2ECmXsHP5o3boRSGhvJyPMX1: TipProvider.Node1,
  node1AyMbeqiVN6eoQzEAwCA6Pk826hrdqdAHR7cdJ3: TipProvider.Node1,
  node1YtWCoTwwVYTFLfS19zquRQzYX332hs1HEuRBjC: TipProvider.Node1,
  // Falcon (10)
  Fa1con11xLjPddfzRwRUB16sbFZggp2JeJkCeWREyR8X: TipProvider.Falcon,
  Fa1con11TM1RuAQzbQzYjTy4Ekfap9Lnc9fnEbQYEd6Q: TipProvider.Falcon,
  Fa1con113Bvi76nS5AzUiRDC2fqjfzkNMUNRLgQybMYt: TipProvider.Falcon,
  Fa1con1QGHJK232s8yZpzZZwqPexnAKcoyKj626LNsMv: TipProvider.Falcon,
  Fa1con1zUzb6qJVFz5tNkPq1Ahm8H1qKW7Q48252QbkQ: TipProvider.Falcon,
  Fa1con16d3MSwd3SAiwvr2LwgkpE7ot8zntbpuec8HAx: TipProvider.Falcon,
  Fa1con1i7mpa7Qc6epYJ6r4P9AbU77DFFz173r59Df1x: TipProvider.Falcon,
  Fa1con18nWn8TdAGL7JX8PertfMUGVSc899NawokJ4Bq: TipProvider.Falcon,
  Fa1con1GKusK2EqsfzrDzGPaYZSxQtFGzJiRMMU9Zm2g: TipProvider.Falcon,
  Fa1con1RDwVwM9VrJ53CwVefD3VU9c58EMpDawV7fLMi: TipProvider.Falcon,
} as const satisfies Record<string, TipProvider>

export function lookupTipProvider(address: string): TipProvider | undefined {
  return (TIP_ADDRESS_TO_PROVIDER as Record<string, TipProvider | undefined>)[address]
}

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
  [Protocol.OrcaWhirlpool]: 4, // whirlpool (swap_v2 layout; legacy swap has it at idx 2)
} as const satisfies Partial<Record<Protocol, number>>
