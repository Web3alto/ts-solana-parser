# solana-parser-v2

Real-time Solana swap parser. Streams transactions via Helius WebSocket, parses swaps from 6 DEX protocols using custom IDL-level instruction decoding. Zero external dependencies beyond Bun.

## Commands

- `bun run index.ts` — Run the swap stream
- `bun run bench.ts` — Benchmark parser (requires `RPC_URL` in `.env`)
- `bun test` — Run tests

## Runtime

Use Bun exclusively. No Node.js, npm, vite, or external packages for things Bun provides natively.

- `bun <file>` not `node`/`ts-node`
- `bun install` not `npm`/`yarn`/`pnpm`
- `bun test` not `jest`/`vitest`
- Bun auto-loads `.env` — no dotenv

## Architecture

### Data flow

```
Helius WebSocket → stream.ts → normalize.ts → parser.ts → ParsedSwap
                                    ↓
                             deserialize.ts (for base58/base64)
```

### Parser pipeline (parser.ts)

1. `normalizeTransactionData()` — Convert any encoding to `TransactionMessage`
2. `buildFullAccountKeys()` — Merge static + loaded addresses
3. `detectProtocols()` — Scan instructions for known program IDs
4. `tryIdlParse()` — Decode instruction data via discriminator matching
5. `findSwapUser()` — Identify real swapper from token balance heuristics
6. `computeTokenChanges()` + `computeSolChange()` + `mergeChanges()` — Compute deltas
7. Cross-validate IDL result against balance diffs, extract pool address

### IDL system (src/idl/)

Each protocol parser implements `ProgramParser`:
```ts
interface ProgramParser {
  programId: string
  parseInstruction(data: Uint8Array, accounts: string[], ctx?: ParseContext): RawSwap | null
}
```

Parsers use **hardcoded 8-byte discriminators** from `sha256("global:<method>")`. No Anchor dependency — raw byte matching via `matchDiscriminator()`.

Registry (`registry.ts`) maps program ID → parser. `tryParseInstruction()` decodes base58 data and dispatches.

### Supported protocols

| Protocol | Program ID | File |
|---|---|---|
| PumpFun | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | `pumpfun.ts` |
| PumpSwap | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` | `pumpswap.ts` |
| Raydium CPMM | `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C` | `raydium-cpmm.ts` |
| Raydium LaunchLab | `LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj` | `raydium-launchlab.ts` |
| Meteora DBC | `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` | `meteora-dbc.ts` |
| Meteora DAMMv2 | `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG` | `meteora-dammv2.ts` |

### Key types

- `ParsedSwap` — Final parser output (signature, user, amounts, pool, swapType)
- `RawSwap` — IDL-level result (type, tokenFrom/To, amountFrom/To, signer)
- `SwapType` — Union of `{protocol}-buy` | `{protocol}-sell` strings
- `Protocol` — Enum: PumpFun, PumpSwap, RaydiumCPMM, RaydiumLaunchLab, MeteoraDBC, MeteoraDAMMv2
- `TokenChange` — `{ mint, rawDelta: bigint, decimals }`

### Key constants (constants.ts)

- `PROGRAM_ID_TO_PROTOCOL` — Maps program ID strings to `Protocol` enum
- `POOL_ACCOUNT_INDEX` — Which account index holds the pool address per protocol
- `SOL_MINT` / `WSOL_MINT` — Native SOL and wrapped SOL mint addresses

## Conventions

- All amounts are computed from pre/post token balance diffs, not instruction args
- WSOL is normalized to SOL_MINT in output
- Fee payer SOL delta is adjusted by adding tx fee back (isolates swap movement)
- IDL results are cross-validated against balance diffs before setting `swapType`
- Pool address extraction uses fixed account indices per protocol
- Meteora DBC and DAMMv2 share a factory (`meteora-common.ts`) — only account layout differs
- User detection prefers IDL signer, falls back to balance heuristic
- Transaction deserialization handles versioned (v0) and legacy formats
