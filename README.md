# solana-parser-v2

Real-time Solana swap parser that streams transactions from Helius WebSocket and extracts swap data from 6 DEX protocols. Zero dependencies beyond Bun — no `@solana/web3.js`, no Anchor, no bs58 packages.

## Supported protocols

| Protocol | Program ID | Buy/Sell detection |
|---|---|---|
| PumpFun | `6EF8rr...` | `buy`, `sell`, `buy_exact_sol_in` |
| PumpSwap | `pAMMBa...` | `buy`, `sell`, `buy_exact_quote_in` |
| Raydium CPMM | `CPMMoo...` | `swap_base_input`, `swap_base_output` |
| Raydium LaunchLab | `LanMV9...` | `buy_exact_in/out`, `sell_exact_in/out` |
| Meteora DBC | `dbcij3...` | `swap`, `swap2` (ExactIn/ExactOut) |
| Meteora DAMMv2 | `cpamDP...` | `swap`, `swap2` (ExactIn/ExactOut) |

## How it works

1. **Stream** — Subscribes to Helius Atlas WebSocket for real-time confirmed transactions that touch any supported program
2. **Normalize** — Handles `jsonParsed`, `json`, `base58`, and `base64` encoded transactions, deserializing raw bytes when needed
3. **Detect** — Scans top-level and inner instructions for known program IDs
4. **IDL parse** — Decodes instruction data using hardcoded discriminators (sha256 of Anchor method names) to determine swap direction and extract amounts
5. **User identification** — Finds the real swapper via token balance heuristics (not just the fee payer, which is often a relay/bot)
6. **Token deltas** — Computes pre/post token balance diffs, merges WSOL with native SOL, and identifies input/output sides
7. **Enrich** — Cross-validates IDL results against balance diffs, extracts pool address from known account indices

## Setup

```bash
bun install
```

Create a `.env` file with your Helius RPC URL:

```
RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
```

## Usage

```bash
# Stream and parse swaps in real-time
bun run index.ts

# Benchmark parser across 3 encoding formats (10k iterations)
bun run bench.ts
```

### Output format

```
[PumpFun] 5Kx8Qr... pumpfun-buy 1.5000 SOL → 1,234,567 CJaf3U... | pool: 7xKXtg... | fee: 0.000005 SOL | <signature>
```

### ParsedSwap type

```ts
interface ParsedSwap {
  signature: string;
  slot: number;
  user: string;           // actual swapper, not necessarily fee payer
  protocols: Protocol[];
  inputMint: string;
  inputAmount: number;
  outputMint: string;
  outputAmount: number;
  pool?: string;           // pool/AMM address when extractable
  swapType?: SwapType;     // e.g. "pumpfun-buy", "raydium-cpmm-sell"
  fee: number;             // transaction fee in lamports
  timestamp: number;
}
```

## Project structure

```
index.ts                    # CLI entry point — streams and logs swaps
bench.ts                    # Benchmark across jsonParsed/json/base64
src/
  types.ts                  # Helius WebSocket + parser output types
  constants.ts              # Program IDs, protocol enum, SOL mints
  parser.ts                 # Main parser: detect, identify user, compute deltas
  stream.ts                 # Helius WebSocket subscription + reconnect
  normalize.ts              # Unified format from any encoding
  deserialize.ts            # Raw transaction byte deserialization
  idl/
    codec.ts                # Base58/64, compact u16, discriminator matching
    types.ts                # RawSwap, ParseContext, ProgramParser interface
    registry.ts             # Parser registry — dispatches by program ID
    programs/
      pumpfun.ts            # PumpFun parser
      pumpswap.ts           # PumpSwap parser
      raydium-cpmm.ts       # Raydium CPMM parser
      raydium-launchlab.ts  # Raydium LaunchLab parser
      meteora-common.ts     # Shared Meteora parser factory
      meteora-dbc.ts        # Meteora DBC config
      meteora-dammv2.ts     # Meteora DAMMv2 config
```
