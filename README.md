# ts-solana-parser

Solana transaction parser with full instruction decoding, DEX swap detection, aggregator routing, and token metadata resolution. Supports 11 DEX protocols, 2 aggregators (Jupiter, Titan), 12 MEV tip providers, and 6 instruction programs. Built on `@solana/kit`.

## Features

- **Swap detection** across 11 DEX protocols with IDL-based instruction decoding
- **Aggregator detection** — identifies Jupiter and Titan routed swaps with `routedVia` tagging
- **Token metadata** — resolve symbol, name, decimals, and URI via Metaplex or Token-2022 extensions
- **Full transaction decoding** for System, Token, Token-2022, Compute Budget, ATA, and Memo programs
- **MEV tip detection** across 12 providers (108 known tip addresses)
- **Batch processing** with address lookup table pre-warming
- **Input validation** via Zod schemas at API boundaries
- **Confidence scoring** with diagnostic warnings for edge cases

## Install

```bash
npm install ts-solana-parser
# or
pnpm add ts-solana-parser
# or
yarn add ts-solana-parser
# or
bun add ts-solana-parser
```

Bun gets raw TypeScript for fastest dev; Node.js / Vite / Next.js get compiled ESM automatically via conditional exports.

## Quick Start

```ts
import { parseSwap } from 'ts-solana-parser'

const swap = parseSwap({
  transaction: txResult.transaction,
  meta: txResult.meta,
  signature: 'your-tx-signature',
  slot: 123456,
})

if (swap) {
  console.log(swap.swapType)          // "pumpfun-buy"
  console.log(swap.inputAmountDecimal) // "1.5"
  console.log(swap.outputMint)         // "TknMint..."
  console.log(swap.confidence)         // "high" | "medium" | "low"
}
```

## Supported Protocols

| Platform | Protocol | Program ID |
|----------|----------|------------|
| Pump | PumpFun | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` |
| Pump | PumpSwap | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` |
| Raydium | AMM v4 | `675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8` |
| Raydium | CPMM | `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C` |
| Raydium | CLMM | `CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK` |
| Raydium | LaunchLab | `LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj` |
| Meteora | DAMM | `Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB` |
| Meteora | DAMMv2 | `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG` |
| Meteora | DBC | `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` |
| Meteora | DLMM | `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo` |
| Orca | Whirlpool | `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` |

## Aggregator Detection

Aggregators like Jupiter wrap DEX swaps as inner instructions (CPIs). The parser detects when a swap is routed through an aggregator and tags it on `ParsedSwap`:

```ts
if (swap?.routedVia) {
  console.log(swap.routedVia) // "jupiter" | "titan"
}
```

| Aggregator | Program ID |
|------------|------------|
| Jupiter | `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` |
| Titan | `T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT` |

In full transaction decoding, aggregator instructions decode with `program: 'aggregator'`:

```ts
case 'aggregator':
  console.log(entry.instruction.aggregator) // "jupiter" | "titan"
  console.log(entry.instruction.variant)    // "route" | "swap_route_v2" | ...
  console.log(entry.instruction.signer)     // swap initiator
```

## MEV Tip Detection

Detects SOL transfers to known MEV tip addresses across 12 providers:

Jito, Temporal, NextBlock, BloxRoute, ZeroSlot, BlockRazor, Helius, Astralane, Stellium, Flashblock, Node1, Falcon

```ts
if (swap?.tips) {
  for (const tip of swap.tips) {
    console.log(tip.provider)   // "Jito" | "Temporal" | ...
    console.log(tip.lamports)   // bigint
    console.log(tip.recipient)  // tip account address
  }
}
```

## API

### Validated API

These functions validate input with Zod and throw `ValidationError` on malformed data.

#### `parseSwap(input, options?)` → `ParsedSwap | null`

Parse a single transaction for a swap. Returns `null` if not a swap.

```ts
import { parseSwap } from 'ts-solana-parser'

const swap = parseSwap({
  transaction: txData,   // TransactionData or [encoded, encoding] tuple
  meta: txMeta,          // TransactionMeta from RPC
  signature: 'sig...',   // optional, defaults to ""
  slot: 12345,           // optional, defaults to 0
  blockTime: 1700000000, // optional
})
```

#### `parseSwapDetailed(input, options?)` → `ParseOutcome`

Returns a detailed outcome with classification and diagnostics:

```ts
const outcome = parseSwapDetailed({ transaction, meta })

switch (outcome.kind) {
  case 'swap':        // outcome.swap is a ParsedSwap
  case 'not_swap':    // not a swap (outcome.code explains why)
  case 'unsupported': // encoding or version not supported
  case 'error':       // internal error (outcome.errorMessage)
}

// Diagnostic warnings available on all outcomes
console.log(outcome.warnings) // e.g. ['MULTI_HOP_ROUTE', 'IDL_BALANCE_AMOUNT_MISMATCH']
```

#### `parseSwaps(inputs, options?)` → `Promise<(ParsedSwap | null)[]>`

Batch parsing with ALT pre-warming. One invalid item does not abort the batch. Results are index-correlated.

```ts
const results = await parseSwaps([input1, input2, input3], options)
```

#### `parseSwapsDetailed(inputs, options?)` → `Promise<ParseOutcome[]>`

Batch version returning detailed outcomes. Invalid items produce `kind: 'error'` outcomes instead of throwing.

#### `parseFullSwapTransaction(input, options?)` → `FullTransactionResult | null`

Decode every instruction in a transaction, detect tips, and detect swaps:

```ts
import { parseFullSwapTransaction } from 'ts-solana-parser'

const result = parseFullSwapTransaction({
  transaction: txData,
  meta: txMeta,
  signature: 'sig...',
  slot: 12345,
})

if (result) {
  for (const entry of result.instructions) {
    switch (entry.instruction.program) {
      case 'system':       // transferSol, createAccount, ...
      case 'spl-token':    // transfer, transferChecked, approve, burn, ...
      case 'token-2022':   // same as spl-token + extensions (immutable owner, transfer fees, etc.)
      case 'compute-budget': // setComputeUnitLimit, setComputeUnitPrice
      case 'associated-token-account': // create, createIdempotent
      case 'memo':         // memo message
      case 'dex':          // DEX swap (11 protocols)
      case 'aggregator':   // aggregator routing (Jupiter)
      case 'unknown':      // unrecognized program
    }
  }
  console.log(result.tips)  // MEV tips
  console.log(result.swap)  // ParsedSwap if detected
}
```

### Options

```ts
import { createRpcBackedParserOptions } from 'ts-solana-parser'

// Quick setup with RPC-backed address lookup table resolution
const options = createRpcBackedParserOptions({
  rpcUrl: process.env.RPC_URL!,
  cacheTtlMs: 300_000,       // default: 5 min
  maxCacheEntries: 20_000,   // default: 20,000
  commitment: 'confirmed',   // default: "confirmed"
  requestTimeoutMs: 5_000,   // default: 5,000ms
  retries: 2,                // default: 2
  retryBaseMs: 300,          // default: 300ms
  maxConcurrency: 10,        // default: 10 (parallel ALT fetches)
})
```

Or configure manually:

```ts
import type { ParserOptions } from 'ts-solana-parser'

const options: ParserOptions = {
  resolveAddressTableLookups: (lookups) => myCache.resolve(lookups),
  warmAddressLookupTables: (accounts) => myCache.warm(accounts),
  resolveMintTokenProgram: (mint) => myTokenProgramMap.get(mint) ?? 'unknown',
  onInternalError: (err) => console.error('Parser error:', err),
  onResolverError: ({ tableAccount, error }) => console.warn('ALT error:', error),
}
```

### Zod Schemas

Exported for consumers who want to validate their own data:

```ts
import {
  SwapInputSchema,
  TransactionNotificationSchema,
  TransactionResultSchema,
  TransactionMetaSchema,
  TokenBalanceSchema,
} from 'ts-solana-parser'
```

### Token Metadata

Resolve token symbol, name, decimals, and URI for any mint. Supports both Metaplex Token Metadata and Token-2022 metadata extensions.

```ts
import { TokenMetadataResolver, enrichSwapWithMetadata } from 'ts-solana-parser'

const resolver = new TokenMetadataResolver({
  rpcUrl: process.env.RPC_URL!,
  cacheTtlMs: 300_000,      // default: 5 min
  maxCacheEntries: 10_000,  // default: 10,000
  commitment: 'confirmed',  // default: "confirmed"
  retries: 2,               // default: 2
})

// Resolve metadata for a single mint
const meta = await resolver.resolve('So11111111111111111111111111111111111111112')
if (meta) {
  console.log(meta.symbol)   // "SOL"
  console.log(meta.name)     // "Wrapped SOL"
  console.log(meta.decimals) // 9
}

// Enrich a ParsedSwap with token metadata
const enriched = await enrichSwapWithMetadata(swap, resolver)
console.log(enriched.inputTokenMetadata?.symbol)
console.log(enriched.outputTokenMetadata?.symbol)
```

### Utilities & Introspection

```ts
import {
  getSupportedAggregators,
  getSupportedProtocols,
  getSupportedTipProviders,
  normalizeTransactionData,
  detectTipsFromRawInstructions,
  lookupTipProvider,
  AGGREGATOR_PROGRAM_IDS,
  PROGRAM_ID_TO_PROTOCOL,
  TIP_ADDRESS_TO_PROVIDER,
} from 'ts-solana-parser'

getSupportedProtocols()       // all detectable DEX protocols
getSupportedAggregators()     // all detectable aggregators (e.g. "jupiter")
getSupportedTipProviders()    // all identifiable tip providers
normalizeTransactionData(raw) // normalize raw RPC data for custom pipelines
detectTipsFromRawInstructions(instructions, accounts) // standalone tip detection
lookupTipProvider(address)    // check if an address is a known tip recipient

// Constants
PROGRAM_ID_TO_PROTOCOL        // Map of program IDs → Protocol enum
AGGREGATOR_PROGRAM_IDS        // Map of aggregator program IDs → names
TIP_ADDRESS_TO_PROVIDER       // Map of 108 tip addresses → provider names
```

## Types

### `ParsedSwap`

```ts
interface ParsedSwap {
  signature: string
  slot: number
  blockTime?: number
  user: string                 // actual swapper (not always the fee payer)
  feePayer: string
  protocols: Protocol[]
  hopCount?: number
  routeType?: 'single-hop' | 'multi-hop'
  routedVia?: string               // "jupiter" when routed through an aggregator
  inputMint: string
  inputRaw: string             // exact amount in base units
  inputDecimals: number
  inputAmountDecimal: string   // human-readable decimal string
  inputAmountNumber?: number   // approximate JS number (may lose precision)
  inputTokenProgram?: TokenProgramKind
  outputMint: string
  outputRaw: string
  outputDecimals: number
  outputAmountDecimal: string
  outputAmountNumber?: number
  outputTokenProgram?: TokenProgramKind
  tips?: MevTip[]
  pool?: string
  swapType?: SwapType          // e.g. "pumpfun-buy", "raydium-cpmm-sell"
  confidence: 'high' | 'medium' | 'low'
  warnings: WarningCode[]
  fee: number                  // transaction fee in lamports
}
```

### `FullTransactionResult`

```ts
interface FullTransactionResult {
  signature: string
  slot: number
  blockTime?: number
  version: 'legacy' | 0
  fee: number
  feePayer: string
  err: Record<string, unknown> | null
  computeUnitsConsumed?: number
  logMessages?: string[]
  instructions: DecodedInstructionEntry[]
  tips?: MevTip[]
  swap?: ParsedSwap
}
```

### `ParseOutcome`

```ts
interface ParseOutcome {
  kind: 'swap' | 'not_swap' | 'unsupported' | 'error'
  code?: ParseCode             // e.g. 'NO_PROTOCOL', 'DECODE_ERROR'
  swap?: ParsedSwap
  warnings: WarningCode[]      // e.g. 'MULTI_HOP_ROUTE', 'IDL_BALANCE_AMOUNT_MISMATCH'
  errorMessage?: string
}
```

## How It Works

1. **Normalize** — Accepts `jsonParsed`/`json` objects or `base58`/`base64`/`base64+zstd` encoded tuples, deserializing raw bytes via `@solana/kit`
2. **Detect** — Scans top-level and inner instructions for known DEX program IDs
3. **IDL decode** — Matches 8-byte discriminators (`sha256("global:<method>")`) to extract swap direction, amounts, and signer
4. **User identification** — Finds the real swapper via IDL signer or token balance heuristics (not just the fee payer)
5. **Balance diffs** — Computes pre/post token balance deltas, normalizes WSOL to SOL, cross-validates against IDL results
6. **Tip detection** — Identifies SOL transfers to 108 known MEV tip addresses across 12 providers
7. **Confidence scoring** — Assigns high/medium/low confidence based on IDL score, emits diagnostic warnings

## Development

```bash
bun install

bun test              # run tests (276 tests)
bun run typecheck     # TypeScript check
bun run lint          # Biome lint
bun run format:check  # Prettier check
bun run verify        # all of the above

bun run build         # compile ESM + .d.ts to dist/
bun run clean         # remove dist/
bun run bench         # benchmark (requires RPC_URL)
```

## License

[MIT](LICENSE)
