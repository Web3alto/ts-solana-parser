export type MetricKind = 'counter' | 'gauge' | 'timing'

export interface StreamMetricEvent {
  kind: MetricKind
  name: string
  value: number
  ts: number
  tags?: Record<string, string | number> | undefined
}

export interface StreamStats {
  received: number
  deduped: number
  dropped: number
  parsedSwap: number
  notSwap: number
  unsupported: number
  parseError: number
  callbackErrors: number
  reconnects: number
  queueDepth: number
  inflightWorkers: number
  metricSinkErrors: number
}
