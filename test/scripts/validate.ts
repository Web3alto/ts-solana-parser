import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Protocol } from '../../src/constants.ts'
import type { ParsedSwap } from '../../src/types.ts'
import { compareSwapWithSolscan } from './lib/compare.ts'
import { closeBrowser, initBrowser, scrapeSolscanBalances } from './lib/solscan.ts'
import { type FixtureEntry, PROTOCOL_DIRS, type ValidationResult } from './lib/types.ts'

const FIXTURES_DIR = join(import.meta.dir, '..', 'fixtures')
const RESULTS_DIR = join(import.meta.dir, '..', 'results')
const DELAY_MS = 2000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function isParsedSwap(value: unknown): value is ParsedSwap {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.signature === 'string' &&
    typeof row.slot === 'number' &&
    typeof row.user === 'string' &&
    typeof row.feePayer === 'string' &&
    typeof row.inputMint === 'string' &&
    typeof row.inputRaw === 'string' &&
    typeof row.outputMint === 'string' &&
    typeof row.outputRaw === 'string' &&
    Array.isArray(row.protocols)
  )
}

async function loadFixtures(protocol: Protocol): Promise<FixtureEntry[]> {
  const dirName = PROTOCOL_DIRS[protocol]
  const filePath = join(FIXTURES_DIR, dirName, 'signatures.json')
  try {
    const text = await Bun.file(filePath).text()
    const raw = JSON.parse(text) as unknown
    if (!Array.isArray(raw)) return []

    const out: FixtureEntry[] = []
    for (const row of raw) {
      if (typeof row !== 'object' || row === null) continue
      const candidate = row as {
        signature?: unknown
        swap?: unknown
        parsedSwap?: unknown
      }
      if (typeof candidate.signature !== 'string') continue
      const swap = candidate.swap ?? candidate.parsedSwap
      if (!isParsedSwap(swap)) continue
      out.push({ signature: candidate.signature, swap })
    }
    return out
  } catch {
    return []
  }
}

async function validateProtocol(protocol: Protocol): Promise<ValidationResult[]> {
  const fixtures = await loadFixtures(protocol)
  if (fixtures.length === 0) {
    console.log(`[${protocol}] No fixtures found — skipping`)
    return []
  }

  console.log(`\n[${protocol}] Validating ${fixtures.length} fixtures...`)
  const results: ValidationResult[] = []

  for (let i = 0; i < fixtures.length; i++) {
    const { signature, swap } = fixtures[i]!
    const label = `  [${i + 1}/${fixtures.length}] ${signature.slice(0, 12)}...`

    try {
      await sleep(DELAY_MS)
      const solscanData = await scrapeSolscanBalances(signature)
      const result = compareSwapWithSolscan(swap, solscanData)
      results.push(result)

      const icon = result.status === 'PASS' ? 'OK' : 'FAIL'
      console.log(`${label} ${icon}`)
      if (result.details) {
        console.log(`    ${result.details}`)
      }
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

// Main
console.log('=== Validate: Comparing parser output against Solscan ===\n')
console.log('Launching headless browser...')

await initBrowser()

const protocols = Object.values(Protocol)
const allResults: Record<string, ValidationResult[]> = {}

let totalPass = 0
let totalFail = 0
let totalError = 0

await mkdir(RESULTS_DIR, { recursive: true })

for (const protocol of protocols) {
  try {
    const results = await validateProtocol(protocol)
    allResults[protocol] = results

    // Save per-protocol results
    const dirName = PROTOCOL_DIRS[protocol]
    const outFile = join(RESULTS_DIR, `${dirName}.json`)
    await Bun.write(outFile, JSON.stringify(results, null, 2))

    for (const r of results) {
      if (r.status === 'PASS') totalPass++
      else if (r.status === 'FAIL') totalFail++
      else totalError++
    }
  } catch (err) {
    console.error(`[${protocol}] FAILED: ${(err as Error).message}`)
  }
}

await closeBrowser()

// Summary
const total = totalPass + totalFail + totalError
console.log('\n=== Summary ===')
console.log(`  Total:  ${total}`)
console.log(`  PASS:   ${totalPass}`)
console.log(`  FAIL:   ${totalFail}`)
console.log(`  ERROR:  ${totalError}`)

if (totalFail > 0 || totalError > 0) {
  console.log('\nFailed/errored signatures:')
  for (const [protocol, results] of Object.entries(allResults)) {
    for (const r of results) {
      if (r.status !== 'PASS') {
        console.log(`  [${protocol}] ${r.signature.slice(0, 20)}... — ${r.status}: ${r.details ?? ''}`)
      }
    }
  }
  process.exit(1)
}

console.log('\nAll validations passed!')
