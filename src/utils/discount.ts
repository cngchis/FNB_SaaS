export type DiscountMode = 'percent' | 'vnd'
export function calculateDiscount(subtotal: number, input: string, mode: DiscountMode, paidBefore = 0): number {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0 || !Number.isSafeInteger(paidBefore) || paidBefore < 0) throw new Error('Tổng tiền chưa hợp lệ.')
  const value = input.trim().replace(',', '.')
  let amount: bigint
  if (mode === 'percent') {
    if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Nhập phần trăm từ 0 đến 100, tối đa 2 số thập phân.')
    const [whole, fraction = ''] = value.split('.')
    const basisPoints = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
    if (basisPoints > 10000n) throw new Error('Phần trăm giảm giá không được vượt quá 100%.')
    amount = (BigInt(subtotal) * basisPoints + 5000n) / 10000n
  } else {
    if (!/^\d+$/.test(value)) throw new Error('Số tiền giảm giá phải là số nguyên không âm.')
    amount = BigInt(value)
  }
  if (amount > BigInt(subtotal)) throw new Error('Giảm giá không được vượt quá tạm tính.')
  if (amount > BigInt(Math.max(0, subtotal-paidBefore))) throw new Error('Số phải trả không được thấp hơn tiền đã thanh toán.')
  return Number(amount)
}
