const scale = 1_000_000n
function decimal(value: unknown): bigint | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const match = String(value).match(/^(\d+)(?:\.(\d{1,6}))?$/)
  return match ? BigInt(match[1]) * scale + BigInt((match[2] ?? '').padEnd(6, '0')) : null
}
function formatted(value: bigint): string {
  const fraction = String(value % scale).padStart(6, '0').replace(/0+$/, '')
  return new Intl.NumberFormat('vi-VN').format(value / scale) + (fraction ? ',' + fraction : '')
}

// Display a single shared balance, never create a separate balance for packaging.
export function stockInUnit(stock: unknown, ratio: number, unit: string, base: string): string {
  const quantity = decimal(stock)
  const conversion = decimal(ratio)
  if (quantity === null || conversion === null || conversion <= 0n) return '—'
  const count = quantity / conversion
  const remainder = quantity % conversion
  return `${new Intl.NumberFormat('vi-VN').format(count)} ${unit}${remainder ? ` + ${formatted(remainder)} ${base}` : ''}`
}
