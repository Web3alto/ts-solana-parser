import type { LamportsInput } from './types.ts'

const UNSIGNED_INTEGER = /^(0|[1-9]\d*)$/

export function parseLamports(value: LamportsInput, field: string): bigint {
  if (typeof value === 'bigint') {
    if (value < 0n) throw new Error(`${field} must be non-negative`)
    return value
  }

  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer`)
    if (!Number.isSafeInteger(value)) throw new Error(`${field} exceeds Number.MAX_SAFE_INTEGER`)
    return BigInt(value)
  }

  if (!UNSIGNED_INTEGER.test(value)) throw new Error(`${field} must be a base-10 unsigned integer string`)
  return BigInt(value)
}

export function parseLamportsArray(values: readonly LamportsInput[], field: string): bigint[] {
  return values.map((value, index) => parseLamports(value, `${field}[${index}]`))
}
