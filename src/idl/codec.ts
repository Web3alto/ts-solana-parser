import { DecodeError } from '../errors.ts'

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BASE58_MAP = new Uint8Array(128)
BASE58_MAP.fill(0xff)
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP[BASE58_ALPHABET.charCodeAt(i)] = i
}

export function decodeBase58(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0)

  let zeros = 0
  while (zeros < str.length && str[zeros] === '1') zeros++

  // Byte-array multiply-and-add in base-256 (avoids BigInt allocation)
  // log(58)/log(256) ≈ 0.7324; use str.length as safe upper bound
  const buf = new Uint8Array(str.length)
  let length = 0

  for (let i = zeros; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code >= 128) {
      throw new DecodeError(`Invalid base58 character at index ${i}`)
    }
    const value = BASE58_MAP[code]
    if (value === undefined || value === 0xff) {
      const char = str[i]
      throw new DecodeError(`Invalid base58 character "${char ?? '?'}" at index ${i}`)
    }

    let carry = value
    for (let j = 0; j < length; j++) {
      carry += buf[j]! * 58
      buf[j] = carry & 0xff
      carry >>>= 8
    }
    while (carry > 0) {
      buf[length++] = carry & 0xff
      carry >>>= 8
    }
  }

  const result = new Uint8Array(zeros + length)
  for (let i = 0; i < length; i++) {
    result[result.length - 1 - i] = buf[i]!
  }

  return result
}

export function readU64LE(data: Uint8Array, offset: number): bigint {
  if (offset + 8 > data.byteLength) {
    throw new DecodeError(`readU64LE: offset ${offset} exceeds buffer length ${data.byteLength}`)
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  return view.getBigUint64(offset, true)
}

export function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return ''

  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++

  // Byte-array divide-and-mod in base-58 (avoids BigInt allocation)
  const size = (((bytes.length - zeros) * 138) / 100 + 1) | 0 // log(256)/log(58) ≈ 1.366
  const buf = new Uint8Array(size)
  let length = 0

  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i]!
    for (let j = 0; j < length; j++) {
      carry += buf[j]! << 8
      buf[j] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      buf[length++] = carry % 58
      carry = (carry / 58) | 0
    }
  }

  let out = '1'.repeat(zeros)
  for (let i = length - 1; i >= 0; i--) {
    out += BASE58_ALPHABET[buf[i]!]
  }
  return out
}

export function decodeBase64(str: string): Uint8Array {
  try {
    const buf = Buffer.from(str, 'base64')
    if (buf.length === 0 && str.length > 0) throw new Error()
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  } catch {
    throw new DecodeError('Invalid base64 payload')
  }
}

export function readCompactU16(data: Uint8Array, offset: number): { value: number; size: number } {
  let value = 0
  let size = 0
  for (;;) {
    if (offset + size >= data.length) {
      throw new DecodeError('Unexpected end of data while reading compact-u16')
    }
    if (size > 2) {
      throw new DecodeError('Invalid compact-u16 length')
    }
    const byte = data[offset + size]!
    value |= (byte & 0x7f) << (size * 7)
    size++
    if ((byte & 0x80) === 0) break
  }
  return { value, size }
}

export function matchDiscriminator(data: Uint8Array, expected: readonly number[]): boolean {
  if (data.length < 8) return false
  for (let i = 0; i < 8; i++) {
    if (data[i] !== expected[i]) return false
  }
  return true
}
