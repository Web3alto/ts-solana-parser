# solana-swap-parser

Solana swap parser library. Parses swaps from 6 DEX protocols using custom IDL-level instruction decoding. Zod-validated public API with zero-overhead internal parsing.

## Commands

- `bun test` — Run tests
- `bun run typecheck` — TypeScript check
- `bun run lint` — Biome lint check
- `bun run lint:fix` — Biome lint auto-fix
- `bun run format` — Prettier format
- `bun run format:check` — Prettier format check
- `bun run verify` — Run all checks (typecheck + lint + format + test)
- `bun run stream` — Live swap stream (requires `RPC_URL` in `.env`)
- `bun run bench` — Benchmark parser (requires `RPC_URL` in `.env`)

## Runtime

Use Bun exclusively. No Node.js, npm, vite, or external packages for things Bun provides natively.

- `bun <file>` not `node`/`ts-node`
- `bun install` not `npm`/`yarn`/`pnpm`
- `bun test` not `jest`/`vitest`
- Bun auto-loads `.env` — no dotenv

## Project structure

```
src/
  lib.ts                    # Barrel export — public library entry point
  parse-swap.ts             # Validated convenience API (Zod boundary)
  schemas.ts                # Zod schemas for input validation
  parser.ts                 # Core parser: detect, identify user, compute deltas
  parser/                   # Parser submodules
    accounts.ts             # Account key resolution, instruction extraction
    balance.ts              # Token balance diff computation
    detection.ts            # Protocol detection, pool extraction
    idl-scoring.ts          # IDL candidate scoring and selection
    user.ts                 # User identification heuristics
  types.ts                  # All TypeScript types (readonly output types)
  constants.ts              # Program IDs, protocol enum, SOL mints
  errors.ts                 # ParserError, DecodeError, ValidationError
  normalize.ts              # Unified format from any encoding
  deserialize.ts            # Raw transaction byte deserialization
  stream.ts                 # Helius WebSocket subscription + reconnect
  resolvers.ts              # RPC-backed ALT resolver with cache
  amount.ts                 # Decimal formatting utilities
  deque.ts                  # Queue data structure for stream
  metrics.ts                # Stream metrics types
  idl/
    codec.ts                # Base58/64, compact u16, discriminator matching
    types.ts                # RawSwap, ParseContext, ProgramParser interface
    registry.ts             # Parser registry — dispatches by program ID
    programs/               # Per-protocol IDL parsers
tools/
  stream-cli.ts             # CLI entry point for live streaming
  bench.ts                  # Benchmark script
test/
  *.test.ts                 # Test files (bun test)
  helpers.ts                # Shared test utilities
  scripts/                  # Dev/debug scripts (not tests)
    lib/                    # Shared script utilities (RPC, Solscan scraper)
```

## Architecture

### Library entry point

```
Consumer → src/lib.ts (barrel) → src/parse-swap.ts (Zod validation) → src/parser.ts (core)
```

- `parseSwap()` / `parseSwapDetailed()` — Validated API with Zod schemas at the boundary
- `parseTransaction()` / `parseTransactionDetailed()` — Core API, no validation overhead

### Parser pipeline (parser.ts)

1. `normalizeTransactionData()` — Convert any encoding to `TransactionMessage`
2. `buildFullAccountKeys()` — Merge static + loaded addresses
3. `detectProtocols()` — Scan instructions for known program IDs
4. `collectIdlCandidates()` — Decode instruction data via discriminator matching
5. `findSwapUser()` — Identify real swapper from IDL signer or balance heuristics
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

- `ParsedSwap` — Final parser output (readonly, signature, user, amounts, pool, swapType)
- `ParseOutcome` — Detailed result with kind/code/warnings (readonly)
- `SwapInput` — Validated convenience API input type
- `RawSwap` — IDL-level result (type, tokenFrom/To, amountFrom/To, signer)
- `SwapType` — Union of `{protocol}-buy` | `{protocol}-sell` strings
- `Protocol` — Enum: PumpFun, PumpSwap, RaydiumCPMM, RaydiumLaunchLab, MeteoraDBC, MeteoraDAMMv2
- `TokenChange` — `{ mint, rawDelta: bigint, decimals }` (readonly)

### Key constants (constants.ts)

- `PROGRAM_ID_TO_PROTOCOL` — Maps program ID strings to `Protocol` enum (`as const satisfies`)
- `POOL_ACCOUNT_INDEX` — Which account index holds the pool address per protocol
- `SOL_MINT` / `WSOL_MINT` — Native SOL and wrapped SOL mint addresses

## Versioning

Follows semver. Version lives in `package.json` and is tracked via git tags (`v0.4.5`, etc.).

**Bump rules based on commit impact:**
- **Minor bump** (`0.x.0`) — New capability, major refactor, or new public API surface
- **Patch bump** (`0.0.x`) — Bug fixes, small improvements, tooling, docs, tests
- **Skip numbers** when a commit's impact is significantly larger than a typical patch (e.g., 6 protocol parsers at once → skip from `0.0.3` to `0.0.5`)

**When committing:** Always update the version in `package.json` and tag the commit with `git tag v<version>`. Push tags with `git push --tags`.

**Milestone versions:**
- `0.1.0` — First working parser (can parse a swap end-to-end)
- `0.2.0` — Real-time WebSocket streaming
- `0.3.0` — Parser refactored into submodules + strict TypeScript
- `0.4.0` — Zod-validated public API with barrel export

## Conventions

- All amounts are computed from pre/post token balance diffs, not instruction args
- WSOL is normalized to SOL_MINT in output
- Fee payer SOL delta is adjusted by adding tx fee back (isolates swap movement)
- IDL results are cross-validated against balance diffs before setting `swapType`
- Pool address extraction uses fixed account indices per protocol
- Meteora DBC and DAMMv2 share a factory (`meteora-common.ts`) — only account layout differs
- User detection prefers IDL signer, falls back to balance heuristic
- Transaction deserialization handles versioned (v0) and legacy formats
- Output types (`ParsedSwap`, `ParseOutcome`, `TokenChange`) are readonly
- Zod validation only at public API boundary (`parseSwap`/`parseSwapDetailed`), not internal paths
- Biome for linting, Prettier for formatting — run `bun run verify` before committing
- `exactOptionalPropertyTypes` enabled — optional fields need explicit `| undefined`
