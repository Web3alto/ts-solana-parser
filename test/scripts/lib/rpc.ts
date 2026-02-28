import type { TransactionNotification } from '../../../src/types.ts'

const rpcUrl = process.env.RPC_URL!

if (!rpcUrl) {
  throw new Error('RPC_URL env var is required')
}

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = (await res.json()) as any
  if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`)
  return json.result
}

export async function getSignaturesForAddress(programId: string, limit: number): Promise<string[]> {
  const result = (await rpcCall('getSignaturesForAddress', [programId, { limit }])) as Array<{
    signature: string
    err: unknown | null
  }>

  return result.filter((r) => r.err === null).map((r) => r.signature)
}

export async function getSignaturesForAddressPaginated(
  address: string,
  opts: { batchSize?: number | undefined; before?: string | undefined } = {},
): Promise<{ signatures: string[]; lastSignature: string | undefined }> {
  const limit = opts.batchSize ?? 100
  const params: Record<string, unknown> = { limit }
  if (opts.before) params.before = opts.before

  const result = (await rpcCall('getSignaturesForAddress', [address, params])) as Array<{
    signature: string
    err: unknown | null
  }>

  const successful = result.filter((r) => r.err === null)
  return {
    signatures: successful.map((r) => r.signature),
    lastSignature: result.length > 0 ? result[result.length - 1]!.signature : undefined,
  }
}

export async function getTransaction(signature: string): Promise<TransactionNotification> {
  const result = (await rpcCall('getTransaction', [
    signature,
    { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
  ])) as any

  if (!result) throw new Error(`Transaction not found: ${signature}`)

  return {
    signature,
    slot: result.slot,
    blockTime: result.blockTime ?? null,
    transaction: { meta: result.meta, transaction: result.transaction },
  }
}
