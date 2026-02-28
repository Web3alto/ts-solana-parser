import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { formatTokenAmountDecimal, toApproxTokenAmountNumber } from '../../src/amount.ts'
import { parseTransaction } from '../../src/parser.ts'
import type { ParsedSwap, TokenProgramKind } from '../../src/types.ts'
import { getTransaction } from './lib/rpc.ts'

const RESULTS_DIR = join(import.meta.dir, '..', 'results')
const FIXTURES_DIR = join(import.meta.dir, '..', 'fixtures')
const FORCE_REFRESH = process.argv.includes('--refresh')

type LegacyRow = {
  signature: string
  swap?: unknown
  parsedSwap?: unknown
}

type CanonicalRow = {
  signature: string
  swap: ParsedSwap
}

interface FileMigrationStats {
  changed: boolean
  touched: number
  parseFailures: number
}

interface Totals {
  filesChanged: number
  touched: number
  parseFailures: number
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isLegacyRow(value: unknown): value is LegacyRow {
  if (!isObject(value)) return false
  if (typeof value.signature !== 'string') return false
  return 'swap' in value || 'parsedSwap' in value
}

function listStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

function maybeFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return value
}

function maybeInt(value: unknown): number | undefined {
  const n = maybeFiniteNumber(value)
  if (n === undefined) return undefined
  return Math.floor(n)
}

function maybeTokenProgram(value: unknown): TokenProgramKind | undefined {
  if (value === 'spl-token' || value === 'token-2022' || value === 'unknown') return value
  return undefined
}

function maybeNullableFiniteNumber(value: unknown): number | null | undefined {
  if (value === null) return null
  return maybeFiniteNumber(value)
}

function maybeUintString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (!/^[0-9]+$/.test(value)) return undefined
  return value
}

function isLooseParsedSwap(value: unknown): value is ParsedSwap {
  if (!isObject(value)) return false
  return (
    typeof value.signature === 'string' &&
    typeof value.slot === 'number' &&
    typeof value.user === 'string' &&
    typeof value.feePayer === 'string' &&
    typeof value.inputMint === 'string' &&
    typeof value.inputRaw === 'string' &&
    typeof value.outputMint === 'string' &&
    typeof value.outputRaw === 'string' &&
    Array.isArray(value.protocols) &&
    typeof value.confidence === 'string' &&
    typeof value.fee === 'number'
  )
}

function canonicalizeSwap(value: unknown, fallbackSignature: string): ParsedSwap | null {
  if (!isObject(value)) return null

  const signature = typeof value.signature === 'string' ? value.signature : fallbackSignature
  const slot = maybeInt(value.slot)
  const user = typeof value.user === 'string' ? value.user : undefined
  const feePayer = typeof value.feePayer === 'string' ? value.feePayer : undefined
  const protocols = listStringArray(value.protocols) as ParsedSwap['protocols']
  const inputMint = typeof value.inputMint === 'string' ? value.inputMint : undefined
  const outputMint = typeof value.outputMint === 'string' ? value.outputMint : undefined
  const inputRaw = maybeUintString(value.inputRaw)
  const outputRaw = maybeUintString(value.outputRaw)
  const inputDecimals = maybeInt(value.inputDecimals)
  const outputDecimals = maybeInt(value.outputDecimals)
  const fee = maybeFiniteNumber(value.fee)

  if (!signature || slot === undefined || !user || !feePayer) return null
  if (protocols.length === 0 || !inputMint || !outputMint) return null
  if (!inputRaw || !outputRaw || inputDecimals === undefined || outputDecimals === undefined) return null
  if (fee === undefined) return null

  const normalizedHopCount = Math.max(1, maybeInt(value.hopCount) ?? protocols.length)
  const routeType =
    value.routeType === 'single-hop' || value.routeType === 'multi-hop'
      ? value.routeType
      : normalizedHopCount > 1
        ? 'multi-hop'
        : 'single-hop'
  const confidence =
    value.confidence === 'high' || value.confidence === 'medium' || value.confidence === 'low'
      ? value.confidence
      : 'medium'

  const inputAmountDecimal =
    typeof value.inputAmountDecimal === 'string'
      ? value.inputAmountDecimal
      : formatTokenAmountDecimal(BigInt(inputRaw), inputDecimals)
  const outputAmountDecimal =
    typeof value.outputAmountDecimal === 'string'
      ? value.outputAmountDecimal
      : formatTokenAmountDecimal(BigInt(outputRaw), outputDecimals)

  const inputAmountNumber =
    maybeFiniteNumber(value.inputAmountNumber) ?? toApproxTokenAmountNumber(BigInt(inputRaw), inputDecimals)
  const outputAmountNumber =
    maybeFiniteNumber(value.outputAmountNumber) ?? toApproxTokenAmountNumber(BigInt(outputRaw), outputDecimals)

  const inputTokenProgram = maybeTokenProgram(value.inputTokenProgram)
  const outputTokenProgram = maybeTokenProgram(value.outputTokenProgram)
  const inputToken2022TransferFeeBps = maybeNullableFiniteNumber(value.inputToken2022TransferFeeBps)
  const outputToken2022TransferFeeBps = maybeNullableFiniteNumber(value.outputToken2022TransferFeeBps)
  const legacyToken2022TransferFeeBps = maybeNullableFiniteNumber(value.token2022TransferFeeBps)

  const swap: ParsedSwap = {
    signature,
    slot,
    blockTime: maybeFiniteNumber(value.blockTime),
    user,
    feePayer,
    protocols,
    hopCount: normalizedHopCount,
    routeType,
    inputMint,
    inputRaw,
    inputDecimals,
    inputAmountDecimal,
    inputAmountNumber,
    inputTokenProgram,
    inputToken2022TransferFeeBps,
    outputMint,
    outputRaw,
    outputDecimals,
    outputAmountDecimal,
    outputAmountNumber,
    outputTokenProgram,
    outputToken2022TransferFeeBps,
    token2022TransferFeeBps:
      legacyToken2022TransferFeeBps ?? inputToken2022TransferFeeBps ?? outputToken2022TransferFeeBps,
    pool: typeof value.pool === 'string' ? value.pool : undefined,
    swapType: typeof value.swapType === 'string' ? (value.swapType as ParsedSwap['swapType']) : undefined,
    confidence,
    warnings: listStringArray(value.warnings) as ParsedSwap['warnings'],
    fee,
  }

  return swap
}

async function readJson(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf-8')
  return JSON.parse(text) as unknown
}

async function listJsonFilesRecursive(dir: string): Promise<string[]> {
  const out: string[] = []

  async function walk(current: string): Promise<void> {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        out.push(full)
      }
    }
  }

  await walk(dir)
  out.sort()
  return out
}

function shouldMigrateFile(path: string): boolean {
  const filename = path.split('/').pop() ?? ''
  if (path.startsWith(RESULTS_DIR)) {
    if (filename.endsWith('-parsed.json')) return true
    if (/^token-.*\.json$/.test(filename) && !filename.endsWith('-validation.json')) return true
    return false
  }

  if (path.startsWith(FIXTURES_DIR)) {
    return filename === 'signatures.json'
  }

  return false
}

async function refreshSwap(signature: string): Promise<ParsedSwap | null> {
  try {
    const tx = await getTransaction(signature)
    return parseTransaction(tx)
  } catch {
    return null
  }
}

async function migrateFile(path: string): Promise<FileMigrationStats> {
  const json = await readJson(path)
  if (!Array.isArray(json) || json.length === 0) {
    return { changed: false, touched: 0, parseFailures: 0 }
  }

  const rows = json
  if (!rows.every(isLegacyRow)) {
    return { changed: false, touched: 0, parseFailures: 0 }
  }

  const cache = new Map<string, ParsedSwap | null>()
  let changed = false
  let touched = 0
  let parseFailures = 0

  const nextRows: CanonicalRow[] = []

  for (const row of rows) {
    const currentSwap = row.swap ?? row.parsedSwap
    let canonical = canonicalizeSwap(currentSwap, row.signature)

    if (!canonical && FORCE_REFRESH) {
      let refreshed = cache.get(row.signature)
      if (refreshed === undefined) {
        refreshed = await refreshSwap(row.signature)
        cache.set(row.signature, refreshed)
      }
      canonical = canonicalizeSwap(refreshed, row.signature)
    }

    if (!canonical) {
      parseFailures++
      if (isLooseParsedSwap(currentSwap)) {
        canonical = currentSwap
      } else {
        continue
      }
    }

    const next: CanonicalRow = { signature: row.signature, swap: canonical }
    nextRows.push(next)

    if (JSON.stringify(row) !== JSON.stringify(next)) {
      changed = true
      touched++
    }
  }

  if (!changed) {
    return { changed: false, touched: 0, parseFailures }
  }

  await writeFile(path, `${JSON.stringify(nextRows, null, 2)}\n`, 'utf-8')
  return { changed: true, touched, parseFailures }
}

console.log('=== Migrate stored fixture/result JSON to canonical schema ===')
if (FORCE_REFRESH) {
  console.log('Mode: schema migration + RPC refresh from current parser')
} else {
  console.log('Mode: schema migration only (no RPC calls)')
}

const files = [...(await listJsonFilesRecursive(RESULTS_DIR)), ...(await listJsonFilesRecursive(FIXTURES_DIR))].filter(
  shouldMigrateFile,
)

const totals: Totals = {
  filesChanged: 0,
  touched: 0,
  parseFailures: 0,
}

for (const file of files) {
  const stats = await migrateFile(file)
  totals.parseFailures += stats.parseFailures

  if (!stats.changed) continue

  totals.filesChanged++
  totals.touched += stats.touched

  const label = relative(import.meta.dir, file)
  console.log(`  ${label}: migrated=${stats.touched} parseFailures=${stats.parseFailures}`)
}

console.log('\n=== Summary ===')
console.log(`  Files changed: ${totals.filesChanged}`)
console.log(`  Entries migrated: ${totals.touched}`)
console.log(`  Parse failures: ${totals.parseFailures}`)

if (totals.parseFailures > 0) {
  console.log('\nNOTE: Some rows could not be normalized exactly.')
}
