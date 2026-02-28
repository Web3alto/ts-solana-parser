import { ALL_PROGRAM_IDS } from './constants.ts'
import { Deque } from './deque.ts'
import type { StreamMetricEvent, StreamStats } from './metrics.ts'
import { parseTransactionDetailed } from './parser.ts'
import type { ParsedSwap, ParseOutcome, ParserOptions, TransactionNotification, WsNotification } from './types.ts'

export interface StreamBackoffOptions {
  minMs: number
  maxMs: number
  factor: number
  jitterRatio: number
}

export interface StreamQueueOptions {
  maxSize: number
  dedupeSize: number
  workerConcurrency: number
  yieldEveryN: number
  dropPolicy: 'oldest' | 'newest'
}

export interface StreamHeartbeatOptions {
  intervalMs: number
  idleTimeoutMs: number
  strategy: 'jsonrpc-ping' | 'activity-watchdog'
}

export interface StopResult {
  drained: boolean
  remaining: number
  inflight: number
}

export interface StartStreamOptions {
  onNotification?: ((notification: TransactionNotification, outcome: ParseOutcome) => void | Promise<void>) | undefined
  onSwap?: ((swap: ParsedSwap, notification: TransactionNotification) => void | Promise<void>) | undefined
  onMetrics?: ((event: StreamMetricEvent) => void) | undefined
  parserOptions?: ParserOptions | undefined
  backoff?: Partial<StreamBackoffOptions> | undefined
  queue?: Partial<StreamQueueOptions> | undefined
  heartbeat?: Partial<StreamHeartbeatOptions> | undefined
  encoding?: string | undefined
  wsUrl?: string | undefined
  maxReconnectAttempts?: number | undefined
}

export interface StreamHandle {
  stop(opts?: { drain?: boolean; timeoutMs?: number }): Promise<StopResult>
  getStats(): StreamStats
}

interface QueueItem {
  notification: TransactionNotification
  enqueuedAt: number
}

const DEFAULT_BACKOFF: StreamBackoffOptions = {
  minMs: 500,
  maxMs: 30_000,
  factor: 2,
  jitterRatio: 0.2,
}

const DEFAULT_QUEUE: StreamQueueOptions = {
  maxSize: 2000,
  dedupeSize: 10_000,
  workerConcurrency: 1,
  yieldEveryN: 50,
  dropPolicy: 'oldest',
}

const DEFAULT_HEARTBEAT: StreamHeartbeatOptions = {
  intervalMs: 30_000,
  idleTimeoutMs: 90_000,
  strategy: 'jsonrpc-ping',
}

interface NumberConstraint {
  min: number
  max: number
  integer?: boolean | undefined
}

function sanitizeNumber(value: unknown, fallback: number, constraint: NumberConstraint): number {
  let n = Number(value)
  if (!Number.isFinite(n)) n = fallback
  if (constraint.integer) n = Math.floor(n)
  if (n < constraint.min) n = constraint.min
  if (n > constraint.max) n = constraint.max
  return n
}

function mergeOptions<T extends object>(defaults: T, partial: Partial<T> | undefined): T {
  return { ...defaults, ...(partial ?? {}) }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isTransactionNotification(value: unknown): value is TransactionNotification {
  if (!isObject(value)) return false
  if (typeof value.signature !== 'string') return false
  if (typeof value.slot !== 'number') return false
  if (!isObject(value.transaction)) return false
  return true
}

function extractAddressLookupTableAccounts(notification: TransactionNotification): string[] {
  const tx = notification.transaction.transaction
  if (Array.isArray(tx)) return []
  const lookups = tx.message.addressTableLookups ?? []
  if (lookups.length === 0) return []
  return lookups.map((lookup) => lookup.accountKey)
}

export function validateQueueConfig(config: StreamQueueOptions): StreamQueueOptions {
  return {
    maxSize: sanitizeNumber(config.maxSize, DEFAULT_QUEUE.maxSize, {
      min: 10,
      max: 500_000,
      integer: true,
    }),
    dedupeSize: sanitizeNumber(config.dedupeSize, DEFAULT_QUEUE.dedupeSize, {
      min: 100,
      max: 2_000_000,
      integer: true,
    }),
    workerConcurrency: sanitizeNumber(config.workerConcurrency, DEFAULT_QUEUE.workerConcurrency, {
      min: 1,
      max: 1024,
      integer: true,
    }),
    yieldEveryN: sanitizeNumber(config.yieldEveryN, DEFAULT_QUEUE.yieldEveryN, {
      min: 1,
      max: 100_000,
      integer: true,
    }),
    dropPolicy: config.dropPolicy === 'newest' ? 'newest' : 'oldest',
  }
}

export function validateBackoffConfig(config: StreamBackoffOptions): StreamBackoffOptions {
  const minMs = sanitizeNumber(config.minMs, DEFAULT_BACKOFF.minMs, {
    min: 50,
    max: 60_000,
    integer: true,
  })
  const maxMs = sanitizeNumber(config.maxMs, DEFAULT_BACKOFF.maxMs, {
    min: minMs,
    max: 10 * 60_000,
    integer: true,
  })
  const factor = sanitizeNumber(config.factor, DEFAULT_BACKOFF.factor, {
    min: 1.1,
    max: 5,
  })
  const jitterRatio = sanitizeNumber(config.jitterRatio, DEFAULT_BACKOFF.jitterRatio, { min: 0, max: 0.95 })
  return { minMs, maxMs, factor, jitterRatio }
}

export function validateHeartbeatConfig(config: StreamHeartbeatOptions): StreamHeartbeatOptions {
  const intervalMs = sanitizeNumber(config.intervalMs, DEFAULT_HEARTBEAT.intervalMs, {
    min: 1_000,
    max: 10 * 60_000,
    integer: true,
  })
  const idleTimeoutMs = sanitizeNumber(config.idleTimeoutMs, DEFAULT_HEARTBEAT.idleTimeoutMs, {
    min: intervalMs,
    max: 60 * 60_000,
    integer: true,
  })
  const strategy = config.strategy === 'activity-watchdog' ? 'activity-watchdog' : 'jsonrpc-ping'
  return { intervalMs, idleTimeoutMs, strategy }
}

export function getWsUrl(explicitWsUrl?: string): string {
  if (explicitWsUrl) return explicitWsUrl
  const wsOverride = process.env.WS_URL
  if (wsOverride) return wsOverride

  const rpcUrl = process.env.RPC_URL
  if (!rpcUrl) {
    throw new Error('RPC_URL env variable is required')
  }

  const url = new URL(rpcUrl)
  const apiKey = url.searchParams.get('api-key')
  if (!apiKey) {
    throw new Error('RPC_URL is missing a required query parameter')
  }

  return `wss://atlas-mainnet.helius-rpc.com?api-key=${apiKey}`
}

export function redactWsUrl(wsUrl: string): string {
  try {
    const u = new URL(wsUrl)
    if (u.searchParams.has('api-key')) {
      u.searchParams.set('api-key', '***')
    }
    return u.toString()
  } catch {
    return '<invalid-url>'
  }
}

export function computeBackoffDelay(
  attempt: number,
  config: StreamBackoffOptions,
  randomFn: () => number = Math.random,
): number {
  const exp = Math.min(config.maxMs, config.minMs * config.factor ** Math.max(0, attempt))
  const jitterWindow = exp * config.jitterRatio
  const jitter = (randomFn() * 2 - 1) * jitterWindow
  const withJitter = Math.round(exp + jitter)
  return Math.max(config.minMs, Math.min(config.maxMs, withJitter))
}

export function startStream(
  onNotification: (notification: TransactionNotification) => void | Promise<void>,
): StreamHandle
export function startStream(options: StartStreamOptions): StreamHandle
export function startStream(
  arg: StartStreamOptions | ((notification: TransactionNotification) => void | Promise<void>),
): StreamHandle {
  const options: StartStreamOptions =
    typeof arg === 'function'
      ? {
          onNotification: async (notification) => {
            await arg(notification)
          },
        }
      : arg

  const queueCandidate = mergeOptions(DEFAULT_QUEUE, options.queue)
  queueCandidate.maxSize = sanitizeNumber(
    options.queue?.maxSize ?? process.env.STREAM_QUEUE_LIMIT,
    queueCandidate.maxSize,
    { min: 10, max: 500_000, integer: true },
  )
  queueCandidate.dedupeSize = sanitizeNumber(
    options.queue?.dedupeSize ?? process.env.STREAM_DEDUPE_SIZE,
    queueCandidate.dedupeSize,
    { min: 100, max: 2_000_000, integer: true },
  )
  queueCandidate.workerConcurrency = sanitizeNumber(
    options.queue?.workerConcurrency ?? process.env.STREAM_WORKER_CONCURRENCY,
    queueCandidate.workerConcurrency,
    { min: 1, max: 1024, integer: true },
  )
  queueCandidate.yieldEveryN = sanitizeNumber(
    options.queue?.yieldEveryN ?? process.env.STREAM_YIELD_EVERY,
    queueCandidate.yieldEveryN,
    { min: 1, max: 100_000, integer: true },
  )

  const queueConfig = validateQueueConfig(queueCandidate)
  const backoff = validateBackoffConfig(mergeOptions(DEFAULT_BACKOFF, options.backoff))
  const heartbeat = validateHeartbeatConfig(mergeOptions(DEFAULT_HEARTBEAT, options.heartbeat))

  const maxReconnectAttempts = sanitizeNumber(options.maxReconnectAttempts, 100, { min: 1, max: 10_000, integer: true })
  const wsUrl = getWsUrl(options.wsUrl)

  const queue = new Deque<QueueItem>()
  const seen = new Set<string>()
  const seenOrder = new Deque<string>()

  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null
  let watchdogInterval: ReturnType<typeof setInterval> | null = null
  let ws: WebSocket | null = null
  let reconnectAttempt = 0
  let stopped = false
  let lastMessageAt = Date.now()
  let inflightWorkers = 0
  let metricSinkErrors = 0

  const workerPromises = new Set<Promise<void>>()

  const stats: StreamStats = {
    received: 0,
    deduped: 0,
    dropped: 0,
    parsedSwap: 0,
    notSwap: 0,
    unsupported: 0,
    parseError: 0,
    callbackErrors: 0,
    reconnects: 0,
    queueDepth: 0,
    inflightWorkers: 0,
    metricSinkErrors: 0,
  }

  function emitMetric(
    kind: StreamMetricEvent['kind'],
    name: string,
    value: number,
    tags?: StreamMetricEvent['tags'],
  ): void {
    if (!options.onMetrics) return
    try {
      options.onMetrics({ kind, name, value, tags, ts: Date.now() })
    } catch (error) {
      metricSinkErrors++
      stats.metricSinkErrors = metricSinkErrors
      if (name !== 'metrics_sink_error') {
        console.error('[stream] metrics sink failed:', error)
      }
    }
  }

  function updateQueueDepth(): void {
    stats.queueDepth = queue.size
    emitMetric('gauge', 'queue_depth', stats.queueDepth)
  }

  function updateInflightWorkers(): void {
    stats.inflightWorkers = inflightWorkers
    emitMetric('gauge', 'inflight_workers', stats.inflightWorkers)
  }

  function markSeen(key: string): void {
    seen.add(key)
    seenOrder.push(key)
    if (seenOrder.size > queueConfig.dedupeSize) {
      const oldest = seenOrder.shift()
      if (oldest) seen.delete(oldest)
    }
  }

  function clearHeartbeat(): void {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval)
      heartbeatInterval = null
    }
    if (watchdogInterval) {
      clearInterval(watchdogInterval)
      watchdogInterval = null
    }
  }

  function scheduleReconnect(closeCode: number): void {
    if (stopped) return
    if (reconnectAttempt >= maxReconnectAttempts) {
      console.error(`[stream] max reconnect attempts (${maxReconnectAttempts}) reached, stopping`)
      emitMetric('counter', 'ws_max_reconnects_reached', 1)
      stopped = true
      return
    }
    const delay = computeBackoffDelay(reconnectAttempt, backoff)
    reconnectAttempt++
    stats.reconnects++

    emitMetric('counter', 'ws_reconnects', 1, {
      closeCode,
      attempt: reconnectAttempt,
    })
    emitMetric('timing', 'reconnect_delay_ms', delay, {
      attempt: reconnectAttempt,
    })

    console.log(`[stream] disconnected (code=${closeCode}), reconnecting in ${delay}ms...`)
    reconnectTimer = setTimeout(connect, delay)
  }

  function enqueue(notification: TransactionNotification): void {
    if (stopped) return

    stats.received++
    emitMetric('counter', 'tx_received', 1)

    const key = `${notification.signature}:${notification.slot}`
    if (seen.has(key)) {
      stats.deduped++
      emitMetric('counter', 'tx_deduped', 1)
      return
    }
    markSeen(key)

    if (queue.size >= queueConfig.maxSize) {
      stats.dropped++
      emitMetric('counter', 'tx_dropped', 1, {
        policy: queueConfig.dropPolicy,
      })
      if (queueConfig.dropPolicy === 'oldest') {
        queue.shift()
      } else {
        updateQueueDepth()
        return
      }
    }

    queue.push({ notification, enqueuedAt: Date.now() })
    updateQueueDepth()
    scheduleWorkers()
  }

  async function processItem(item: QueueItem): Promise<void> {
    if (options.parserOptions?.warmAddressLookupTables) {
      const tableAccounts = extractAddressLookupTableAccounts(item.notification)
      if (tableAccounts.length > 0) {
        try {
          await options.parserOptions.warmAddressLookupTables(tableAccounts)
        } catch (error) {
          options.parserOptions.onResolverError?.({ error })
          emitMetric('counter', 'resolver_warm_errors', 1)
        }
      }
    }

    const parseStart = performance.now()
    const outcome = parseTransactionDetailed(item.notification, options.parserOptions)
    emitMetric('timing', 'parse_ms', performance.now() - parseStart)

    if (outcome.kind === 'swap') {
      stats.parsedSwap++
      emitMetric('counter', 'tx_parsed_swap', 1)
    } else if (outcome.kind === 'not_swap') {
      stats.notSwap++
      emitMetric('counter', 'tx_not_swap', 1, {
        code: outcome.code ?? 'unknown',
      })
    } else if (outcome.kind === 'unsupported') {
      stats.unsupported++
      emitMetric('counter', 'tx_unsupported', 1, {
        code: outcome.code ?? 'unknown',
      })
    } else {
      stats.parseError++
      emitMetric('counter', 'tx_parse_error', 1, {
        code: outcome.code ?? 'unknown',
      })
    }

    const callbackStart = performance.now()
    try {
      if (outcome.swap && options.onSwap) {
        await options.onSwap(outcome.swap, item.notification)
      }
      if (options.onNotification) {
        await options.onNotification(item.notification, outcome)
      }
    } catch (err) {
      stats.callbackErrors++
      emitMetric('counter', 'callback_errors', 1)
      console.error('[stream] callback failed:', err)
    }

    emitMetric('timing', 'callback_ms', performance.now() - callbackStart)
    emitMetric('timing', 'end_to_end_ms', Date.now() - item.enqueuedAt)
  }

  async function runWorker(): Promise<void> {
    inflightWorkers++
    updateInflightWorkers()

    let processedSinceYield = 0
    try {
      for (;;) {
        const item = queue.shift()
        if (!item) break

        updateQueueDepth()
        await processItem(item)

        processedSinceYield++
        if (processedSinceYield % queueConfig.yieldEveryN === 0) {
          await Promise.resolve()
        }
      }
    } finally {
      inflightWorkers--
      updateInflightWorkers()
      if (!stopped && queue.size > 0) {
        scheduleWorkers()
      }
    }
  }

  function spawnWorker(): void {
    const p = runWorker().finally(() => {
      workerPromises.delete(p)
    })
    workerPromises.add(p)
  }

  function scheduleWorkers(): void {
    while (inflightWorkers < queueConfig.workerConcurrency && queue.size > 0) {
      spawnWorker()
    }
  }

  function setupHeartbeat(): void {
    clearHeartbeat()

    if (heartbeat.strategy === 'jsonrpc-ping') {
      heartbeatInterval = setInterval(() => {
        if (ws?.readyState !== WebSocket.OPEN) return
        const maybePing = (ws as unknown as { ping?: () => void }).ping
        if (typeof maybePing === 'function') {
          maybePing.call(ws)
        } else {
          ws.send(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'ping' }))
        }
      }, heartbeat.intervalMs)
    }

    watchdogInterval = setInterval(
      () => {
        if (stopped) return
        if (!ws || ws.readyState !== WebSocket.OPEN) return
        const idle = Date.now() - lastMessageAt
        if (idle > heartbeat.idleTimeoutMs) {
          emitMetric('counter', 'ws_idle_timeouts', 1, { idleMs: idle })
          ws.close(4000, 'idle-timeout')
        }
      },
      Math.min(heartbeat.intervalMs, heartbeat.idleTimeoutMs),
    )
  }

  function connect(): void {
    if (stopped) return
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    emitMetric('counter', 'ws_connect_attempt', 1)
    console.log('[stream] connecting...')
    ws = new WebSocket(wsUrl)

    ws.addEventListener('open', () => {
      reconnectAttempt = 0
      lastMessageAt = Date.now()
      emitMetric('counter', 'ws_open', 1)
      console.log('[stream] connected')

      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'transactionSubscribe',
        params: [
          {
            accountInclude: ALL_PROGRAM_IDS,
            failed: false,
          },
          {
            commitment: 'confirmed',
            encoding: options.encoding ?? process.env.STREAM_ENCODING ?? 'jsonParsed',
            transactionDetails: 'full',
            maxSupportedTransactionVersion: 0,
          },
        ],
      }
      ws?.send(JSON.stringify(request))
      setupHeartbeat()
    })

    ws.addEventListener('message', (event) => {
      lastMessageAt = Date.now()

      const raw = String(event.data)
      if (raw.length > 5 * 1024 * 1024) {
        emitMetric('counter', 'ws_message_too_large', 1, { size: raw.length })
        return
      }

      let data: WsNotification
      try {
        data = JSON.parse(raw) as WsNotification
      } catch {
        emitMetric('counter', 'ws_message_parse_error', 1)
        console.error('[stream] failed to parse message')
        return
      }

      if (data.error && data.id !== undefined) {
        emitMetric('counter', 'ws_subscription_error', 1, {
          code: data.error.code,
        })
        console.error(`[stream] subscription error: ${data.error.message}`)
        return
      }

      if (data.result !== undefined && data.id !== undefined) {
        emitMetric('counter', 'ws_subscribed', 1, {
          subscriptionId: data.result,
        })
        console.log(`[stream] subscribed (id=${data.result})`)
        return
      }

      if (data.method === 'transactionNotification' && data.params?.result) {
        if (!isTransactionNotification(data.params.result)) {
          emitMetric('counter', 'ws_invalid_notification', 1)
          return
        }
        enqueue(data.params.result)
      }
    })

    ws.addEventListener('close', (event) => {
      clearHeartbeat()
      emitMetric('counter', 'ws_close', 1, {
        code: event.code,
        reason: event.reason || '',
      })
      if (stopped) return
      scheduleReconnect(event.code)
    })

    ws.addEventListener('error', (_event) => {
      emitMetric('counter', 'ws_errors', 1)
      console.error('[stream] ws error')
    })
  }

  const handle: StreamHandle = {
    async stop(opts?: { drain?: boolean; timeoutMs?: number }): Promise<StopResult> {
      if (stopped) {
        return {
          drained: queue.size === 0 && inflightWorkers === 0,
          remaining: queue.size,
          inflight: inflightWorkers,
        }
      }
      stopped = true

      const drain = opts?.drain ?? true
      const timeoutMs = sanitizeNumber(opts?.timeoutMs, 30_000, {
        min: 100,
        max: 30 * 60_000,
        integer: true,
      })

      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }

      clearHeartbeat()

      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close(1000, 'shutdown')
      }

      if (!drain) {
        queue.clear()
        updateQueueDepth()
        return { drained: true, remaining: 0, inflight: inflightWorkers }
      }

      scheduleWorkers()

      const deadline = Date.now() + timeoutMs
      while ((queue.size > 0 || workerPromises.size > 0 || inflightWorkers > 0) && Date.now() < deadline) {
        if (workerPromises.size > 0) {
          await Promise.race([Promise.race([...workerPromises]), sleep(20)])
        } else {
          await sleep(20)
        }
      }

      const drained = queue.size === 0 && workerPromises.size === 0 && inflightWorkers === 0
      const remaining = queue.size
      const inflight = inflightWorkers

      if (!drained) {
        queue.clear()
        updateQueueDepth()
      }

      return { drained, remaining, inflight }
    },
    getStats(): StreamStats {
      return {
        ...stats,
        queueDepth: queue.size,
        inflightWorkers,
        metricSinkErrors,
      }
    },
  }

  connect()
  return handle
}
