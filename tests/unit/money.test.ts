import { describe, expect, it } from 'vitest'
import {
  formatDigitsGrouping,
  formatRupiah,
  isValidAmount,
  parseRupiahInput,
} from '@shared/domain/money'
import { MAX_AMOUNT } from '@shared/constants'

describe('formatRupiah (BR-16)', () => {
  it('formats with thousand separators', () => {
    expect(formatRupiah(0)).toBe('Rp 0')
    expect(formatRupiah(1_250_000)).toBe('Rp 1.250.000')
    expect(formatRupiah(50_000)).toBe('Rp 50.000')
  })

  it('formats negatives as -Rp X', () => {
    expect(formatRupiah(-50_000)).toBe('-Rp 50.000')
  })

  it('rejects non-integers (money is always whole Rupiah)', () => {
    expect(() => formatRupiah(1.5)).toThrow(TypeError)
  })
})

describe('parseRupiahInput', () => {
  it('accepts common input styles', () => {
    expect(parseRupiahInput('1250000')).toBe(1_250_000)
    expect(parseRupiahInput('1.250.000')).toBe(1_250_000)
    expect(parseRupiahInput('1,250,000')).toBe(1_250_000)
    expect(parseRupiahInput('1 250 000')).toBe(1_250_000)
    expect(parseRupiahInput('-50000')).toBe(-50_000)
    expect(parseRupiahInput('0')).toBe(0)
  })

  it('rejects garbage', () => {
    expect(parseRupiahInput('')).toBeNull()
    expect(parseRupiahInput('abc')).toBeNull()
    expect(parseRupiahInput('12a00')).toBeNull()
    expect(parseRupiahInput('--5')).toBeNull()
    expect(parseRupiahInput('.')).toBeNull()
  })

  it('known limitation: `.` is stripped as a separator, so `12.3.4` parses to 1234', () => {
    // The live input formatter groups with dots; malformed groupings are not
    // rejected here on purpose. If strict grouping validation is needed,
    // tighten parseRupiahInput and update this test.
    expect(parseRupiahInput('12.3.4')).toBe(1234)
  })
})

describe('formatDigitsGrouping', () => {
  it('groups digits for live input', () => {
    expect(formatDigitsGrouping('1250000')).toBe('1.250.000')
    expect(formatDigitsGrouping('999')).toBe('999')
    expect(formatDigitsGrouping('-1000')).toBe('-1.000')
  })
})

describe('isValidAmount', () => {
  it('enforces integer bounds', () => {
    expect(isValidAmount(1)).toBe(true)
    expect(isValidAmount(MAX_AMOUNT)).toBe(true)
    expect(isValidAmount(0)).toBe(false)
    expect(isValidAmount(-1)).toBe(false)
    expect(isValidAmount(MAX_AMOUNT + 1)).toBe(false)
    expect(isValidAmount(1.5)).toBe(false)
    expect(isValidAmount(Number.NaN)).toBe(false)
  })
})
