import type { ParsedSwap } from '../../src/types.ts'
import { compareSwapWithSolscan } from './lib/compare.ts'
import { closeBrowser, initBrowser, scrapeSolscanBalances } from './lib/solscan.ts'
import type { ValidationResult } from './lib/types.ts'

const TOKEN = '2UcQk67v'
const RESULTS_FILE = `test/results/token-${TOKEN}.json`
const DELAY_MS = 2000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const raw = (await Bun.file(RESULTS_FILE).json()) as Array<{
  signature: string
  swap: ParsedSwap
}>
console.log(`Loaded ${raw.length} parsed swaps from ${RESULTS_FILE}\n`)

console.log('Launching headless browser...')
await initBrowser()

const results: ValidationResult[] = []
let pass = 0,
  fail = 0,
  error = 0

for (let i = 0; i < raw.length; i++) {
  const { signature, swap } = raw[i]!
  const label = `[${i + 1}/${raw.length}] ${signature.slice(0, 20)}...`

  try {
    await sleep(DELAY_MS)
    const solscanData = await scrapeSolscanBalances(signature)
    const result = compareSwapWithSolscan(swap, solscanData)
    results.push(result)

    if (result.status === 'PASS') {
      pass++
      console.log(`${label} PASS`)
    } else {
      fail++
      console.log(`${label} FAIL`)
      console.log(`  checks: ${JSON.stringify(result.checks)}`)
      if (result.details) console.log(`  details: ${result.details}`)
    }
  } catch (err) {
    error++
    const errResult: ValidationResult = {
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
    results.push(errResult)
    console.log(`${label} ERROR: ${(err as Error).message}`)
  }
}

await closeBrowser()

console.log(`\n=== Summary ===`)
console.log(`  Total:  ${results.length}`)
console.log(`  PASS:   ${pass}`)
console.log(`  FAIL:   ${fail}`)
console.log(`  ERROR:  ${error}`)

if (fail > 0 || error > 0) {
  console.log('\nFailed/errored:')
  for (const r of results) {
    if (r.status !== 'PASS') {
      console.log(`  ${r.signature.slice(0, 24)}... ${r.status}: ${r.details ?? ''}`)
    }
  }
}

const outFile = `test/results/token-${TOKEN}-validation.json`
await Bun.write(outFile, JSON.stringify(results, null, 2))
console.log(`\nResults saved to ${outFile}`)

process.exit(fail > 0 || error > 0 ? 1 : 0)
