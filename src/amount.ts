export function formatTokenAmountDecimal(raw: bigint, decimals: number): string {
  if (decimals < 0) {
    throw new Error(`Invalid decimals: ${decimals}`)
  }

  const sign = raw < 0n ? '-' : ''
  const abs = raw < 0n ? -raw : raw
  const digits = abs.toString()

  if (decimals === 0) {
    return sign + digits
  }

  const padded = digits.padStart(decimals + 1, '0')
  const whole = padded.slice(0, -decimals)
  const fraction = padded.slice(-decimals).replace(/0+$/, '')

  if (fraction.length === 0) {
    return sign + whole
  }

  return `${sign}${whole}.${fraction}`
}

export function toApproxTokenAmountNumber(raw: bigint, decimals: number): number | undefined {
  const scale = 10 ** decimals
  if (!Number.isFinite(scale)) return undefined

  const out = Number(raw) / scale
  return Number.isFinite(out) ? out : undefined
}
