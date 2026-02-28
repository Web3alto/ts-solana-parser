import { chromium } from 'playwright'

// Load a real full signature from results
const data = (await Bun.file('test/results/token-2UcQk67v.json').json()) as any[]
const sig = data[0].signature as string
console.log(`Using signature: ${sig} (${sig.length} chars)`)

const browser = await chromium.launch({ headless: false })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
})
const page = await context.newPage()

await page.goto(`https://solscan.io/tx/${sig}`, {
  waitUntil: 'domcontentloaded',
  timeout: 30_000,
})

await page.waitForTimeout(5000)

// Click Balance Changes tab
const balanceTab = page.locator('button:has-text("Balance Changes")').first()
await balanceTab.click()
await page.waitForTimeout(3000)

// Dump every table row with full cell text
const tables = await page.locator('table').all()
console.log(`\nFound ${tables.length} tables\n`)

for (let t = 0; t < tables.length; t++) {
  console.log(`=== TABLE ${t} ===`)
  const rows = await tables[t]!.locator('tbody tr').all()
  for (let r = 0; r < rows.length; r++) {
    const cells = await rows[r]!.locator('td').all()
    console.log(`  Row ${r} (${cells.length} cells):`)
    for (let c = 0; c < cells.length; c++) {
      const text = await cells[c]!.innerText().catch(() => 'ERR')
      console.log(`    Cell ${c}: "${text.replace(/\n/g, ' | ')}"`)

      // Also dump links in this cell
      const links = await cells[c]!.locator('a').all()
      for (const link of links) {
        const href = await link.getAttribute('href').catch(() => '')
        console.log(`      link: ${href}`)
      }
    }
  }
}

await page.waitForTimeout(5000)
await browser.close()
