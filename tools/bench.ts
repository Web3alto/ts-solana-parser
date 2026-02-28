import { parseTransaction } from '../src/parser.ts'
import type { TransactionNotification } from '../src/types.ts'

const sig = '4FUgVKAde24a7wc75fvGEeyMZbeG374AYBWmHDPH2TiMSYbPP9mGWTXmHsNNiNvQMJGa57kpxyFWeCvyhwmQ94T4'
const rpcUrl = process.env.RPC_URL!

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

function bench(label: string, notification: TransactionNotification, iterations: number) {
  // Warmup
  for (let i = 0; i < 100; i++) parseTransaction(notification)

  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    parseTransaction(notification)
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
  console.log(`    ${iterations.toLocaleString()} iterations`)
  console.log(`    mean: ${mean.toFixed(4)}ms | median: ${median.toFixed(4)}ms`)
  console.log(`    p95:  ${p95.toFixed(4)}ms | p99:    ${p99.toFixed(4)}ms`)
  console.log(`    min:  ${min.toFixed(4)}ms | max:    ${max.toFixed(4)}ms`)
  console.log(`    ~${opsPerSec.toLocaleString()} ops/sec`)
}

const ITERATIONS = 10_000

console.log(`Fetching tx ${sig.slice(0, 12)}... in 3 encodings...\n`)

const [jsonParsedResult, jsonResult, base64Result] = await Promise.all([
  fetchTx('jsonParsed'),
  fetchTx('json'),
  fetchTx('base64'),
])

const jsonParsedNotif = buildNotification(jsonParsedResult)
const jsonNotif = buildNotification(jsonResult)
const base64Notif = buildNotification(base64Result)

// Verify all produce the same swap
const a = parseTransaction(jsonParsedNotif)
const b = parseTransaction(jsonNotif)
const c = parseTransaction(base64Notif)

console.log('=== Correctness check ===')
console.log(`  jsonParsed: swapType=${a?.swapType} pool=${a?.pool?.slice(0, 8)}... input=${a?.inputAmountDecimal}`)
console.log(`  json:       swapType=${b?.swapType} pool=${b?.pool?.slice(0, 8)}... input=${b?.inputAmountDecimal}`)
console.log(`  base64:     swapType=${c?.swapType} pool=${c?.pool?.slice(0, 8)}... input=${c?.inputAmountDecimal}`)
console.log()

console.log(`=== Benchmark (${ITERATIONS.toLocaleString()} iterations each) ===`)
bench('jsonParsed (no deserialization)', jsonParsedNotif, ITERATIONS)
console.log()
bench('json (compiled instructions, no deserialization)', jsonNotif, ITERATIONS)
console.log()
bench('base64 (full deserialization + parse)', base64Notif, ITERATIONS)
