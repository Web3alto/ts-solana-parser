import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Protocol } from '../../src/constants.ts'
import { parseTransaction } from '../../src/parser.ts'
import type { ParsedSwap } from '../../src/types.ts'
import { compareSwapWithSolscan } from './lib/compare.ts'
import { getSignaturesForAddressPaginated, getTransaction } from './lib/rpc.ts'
import { closeBrowser, initBrowser, scrapeSolscanBalances } from './lib/solscan.ts'
import { PROTOCOL_DIRS, type ValidationResult } from './lib/types.ts'

const RESULTS_DIR = join(import.meta.dir, '..', 'results')
const TARGET_COUNT = 25
const DELAY_MS = 2000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const TOKEN_ADDRESSES: Record<Protocol, string> = {
  [Protocol.PumpFun]: '2UcQk67vPDUp5VtTpjnbE12nhwvrFkV62Z2Qq5Wtpump',
  [Protocol.PumpSwap]: 'DCEGmjMVGNB5yDfuieVan9nQdLVog1im1vD2SfvkLhJG',
  [Protocol.RaydiumCPMM]: '8opvqaWysX1oYbXuTL8PHaoaTiXD69VFYAX4smPebonk',
  [Protocol.RaydiumLaunchLab]: '288am5VTRa5HUrQdJksHMLxWzFVXxwBU4mDCbvDQFWTF',
  [Protocol.MeteoraDBC]: 'BdGuUUxfp74PnyEYAFnEBFrsHVdDh5PTRHgqqbHKmoon',
  [Protocol.MeteoraDAMMv2]: 'BANKJmvhT8tiJRsBSS1n2HryMBPvT5Ze4HU95DUAmeta',
}

// CLI filtering: bun run test/scripts/validate-all.ts pumpswap raydium-cpmm
const dirToProtocol = new Map(Object.entries(PROTOCOL_DIRS).map(([p, dir]) => [dir, p as Protocol]))

const cliArgs = process.argv.slice(2)
let selectedProtocols: Protocol[]

if (cliArgs.length > 0) {
  selectedProtocols = cliArgs.map((arg) => {
    const protocol = dirToProtocol.get(arg.toLowerCase())
    if (!protocol) {
      console.error(`Unknown protocol: "${arg}". Valid: ${[...dirToProtocol.keys()].join(', ')}`)
      process.exit(1)
    }
    return protocol
  })
} else {
  selectedProtocols = Object.values(Protocol)
}

// --- Phase 1: Fetch + Parse ---

interface ParsedEntry {
  signature: string
  swap: ParsedSwap
}

async function fetchAndParse(protocol: Protocol): Promise<ParsedEntry[]> {
  const tokenAddress = TOKEN_ADDRESSES[protocol]
  const dirName = PROTOCOL_DIRS[protocol]
  const entries: ParsedEntry[] = []
  let cursor: string | undefined
  let pages = 0

  console.log(`\n[${dirName}] Fetching swaps for token ${tokenAddress.slice(0, 12)}...`)

  while (entries.length < TARGET_COUNT) {
    const { signatures, lastSignature } = await getSignaturesForAddressPaginated(tokenAddress, {
      batchSize: 100,
      before: cursor,
    })

    if (signatures.length === 0) {
      console.log(`[${dirName}] No more signatures after ${pages} pages`)
      break
    }

    pages++
    cursor = lastSignature

    for (const sig of signatures) {
      if (entries.length >= TARGET_COUNT) break

      try {
        const tx = await getTransaction(sig)
        const parsed = parseTransaction(tx)
        if (!parsed) continue

        // Filter: single-protocol swap matching our target
        if (parsed.protocols.length === 1 && parsed.protocols[0] === protocol) {
          entries.push({ signature: sig, swap: parsed })
          process.stdout.write(`\r[${dirName}] ${entries.length}/${TARGET_COUNT} swaps found`)
        }
      } catch {
        // Skip failed fetches
      }
    }
  }

  console.log(`\n[${dirName}] Collected ${entries.length} swaps`)
  return entries
}

// --- Phase 2: Validate against Solscan ---

async function validateEntries(protocol: Protocol, entries: ParsedEntry[]): Promise<ValidationResult[]> {
  const dirName = PROTOCOL_DIRS[protocol]
  const results: ValidationResult[] = []

  console.log(`\n[${dirName}] Validating ${entries.length} swaps against Solscan...`)

  for (let i = 0; i < entries.length; i++) {
    const { signature, swap } = entries[i]!
    const label = `  [${i + 1}/${entries.length}] ${signature.slice(0, 12)}...`

    try {
      await sleep(DELAY_MS)
      const solscanData = await scrapeSolscanBalances(signature)
      const result = compareSwapWithSolscan(swap, solscanData)
      results.push(result)

      const icon = result.status === 'PASS' ? 'PASS' : 'FAIL'
      console.log(`${label} ${icon}`)
      if (result.details) console.log(`    ${result.details}`)
    } catch (err) {
      const errorResult: ValidationResult = {
        signature,
        status: 'ERROR',
        checks: {
          userFound: false,
          inputMintMatch: false,
          outputMintMatch: false,
          inputAmountMatch: false,
          outputAmountMatch: false,
        },
        details: (err as Error).message,
      }
      results.push(errorResult)
      console.log(`${label} ERROR: ${(err as Error).message}`)
    }
  }

  return results
}

// --- Main ---

console.log('=== Multi-Protocol Validation ===')
console.log(`Protocols: ${selectedProtocols.map((p) => PROTOCOL_DIRS[p]).join(', ')}`)

await mkdir(RESULTS_DIR, { recursive: true })

// Phase 1: Fetch and parse all protocols (RPC only)
const allParsed = new Map<Protocol, ParsedEntry[]>()

for (const protocol of selectedProtocols) {
  try {
    const entries = await fetchAndParse(protocol)
    allParsed.set(protocol, entries)

    // Save parsed results
    const dirName = PROTOCOL_DIRS[protocol]
    await Bun.write(join(RESULTS_DIR, `${dirName}-parsed.json`), JSON.stringify(entries, null, 2))
  } catch (err) {
    console.error(`\n[${PROTOCOL_DIRS[protocol]}] FETCH ERROR: ${(err as Error).message}`)
    allParsed.set(protocol, [])
  }
}

// Phase 2: Validate against Solscan (browser)
console.log('\n\n=== Phase 2: Solscan Validation ===')
console.log('Launching browser (headed for Cloudflare)...')
await initBrowser()

let grandPass = 0
let grandFail = 0
let grandError = 0
const allValidation = new Map<Protocol, ValidationResult[]>()

for (const protocol of selectedProtocols) {
  const entries = allParsed.get(protocol)!
  if (entries.length === 0) continue

  const results = await validateEntries(protocol, entries)
  allValidation.set(protocol, results)

  // Save validation results
  const dirName = PROTOCOL_DIRS[protocol]
  await Bun.write(join(RESULTS_DIR, `${dirName}-validation.json`), JSON.stringify(results, null, 2))

  for (const r of results) {
    if (r.status === 'PASS') grandPass++
    else if (r.status === 'FAIL') grandFail++
    else grandError++
  }
}

await closeBrowser()

// --- Summary ---

console.log('\n\n=== Per-Protocol Summary ===')
for (const protocol of selectedProtocols) {
  const results = allValidation.get(protocol) ?? []
  const pass = results.filter((r) => r.status === 'PASS').length
  const fail = results.filter((r) => r.status === 'FAIL').length
  const err = results.filter((r) => r.status === 'ERROR').length
  const icon = fail === 0 && err === 0 ? 'OK' : 'XX'
  console.log(`  [${icon}] ${PROTOCOL_DIRS[protocol].padEnd(20)} ${pass} pass / ${fail} fail / ${err} error`)
}

const grandTotal = grandPass + grandFail + grandError
console.log(`\n=== Grand Total ===`)
console.log(`  Total:  ${grandTotal}`)
console.log(`  PASS:   ${grandPass}`)
console.log(`  FAIL:   ${grandFail}`)
console.log(`  ERROR:  ${grandError}`)

if (grandFail > 0 || grandError > 0) {
  console.log('\nFailed/errored:')
  for (const [protocol, results] of allValidation) {
    for (const r of results) {
      if (r.status !== 'PASS') {
        console.log(`  [${PROTOCOL_DIRS[protocol]}] ${r.signature.slice(0, 20)}... ${r.status}: ${r.details ?? ''}`)
      }
    }
  }
  process.exit(1)
}

console.log('\nAll validations passed!')
