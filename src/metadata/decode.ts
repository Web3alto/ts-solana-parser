const textDecoder = new TextDecoder()

/** Read a 4-byte LE length-prefixed UTF-8 string, trimming trailing null bytes. */
export function readLengthPrefixedString(
  data: Uint8Array,
  offset: number,
  maxLen: number,
): { value: string; bytesRead: number } | null {
  if (offset + 4 > data.byteLength) return null
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const len = view.getUint32(offset, true)
  if (len > maxLen || offset + 4 + len > data.byteLength) return null
  const raw = data.subarray(offset + 4, offset + 4 + len)
  const str = textDecoder.decode(raw).replace(/\0+$/g, '')
  return { value: str, bytesRead: 4 + len }
}
