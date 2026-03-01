import { sleep } from './util.ts'

export interface RpcResponse<T> {
  result: T
  error?: { code: number; message: string }
}

export interface AccountInfoResult {
  value: {
    owner: string
    data: [string, string] | string
  } | null
}

export async function rpcCall<T>(
  fetcher: (input: string, init?: RequestInit) => Promise<Response>,
  rpcUrl: string,
  timeoutMs: number,
  method: string,
  params: unknown[],
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetcher(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`)
    }

    const json = (await res.json()) as RpcResponse<T>
    if (json.error) {
      throw new Error(`RPC error (${json.error.code}): ${json.error.message}`)
    }
    return json.result
  } finally {
    clearTimeout(timeout)
  }
}

export async function retryWithBackoff<T>(fn: () => Promise<T>, retries: number, retryBaseMs: number): Promise<T> {
  let attempt = 0
  let lastError: unknown = null

  while (attempt <= retries) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt >= retries) break
      const backoffMs = Math.round(retryBaseMs * 2 ** attempt * (0.8 + Math.random() * 0.4))
      await sleep(backoffMs)
    }
    attempt++
  }

  throw lastError
}
