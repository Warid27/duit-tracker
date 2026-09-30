import { MAX_AMOUNT, MIN_AMOUNT } from '@shared/constants'

/** All money values are integer Rupiah (no decimals, no floats). */
export type Money = number

const idRupiahFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

/**
 * Format integer Rupiah for display. BR-16: `Rp 1.250.000`, negative `-Rp 50.000`.
 */
export function formatRupiah(amount: number): string {
  if (!Number.isInteger(amount)) {
    throw new TypeError(`Money must be an integer, got ${amount}`)
  }
  if (amount < 0) return `-Rp ${idRupiahFormatter.format(Math.abs(amount))}`
  return `Rp ${idRupiahFormatter.format(amount)}`
}

/** Compact form for tight spaces, e.g. `Rp 4.250K` / `Rp 3,1jt`. */
export function formatRupiahCompact(amount: number): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1_000_000) {
    const jt = abs / 1_000_000
    const str = jt >= 100 ? Math.round(jt).toString() : jt.toFixed(1).replace('.', ',')
    return `${sign}Rp ${str.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}jt`.replace('Rp .', 'Rp ')
  }
  if (abs >= 10_000) {
    return `${sign}Rp ${Math.round(abs / 1000)}.K`
  }
  return formatRupiah(amount)
}

/** Parse user input like `1.250.000` or `1,250,000` or `1250000` into integer Rupiah. */
export function parseRupiahInput(raw: string): number | null {
  const cleaned = raw.replace(/[\s._]/g, '').replace(/,/g, '')
  // After removing separators only digits remain (with optional leading -).
  if (!/^-?\d+$/.test(cleaned)) return null
  const n = Number.parseInt(cleaned, 10)
  if (!Number.isSafeInteger(n)) return null
  return n
}

/** Group digits with thousand separators for live input formatting: `1250000` -> `1.250.000`. */
export function formatDigitsGrouping(digits: string): string {
  const negative = digits.startsWith('-')
  const body = negative ? digits.slice(1) : digits
  const grouped = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return (negative ? '-' : '') + grouped
}

export function isValidAmount(amount: number): boolean {
  return Number.isInteger(amount) && amount >= MIN_AMOUNT && amount <= MAX_AMOUNT
}
