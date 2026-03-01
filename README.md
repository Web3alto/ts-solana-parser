# solana-swap-parser

Solana transaction parser with full instruction decoding and DEX swap detection. Decodes System, Token, Compute Budget, ATA, Memo, and 10 DEX protocol instructions. Built on `@solana/kit`.

## Install

```bash
bun add solana-swap-parser
```

## Quick start

```ts
import { parseSwap } from 'solana-swap-parser'

const result = parseSwap({
  transaction: txResult.transaction,
  meta: txResult.meta,
  signature: 'your-tx-signature',
  slot: 123456,
})

if (result) {
  console.log(result.swapType)         // "pumpfun-buy"
  console.log(result.inputAmountDecimal) // "1.5"
  console.log(result.outputMint)        // "TknMint..."
}
```

## Supported protocols

| Protocol | Program ID | File |
|---|---|---|
| PumpFun | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | `pumpfun.ts` |
| PumpSwap | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` | `pumpswap.ts` |
| Raydium CPMM | `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C` | `raydium-cpmm.ts` |
| Raydium CLMM | `CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK` | `raydium-clmm.ts` |
| Raydium LaunchLab | `LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj` | `raydium-launchlab.ts` |
| Meteora DBC | `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` | `meteora-dbc.ts` |
| Meteora DAMMv2 | `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG` | `meteora-dammv2.ts` |
| Meteora DLMM | `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo` | `meteora-dlmm.ts` |
| Raydium AMM | `675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8` | `raydium-amm.ts` |
| Meteora DAMM | `Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB` | `meteora-damm.ts` |

## Full transaction parsing

Parse every instruction in a transaction — not just swaps:

```ts
import { parseFullSwapTransaction } from 'solana-swap-parser'

const result = parseFullSwapTransaction({
  transaction: txData,
  meta: txMeta,
  signature: 'sig...',
  slot: 12345,
})

if (result) {
  for (const entry of result.instructions) {
    const ix = entry.instruction
    switch (ix.program) {
      case 'system':       // transferSol, createAccount, assign, ...
      case 'spl-token':    // transfer, transferChecked, approve, burn, ...
      case 'token-2022':   // same variants as spl-token
      case 'compute-budget': // setComputeUnitLimit, setComputeUnitPrice
      case 'associated-token-account': // create, createIdempotent
      case 'memo':         // memo message
      case 'dex':          // DEX swap (10 protocols)
      case 'unknown':      // unrecognized program
    }
  }

  if (result.swap) {
    console.log(result.swap.swapType) // swap detected within the transaction
  }
}
```

The unvalidated equivalent (`parseFullTransaction`) takes a `TransactionNotification` directly and skips Zod validation.

## Swap API Reference

### `parseSwap(input, options?)` → `ParsedSwap | null`

Validated convenience function. Validates input with Zod schemas, then parses. Returns `null` if the transaction is not a swap. Throws `ValidationError` on malformed input.

```ts
import { parseSwap } from 'solana-swap-parser'

const swap = parseSwap({
  transaction: txData,   // TransactionData object or [encoded, encoding] tuple
  meta: txMeta,          // TransactionMeta from RPC
  signature: 'sig...',   // optional, defaults to ""
  slot: 12345,           // optional, defaults to 0
  blockTime: 1700000000, // optional
})
```

### `parseSwapDetailed(input, options?)` → `ParseOutcome`

Same validation as `parseSwap`, but returns a detailed outcome with classification:

```ts
import { parseSwapDetailed } from 'solana-swap-parser'

const outcome = parseSwapDetailed({ transaction, meta })

switch (outcome.kind) {
  case 'swap':        // outcome.swap is a ParsedSwap
  case 'not_swap':    // not a swap (outcome.code explains why)
  case 'unsupported': // encoding or version not supported
  case 'error':       // internal error (outcome.errorMessage)
}
```

### `parseSwaps(inputs, options?)` → `Promise<(ParsedSwap | null)[]>`

Batch version of `parseSwap`. Validates each input individually — one bad transaction does not abort the batch. Pre-warms address lookup tables across all transactions in a single call. Results are index-correlated: `results[i]` corresponds to `inputs[i]`.

```ts
import { parseSwaps } from 'solana-swap-parser'

const results = await parseSwaps([input1, input2, input3], options)
// results[0] → ParsedSwap | null for input1
// results[1] → ParsedSwap | null for input2
// ...
```

### `parseSwapsDetailed(inputs, options?)` → `Promise<ParseOutcome[]>`

Batch version of `parseSwapDetailed`. Same per-item error handling and ALT pre-warming as `parseSwaps`, but returns detailed outcomes.

```ts
import { parseSwapsDetailed } from 'solana-swap-parser'

const outcomes = await parseSwapsDetailed([input1, input2], options)
for (const outcome of outcomes) {
  if (outcome.kind === 'swap') console.log(outcome.swap)
  if (outcome.kind === 'error') console.log(outcome.errorMessage)
}
```

### `parseTransaction(notification, options?)` → `ParsedSwap | null`

Core parsing function — no input validation. Use when you trust the input (e.g., from your own data source). Takes a full `TransactionNotification` object.

```ts
import { parseTransaction } from 'solana-swap-parser'

const swap = parseTransaction({
  signature: 'sig...',
  slot: 12345,
  transaction: { meta, transaction: txData },
})
```

### `ParserOptions`

Optional callbacks for resolving address lookup tables and token programs:

```ts
interface ParserOptions {
  resolveAddressTableLookups?: (lookups) => AddressLookupResolution | null
  warmAddressLookupTables?: (tableAccounts: string[]) => Promise<void>
  resolveMintTokenProgram?: (mint: string) => TokenProgramKind
  resolveToken2022TransferFeeBps?: (mint: string) => number | null
  onInternalError?: (error: unknown) => void
  onResolverError?: (ctx: { tableAccount?: string; error: unknown }) => void
}
```

### `createRpcBackedParserOptions(config)`

Factory that creates `ParserOptions` with an RPC-backed address lookup table resolver. Handles caching, retries, and background refresh.

```ts
import { createRpcBackedParserOptions } from 'solana-swap-parser'

const options = createRpcBackedParserOptions({
  rpcUrl: process.env.RPC_URL!,
  cacheTtlMs: 300_000,       // optional, default 5min
  maxCacheEntries: 20_000,   // optional
  requestTimeoutMs: 5_000,   // optional
  retries: 2,                // optional
})
```

## Output types

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
  swap?: ParsedSwap
}
```

Each `DecodedInstructionEntry` contains an `index`, the decoded `instruction` (a discriminated union), and decoded `innerInstructions`.

### `ParsedSwap`

```ts
interface ParsedSwap {
  signature: string
  slot: number
  blockTime?: number
  user: string              // actual swapper (not always fee payer)
  feePayer: string
  protocols: Protocol[]
  hopCount?: number
  routeType?: 'single-hop' | 'multi-hop'
  inputMint: string
  inputRaw: string          // exact integer in base units
  inputDecimals: number
  inputAmountDecimal: string
  inputAmountNumber?: number
  inputTokenProgram?: TokenProgramKind
  outputMint: string
  outputRaw: string
  outputDecimals: number
  outputAmountDecimal: string
  outputAmountNumber?: number
  outputTokenProgram?: TokenProgramKind
  pool?: string
  swapType?: SwapType       // e.g. "pumpfun-buy", "raydium-cpmm-sell"
  confidence: 'high' | 'medium' | 'low'
  warnings: WarningCode[]
  fee: number               // transaction fee in lamports
}
```

### Zod schemas

Exported for consumers who want to validate their own data:

```ts
import { SwapInputSchema, TransactionMetaSchema, TokenBalanceSchema } from 'solana-swap-parser'

const validated = SwapInputSchema.parse(untrustedData)
```

## How it works

1. **Normalize** — Accepts `jsonParsed`/`json` objects or `base58`/`base64`/`base64+zstd` encoded tuples, deserializing raw bytes when needed
2. **Detect** — Scans top-level and inner instructions for known program IDs
3. **IDL decode** — Matches 8-byte discriminators (`sha256("global:<method>")`) to extract swap direction and amounts
4. **User identification** — Finds the real swapper via IDL signer or token balance heuristics (not just the fee payer)
5. **Balance diffs** — Computes pre/post token balance deltas, normalizes WSOL to SOL, and cross-validates against IDL results

## Development

```bash
bun install

bun test                # run tests
bun run typecheck       # typescript check
bun run lint            # biome lint
bun run format:check    # prettier check
bun run verify          # all of the above

bun run bench           # benchmark (requires RPC_URL)
```

## License

MIT
