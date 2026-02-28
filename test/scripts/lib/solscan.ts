import { type Browser, type BrowserContext, chromium, type Page } from 'playwright'
import type { SolscanBalanceData, SolscanSolChange, SolscanTokenChange } from './types.ts'

let browser: Browser | null = null
let context: BrowserContext | null = null
let page: Page | null = null

export async function initBrowser(): Promise<void> {
  browser = await chromium.launch({ headless: false })
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })
  page = await context.newPage()
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close()
    browser = null
    context = null
    page = null
  }
}

function parseAmount(text: string): number {
  // Handle formats like "+ 0.656485494" or "- | 23,876,902.218507"
  const cleaned = text
    .replace(/\|/g, '') // remove pipe separators
    .replace(/,/g, '') // remove comma grouping
    .replace(/\$/g, '') // remove dollar signs
    .replace(/\s+/g, '') // remove all whitespace
    .trim()
  return parseFloat(cleaned)
}

function extractAddressFromHref(href: string | null): string | null {
  if (!href) return null
  const match = href.match(/\/account\/([A-Za-z1-9]+)/)
  return match?.[1] ?? null
}

function extractMintFromHref(href: string | null): string | null {
  if (!href) return null
  const match = href.match(/\/token\/([A-Za-z1-9]+)/)
  return match?.[1] ?? null
}

async function isCloudflareChallenge(p: Page): Promise<boolean> {
  const title = await p.title().catch(() => '')
  if (title.toLowerCase().includes('just a moment')) return true

  const body = await p
    .locator('body')
    .innerText({ timeout: 3000 })
    .catch(() => '')
  if (body.includes('Verify you are human') || body.includes('challenge-platform')) return true

  const turnstile = await p
    .locator('iframe[src*="challenges.cloudflare"]')
    .count()
    .catch(() => 0)
  if (turnstile > 0) return true

  return false
}

async function waitForCloudflare(p: Page): Promise<void> {
  if (!(await isCloudflareChallenge(p))) return

  console.log('\n  *** Cloudflare challenge detected! ***')
  console.log('  Please solve the challenge in the browser window.')
  console.log('  Waiting for you to complete it...\n')

  const maxWait = 120_000
  const start = Date.now()

  while (Date.now() - start < maxWait) {
    await p.waitForTimeout(1500)
    if (!(await isCloudflareChallenge(p))) {
      console.log('  Cloudflare challenge cleared! Continuing...\n')
      await p.waitForTimeout(1000)
      return
    }
  }

  throw new Error('Cloudflare challenge timeout — not solved within 2 minutes')
}

export async function scrapeSolscanBalances(signature: string): Promise<SolscanBalanceData> {
  if (!page) throw new Error('Browser not initialized — call initBrowser()')

  await page.goto(`https://solscan.io/tx/${signature}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  })

  await waitForCloudflare(page)
  await page.waitForTimeout(2000)

  // Click "Balance Changes" tab
  const balanceTab = page.locator('button:has-text("Balance Changes")').first()
  await balanceTab.click()
  await page.waitForTimeout(2000)

  const tables = await page.locator('table').all()

  // Table 0 = SOL Balance Changes
  // Table 1 = Token Balance Changes (may not exist if no token changes)
  const solChanges = tables.length > 0 ? await extractSolChanges(tables[0]!) : []
  const tokenChanges = tables.length > 1 ? await extractTokenChanges(tables[1]!) : []

  return { solChanges, tokenChanges }
}

/**
 * SOL Balance Change table layout:
 *   Cell 0: address (link to /account/<addr>)
 *   Cell 1: flags (WRITABLE, SIGNER, etc.)
 *   Cell 2: change amount (e.g. "+ 0.656485494" or "- 0.682767416")
 *   Cell 3: pre-balance
 *   Cell 4: post-balance
 *   Cell 5: USD value
 */
async function extractSolChanges(table: any): Promise<SolscanSolChange[]> {
  const changes: SolscanSolChange[] = []
  const rows = await table.locator('tbody tr').all()

  for (const row of rows) {
    try {
      const cells = await row.locator('td').all()
      if (cells.length < 3) continue

      // Address from first cell's link
      const addrLink = await cells[0]!.locator('a').first()
      const href = await addrLink.getAttribute('href').catch(() => null)
      const address = extractAddressFromHref(href)
      if (!address) continue

      // Change from cell 2
      const changeText = await cells[2]!.innerText()
      const amount = parseAmount(changeText)
      if (!Number.isNaN(amount) && amount !== 0) {
        changes.push({ address, change: amount })
      }
    } catch {}
  }

  return changes
}

/**
 * Token Balance Change table layout:
 *   Cell 0: token account address (link to /account/<tokenAccount>)
 *   Cell 1: owner address (link to /account/<owner>)
 *   Cell 2: change amount (e.g. "- | 23,876,902.218507" or "+ | 23,876,902.218507")
 *   Cell 3: pre-balance
 *   Cell 4: post-balance
 *   Cell 5: USD value
 *   Cell 6: token name + link to /token/<mint>
 */
async function extractTokenChanges(table: any): Promise<SolscanTokenChange[]> {
  const changes: SolscanTokenChange[] = []
  const rows = await table.locator('tbody tr').all()

  for (const row of rows) {
    try {
      const cells = await row.locator('td').all()
      if (cells.length < 7) continue

      // Owner from cell 1's link
      const ownerLink = await cells[1]!.locator('a').first()
      const ownerHref = await ownerLink.getAttribute('href').catch(() => null)
      const owner = extractAddressFromHref(ownerHref)
      if (!owner) continue

      // Mint from cell 6's link
      const mintLink = await cells[6]!.locator('a').first()
      const mintHref = await mintLink.getAttribute('href').catch(() => null)
      const mint = extractMintFromHref(mintHref)
      if (!mint) continue

      // Change from cell 2
      const changeText = await cells[2]!.innerText()
      const amount = parseAmount(changeText)
      if (!Number.isNaN(amount) && amount !== 0) {
        changes.push({ owner, mint, change: amount })
      }
    } catch {}
  }

  return changes
}
