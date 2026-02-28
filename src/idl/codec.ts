const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BASE58_MAP = new Uint8Array(128)
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP[BASE58_ALPHABET.charCodeAt(i)] = i
}

export function decodeBase58(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0)

  let zeros = 0
  while (zeros < str.length && str[zeros] === '1') zeros++

  let num = 0n
  for (let i = zeros; i < str.length; i++) {
    num = num * 58n + BigInt(BASE58_MAP[str.charCodeAt(i)]!)
  }

  if (num === 0n) return new Uint8Array(zeros)

  // Pre-calculate byte count to avoid unshift
  let tmp = num
  let byteCount = 0
  while (tmp > 0n) {
    byteCount++
    tmp >>= 8n
  }

  const result = new Uint8Array(zeros + byteCount)
  for (let i = result.length - 1; num > 0n; i--) {
    result[i] = Number(num & 0xffn)
    num >>= 8n
  }

  return result
}

export function readU64LE(data: Uint8Array, offset: number): bigint {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  return view.getBigUint64(offset, true)
}

export function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return ''

  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++

  let num = 0n
  for (let i = zeros; i < bytes.length; i++) {
    num = num * 256n + BigInt(bytes[i]!)
  }

  const chars: string[] = []
  while (num > 0n) {
    chars.push(BASE58_ALPHABET[Number(num % 58n)]!)
    num /= 58n
  }
  chars.reverse()

  return '1'.repeat(zeros) + chars.join('')
}

export function decodeBase64(str: string): Uint8Array {
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function readCompactU16(
  data: Uint8Array,
  offset: number,
): { value: number; size: number } {
  let value = 0
  let size = 0
  for (;;) {
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
