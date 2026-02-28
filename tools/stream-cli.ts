import { SOL_MINT } from '../src/constants.ts'
import { createRpcBackedParserOptions } from '../src/resolvers.ts'
import { startStream } from '../src/stream.ts'

function formatMint(mint: string): string {
  if (mint === SOL_MINT) return 'SOL'
  return `${mint.slice(0, 8)}...`
}

function formatAmount(decimalAmount: string): string {
  const amount = Number(decimalAmount)
  if (Number.isFinite(amount)) {
    if (Math.abs(amount) >= 1) {
      return amount.toLocaleString(undefined, { maximumFractionDigits: 4 })
    }
    return amount.toPrecision(4)
  }
  return decimalAmount
}

const rpcUrl = process.env.RPC_URL
if (!rpcUrl) {
  console.error('RPC_URL environment variable is required')
  process.exit(1)
}

console.log('Starting Solana swap parser...\n')

const parserOptions = createRpcBackedParserOptions({
  rpcUrl,
  onError: ({ tableAccount, error }) => {
    console.error(`[resolver] lookup fetch failed${tableAccount ? ` (${tableAccount})` : ''}:`, error)
  },
})

const handle = startStream({
  parserOptions,
  onSwap: (swap) => {
    const input = `${formatAmount(swap.inputAmountDecimal)} ${formatMint(swap.inputMint)}`
    const output = `${formatAmount(swap.outputAmountDecimal)} ${formatMint(swap.outputMint)}`
    const protocols = swap.protocols.join(', ')
    const pool = swap.pool ? `${swap.pool.slice(0, 8)}...` : 'unknown'
    const fee = (swap.fee / 1e9).toFixed(6)

    const swapType = swap.swapType ?? 'unknown'

    console.log(
      `[${protocols}] ${swap.user.slice(0, 8)}... ${swapType} ${input} → ${output} | pool: ${pool} | fee: ${fee} SOL | ${swap.signature}`,
    )
  },
})

let stopping = false
async function shutdown(signal: string): Promise<void> {
  if (stopping) return
  stopping = true
  console.log(`\n[stream] received ${signal}, draining...`)
  const result = await handle.stop({ drain: true, timeoutMs: 30_000 })
  console.log(
    `[stream] stop result drained=${result.drained} remaining=${result.remaining} inflight=${result.inflight}`,
  )
  process.exit(result.drained ? 0 : 1)
}

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})
process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled rejection:', reason)
  process.exit(1)
})
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception:', err)
  process.exit(1)
})
