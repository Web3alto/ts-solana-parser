import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { PROGRAM_ID_TO_PROTOCOL, Protocol } from '../../src/constants.ts'
import { parseTransaction } from '../../src/parser.ts'
import { getSignaturesForAddress, getTransaction } from './lib/rpc.ts'
import { type FixtureEntry, PROTOCOL_DIRS } from './lib/types.ts'

const FIXTURES_DIR = join(import.meta.dir, '..', 'fixtures')
const SIGS_PER_PROTOCOL = 100
const MAX_FIXTURES = 15
const DELAY_MS = 100

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Invert the map to get programId per protocol
const PROTOCOL_TO_PROGRAM_ID = new Map<Protocol, string>()
for (const [pid, proto] of Object.entries(PROGRAM_ID_TO_PROTOCOL)) {
  PROTOCOL_TO_PROGRAM_ID.set(proto, pid)
}

async function harvestProtocol(protocol: Protocol): Promise<number> {
  const programId = PROTOCOL_TO_PROGRAM_ID.get(protocol)!
  const dirName = PROTOCOL_DIRS[protocol]
  const outDir = join(FIXTURES_DIR, dirName)
  await mkdir(outDir, { recursive: true })

  console.log(`\n[${protocol}] Fetching signatures from ${programId.slice(0, 8)}...`)

  const signatures = await getSignaturesForAddress(programId, SIGS_PER_PROTOCOL)
  console.log(`[${protocol}] Got ${signatures.length} successful signatures`)

  const fixtures: FixtureEntry[] = []

  for (const sig of signatures) {
    if (fixtures.length >= MAX_FIXTURES) break

    try {
      await sleep(DELAY_MS)
      const notification = await getTransaction(sig)
      const parsed = parseTransaction(notification)

      if (!parsed) continue

      // Skip multi-protocol (Jupiter routing etc.)
      if (parsed.protocols.length > 1) continue

      fixtures.push({ signature: sig, swap: parsed })
      console.log(
        `  [${fixtures.length}/${MAX_FIXTURES}] ${sig.slice(0, 12)}... ${parsed.swapType ?? 'unknown'} ${parsed.inputAmountDecimal} → ${parsed.outputAmountDecimal}`,
      )
    } catch (err) {
      console.error(`  SKIP ${sig.slice(0, 12)}...: ${(err as Error).message}`)
    }
  }

  const outFile = join(outDir, 'signatures.json')
  await Bun.write(outFile, JSON.stringify(fixtures, null, 2))
  console.log(`[${protocol}] Saved ${fixtures.length} fixtures to ${outFile}`)

  return fixtures.length
}

// Main
console.log('=== Harvest: Fetching swap fixtures per protocol ===')

const protocols = Object.values(Protocol)
let totalFixtures = 0

for (const protocol of protocols) {
  try {
    const count = await harvestProtocol(protocol)
    totalFixtures += count
  } catch (err) {
    console.error(`[${protocol}] FAILED: ${(err as Error).message}`)
  }
}

console.log(`\n=== Done: ${totalFixtures} total fixtures across ${protocols.length} protocols ===`)
