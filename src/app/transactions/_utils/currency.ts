import type { AmountSign } from '../_types'

const eurFmt = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
})

export function formatEur(cents: number): string {
  return eurFmt.format(cents / 100)
}

export function toCents(amountStr: string, sign: AmountSign): number | null {
  const parsed = parseFloat(amountStr)
  if (!isFinite(parsed) || parsed <= 0) return null
  const cents = Math.round(parsed * 100)
  return sign === 'expense' ? -cents : cents
}

export function centsToForm(cents: number): { amountStr: string; sign: AmountSign } {
  return {
    amountStr: (Math.abs(cents) / 100).toFixed(2),
    sign: cents < 0 ? 'expense' : 'income',
  }
}
