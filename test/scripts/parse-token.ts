import { parseSwap } from '../../src/parse-swap.ts'
import type { TransactionNotification } from '../../src/types.ts'

const TOKEN = '2UcQk67vPDUp5VtTpjnbE12nhwvrFkV62Z2Qq5Wtpump'
const rpcUrl = process.env.RPC_URL!
if (!rpcUrl) throw new Error('RPC_URL env var required')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function rpcCall(method: string, params: unknown[]) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = (await res.json()) as any
  if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`)
  return json.result
}

// Fetch ALL signatures by paginating with `before`
async function getAllSignatures(address: string): Promise<string[]> {
  const all: string[] = []
  let before: string | undefined

  while (true) {
    const opts: any = { limit: 1000 }
    if (before) opts.before = before

    const batch = (await rpcCall('getSignaturesForAddress', [address, opts])) as Array<{
      signature: string
      err: unknown | null
    }>

    if (batch.length === 0) break

    const successful = batch.filter((r) => r.err === null)
    all.push(...successful.map((r) => r.signature))

    console.log(`  Fetched ${batch.length} sigs (${successful.length} successful), total: ${all.length}`)

    if (batch.length < 1000) break
    before = batch[batch.length - 1]!.signature
    await sleep(100)
  }

  return all
}

async function fetchTx(sig: string): Promise<TransactionNotification> {
  const result = await rpcCall('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }])
  if (!result) throw new Error(`Tx not found: ${sig}`)
  return {
    signature: sig,
    slot: result.slot,
    blockTime: result.blockTime ?? null,
    transaction: { meta: result.meta, transaction: result.transaction },
  }
}

// Main
console.log(`Fetching all transaction signatures for token: ${TOKEN}\n`)

const signatures = await getAllSignatures(TOKEN)
console.log(`\nTotal signatures: ${signatures.length}\n`)

let parsed = 0
let skipped = 0
let errors = 0

const results: Array<{ signature: string; swap: unknown }> = []

for (let i = 0; i < signatures.length; i++) {
  const sig = signatures[i]!

  try {
    if (i > 0 && i % 10 === 0) await sleep(50)

    const notification = await fetchTx(sig)
    const input = {
      transaction: notification.transaction.transaction,
      meta: notification.transaction.meta,
      signature: sig,
      slot: notification.slot,
      blockTime: notification.blockTime,
    }
    const swap = parseSwap(input)

    if (swap) {
      parsed++
      results.push({ signature: sig, swap })
      console.log(
        `[${i + 1}/${signatures.length}] PARSED ${sig.slice(0, 16)}... ` +
          `${swap.swapType ?? '?'} | ${swap.inputAmountDecimal} ${swap.inputMint.slice(0, 8)}... → ${swap.outputAmountDecimal} ${swap.outputMint.slice(0, 8)}... | user: ${swap.user.slice(0, 8)}... | pool: ${swap.pool?.slice(0, 8) ?? 'none'}...`,
      )
    } else {
      skipped++
      if (i % 50 === 0 || signatures.length < 100) {
        console.log(`[${i + 1}/${signatures.length}] SKIP    ${sig.slice(0, 16)}... (not a swap)`)
      }
    }
  } catch (err) {
    errors++
    console.log(`[${i + 1}/${signatures.length}] ERROR   ${sig.slice(0, 16)}... ${(err as Error).message}`)
  }
}

console.log(`\n=== Summary ===`)
console.log(`  Total transactions: ${signatures.length}`)
console.log(`  Parsed as swaps:    ${parsed}`)
console.log(`  Not swaps (skipped): ${skipped}`)
console.log(`  Errors:             ${errors}`)

// Save results
const outFile = `test/results/token-${TOKEN.slice(0, 8)}.json`
await Bun.write(outFile, JSON.stringify(results, null, 2))
console.log(`\nResults saved to ${outFile}`)
