import { parseFullSwapTransaction, parseSwap, parseSwapDetailed } from '../src/parse-swap.ts'
import type { SwapInput } from '../src/parse-swap.ts'
import { parseFullTransaction } from '../src/parse-transaction-full.ts'
import { parseTransaction, parseTransactionDetailed } from '../src/parser.ts'
import type { TransactionNotification } from '../src/types.ts'

const sig = '3Y68eMzHCu7C6nqEErK8i7jnrFSSSwNTeea4zJ9eBHH5MJxwcraJ5AvUTAVovgrZJ8aKL2kUq7HKffx69pKDbgRC'
const rpcUrl = process.env.RPC_URL!

if (!rpcUrl) {
  console.error('RPC_URL not set')
  process.exit(1)
}

async function fetchTx(encoding: string) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTransaction',
      params: [sig, { encoding, maxSupportedTransactionVersion: 0 }],
    }),
  })
  const json = (await res.json()) as any
  if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`)
  return json.result
}

function buildNotification(result: any): TransactionNotification {
  return {
    signature: sig,
    slot: result.slot,
    blockTime: result.blockTime ?? null,
    transaction: { meta: result.meta, transaction: result.transaction },
  }
}

function buildSwapInput(result: any): SwapInput {
  return {
    transaction: result.transaction,
    meta: result.meta,
    signature: sig,
    slot: result.slot,
    blockTime: result.blockTime ?? null,
  }
}

function bench(label: string, fn: () => any, iterations: number) {
  // Warmup
  for (let i = 0; i < 200; i++) fn()

  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    fn()
    times.push(performance.now() - start)
  }

  times.sort((a, b) => a - b)
  const sum = times.reduce((a, b) => a + b, 0)
  const mean = sum / times.length
  const median = times[Math.floor(times.length / 2)]!
  const p95 = times[Math.floor(times.length * 0.95)]!
  const p99 = times[Math.floor(times.length * 0.99)]!
  const min = times[0]!
  const max = times[times.length - 1]!
  const opsPerSec = Math.round(1000 / mean)

  console.log(`  ${label}`)
  console.log(`    mean: ${mean.toFixed(4)}ms | median: ${median.toFixed(4)}ms`)
  console.log(`    p95:  ${p95.toFixed(4)}ms | p99:    ${p99.toFixed(4)}ms`)
  console.log(`    min:  ${min.toFixed(4)}ms | max:    ${max.toFixed(4)}ms`)
  console.log(`    ~${opsPerSec.toLocaleString()} ops/sec`)
  console.log()
}

console.log(`Fetching tx ${sig.slice(0, 16)}... in jsonParsed encoding...\n`)

const result = await fetchTx('jsonParsed')
const notif = buildNotification(result)
const swapInput = buildSwapInput(result)

// Quick correctness check
const swap = parseTransaction(notif)
console.log(`=== Transaction info ===`)
console.log(`  swapType: ${swap?.swapType ?? 'N/A'}`)
console.log(`  protocols: ${swap?.protocols?.join(', ') ?? 'N/A'}`)
console.log(`  input: ${swap?.inputAmountDecimal ?? 'N/A'} (${swap?.inputMint?.slice(0, 8)}...)`)
console.log(`  output: ${swap?.outputAmountDecimal ?? 'N/A'} (${swap?.outputMint?.slice(0, 8)}...)`)
console.log(`  tips: ${swap?.tips?.length ?? 0}`)
console.log()

const ITERATIONS = 5_000

console.log(`=== Benchmark (${ITERATIONS.toLocaleString()} iterations, jsonParsed) ===\n`)

// 1. parseTransaction (no validation, swap only)
bench('parseTransaction (no validation, swap only)', () => parseTransaction(notif), ITERATIONS)

// 2. parseTransactionDetailed (no validation, detailed outcome)
bench('parseTransactionDetailed (no validation, detailed outcome)', () => parseTransactionDetailed(notif), ITERATIONS)

// 3. parseSwap (Zod validation + swap)
bench('parseSwap (Zod validated, swap only)', () => parseSwap(swapInput), ITERATIONS)

// 4. parseSwapDetailed (Zod validation + detailed outcome)
bench('parseSwapDetailed (Zod validated, detailed outcome)', () => parseSwapDetailed(swapInput), ITERATIONS)

// 5. parseFullTransaction (no validation, full tx decode)
bench('parseFullTransaction (no validation, full tx decode)', () => parseFullTransaction(notif), ITERATIONS)

// 6. parseFullSwapTransaction (Zod validation + full tx decode)
bench('parseFullSwapTransaction (Zod validated, full tx decode)', () => parseFullSwapTransaction(swapInput), ITERATIONS)
