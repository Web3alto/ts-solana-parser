import { describe, expect, test } from 'bun:test'
import { Deque } from '../src/deque.ts'
import {
  computeBackoffDelay,
  getWsUrl,
  redactWsUrl,
  validateBackoffConfig,
  validateHeartbeatConfig,
  validateQueueConfig,
} from '../src/stream.ts'

describe('stream backoff', () => {
  test('applies exponential delay with bounded jitter', () => {
    const config = {
      minMs: 500,
      maxMs: 30_000,
      factor: 2,
      jitterRatio: 0.2,
    }

    const attempt0 = computeBackoffDelay(0, config, () => 0.5)
    const attempt1 = computeBackoffDelay(1, config, () => 0.5)
    const attempt6 = computeBackoffDelay(6, config, () => 0.5)
    const attempt20 = computeBackoffDelay(20, config, () => 0.5)

    expect(attempt0).toBe(500)
    expect(attempt1).toBe(1000)
    expect(attempt6).toBe(30_000)
    expect(attempt20).toBe(30_000)
  })

  test('jitter stays inside min/max bounds', () => {
    const config = {
      minMs: 500,
      maxMs: 30_000,
      factor: 2,
      jitterRatio: 0.2,
    }

    const low = computeBackoffDelay(3, config, () => 0)
    const high = computeBackoffDelay(3, config, () => 1)

    expect(low).toBeGreaterThanOrEqual(500)
    expect(high).toBeLessThanOrEqual(30_000)
    expect(low).toBeLessThan(high)
  })

  test('sanitizes invalid queue and heartbeat values', () => {
    const queue = validateQueueConfig({
      maxSize: Number.NaN,
      dedupeSize: -1,
      workerConcurrency: 0,
      yieldEveryN: Number.POSITIVE_INFINITY,
      dropPolicy: 'oldest',
    })
    expect(queue.maxSize).toBeGreaterThan(0)
    expect(queue.dedupeSize).toBeGreaterThan(0)
    expect(queue.workerConcurrency).toBe(1)
    expect(queue.yieldEveryN).toBeGreaterThan(0)

    const heartbeat = validateHeartbeatConfig({
      intervalMs: 0,
      idleTimeoutMs: 1,
      strategy: 'activity-watchdog',
    })
    expect(heartbeat.intervalMs).toBeGreaterThanOrEqual(1000)
    expect(heartbeat.idleTimeoutMs).toBeGreaterThanOrEqual(heartbeat.intervalMs)
  })

  test('sanitizes invalid backoff values', () => {
    const backoff = validateBackoffConfig({
      minMs: 0,
      maxMs: 1,
      factor: 0,
      jitterRatio: 2,
    })
    expect(backoff.minMs).toBeGreaterThanOrEqual(50)
    expect(backoff.maxMs).toBeGreaterThanOrEqual(backoff.minMs)
    expect(backoff.factor).toBeGreaterThan(1)
    expect(backoff.jitterRatio).toBeLessThanOrEqual(0.95)
  })
})

describe('Deque', () => {
  test('push/shift/size basics', () => {
    const dq = new Deque<number>()
    expect(dq.size).toBe(0)
    expect(dq.shift()).toBeUndefined()

    dq.push(1)
    dq.push(2)
    dq.push(3)
    expect(dq.size).toBe(3)

    expect(dq.shift()).toBe(1)
    expect(dq.size).toBe(2)

    expect(dq.shift()).toBe(2)
    expect(dq.shift()).toBe(3)
    expect(dq.size).toBe(0)
    expect(dq.shift()).toBeUndefined()
  })

  test('GC reference release (shift nulls out the slot)', () => {
    const dq = new Deque<{ value: number }>()
    const obj = { value: 42 }
    dq.push(obj)
    dq.push({ value: 99 })

    const shifted = dq.shift()
    expect(shifted).toBe(obj)

    // Access internal data array to verify the slot was nulled out
    const internal = (dq as unknown as { data: unknown[] }).data
    expect(internal[0]).toBeUndefined()
  })

  test('compaction triggers after >1024 shifts when head > half', () => {
    const dq = new Deque<number>()

    // Push 1500 items so after shifting 1025 the head (1025) > half of length (1500)
    for (let i = 0; i < 1500; i++) {
      dq.push(i)
    }

    // Shift 1025 items (just past the 1024 threshold)
    for (let i = 0; i < 1025; i++) {
      dq.shift()
    }

    // After compaction, internal head should be reset to 0
    const head = (dq as unknown as { head: number }).head
    expect(head).toBe(0)

    // Remaining items should still be accessible
    expect(dq.size).toBe(475)
    expect(dq.shift()).toBe(1025)
  })

  test('compaction does not trigger when head <= half', () => {
    const dq = new Deque<number>()

    // Push 4000 items, shift 1025 -- head (1025) is NOT > half of 4000
    for (let i = 0; i < 4000; i++) {
      dq.push(i)
    }

    for (let i = 0; i < 1025; i++) {
      dq.shift()
    }

    // head should still be 1025 (no compaction because 1025 * 2 < 4000)
    const head = (dq as unknown as { head: number }).head
    expect(head).toBe(1025)
    expect(dq.size).toBe(2975)
  })

  test('clear resets', () => {
    const dq = new Deque<string>()
    dq.push('a')
    dq.push('b')
    dq.push('c')
    dq.shift()
    expect(dq.size).toBe(2)

    dq.clear()
    expect(dq.size).toBe(0)
    expect(dq.shift()).toBeUndefined()

    // Internal state is reset
    const internal = dq as unknown as { data: unknown[]; head: number }
    expect(internal.data.length).toBe(0)
    expect(internal.head).toBe(0)

    // Can still be used after clear
    dq.push('x')
    expect(dq.size).toBe(1)
    expect(dq.shift()).toBe('x')
  })
})

describe('getWsUrl', () => {
  test('returns explicitWsUrl when provided', () => {
    const url = getWsUrl('wss://my-custom-ws.example.com')
    expect(url).toBe('wss://my-custom-ws.example.com')
  })

  test('throws when RPC_URL is missing', () => {
    const savedRpc = process.env.RPC_URL
    const savedWs = process.env.WS_URL
    delete process.env.RPC_URL
    delete process.env.WS_URL

    try {
      expect(() => getWsUrl()).toThrow('RPC_URL env variable is required')
    } finally {
      if (savedRpc !== undefined) process.env.RPC_URL = savedRpc
      if (savedWs !== undefined) process.env.WS_URL = savedWs
    }
  })

  test('returns WS_URL override when set', () => {
    const savedWs = process.env.WS_URL
    process.env.WS_URL = 'wss://override.example.com'

    try {
      const url = getWsUrl()
      expect(url).toBe('wss://override.example.com')
    } finally {
      if (savedWs !== undefined) {
        process.env.WS_URL = savedWs
      } else {
        delete process.env.WS_URL
      }
    }
  })
})

describe('redactWsUrl', () => {
  test('redacts api-key from valid URLs', () => {
    const redacted = redactWsUrl('wss://atlas-mainnet.helius-rpc.com?api-key=secret-key-123')
    expect(redacted).toContain('api-key=***')
    expect(redacted).not.toContain('secret-key-123')
    expect(redacted).toContain('wss://atlas-mainnet.helius-rpc.com')
  })

  test('returns valid URL unchanged when no api-key param', () => {
    const url = 'wss://example.com/ws?foo=bar'
    const redacted = redactWsUrl(url)
    expect(redacted).toContain('foo=bar')
    expect(redacted).not.toContain('***')
  })

  test("returns '<invalid-url>' for invalid URLs", () => {
    expect(redactWsUrl('not a url at all')).toBe('<invalid-url>')
    expect(redactWsUrl('')).toBe('<invalid-url>')
  })
})
