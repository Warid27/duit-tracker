import { describe, expect, it } from 'vitest'
import { nextOccurrence, nextOnOrAfter, occurrencesBetween } from '@shared/domain/recurrence'

describe('nextOnOrAfter — daily (BR-11)', () => {
  const anchor = { frequency: 'daily' as const, startDate: '2026-09-01' }

  it('runs every day after the start date', () => {
    expect(nextOnOrAfter(anchor, '2026-09-10')).toBe('2026-09-10')
    expect(nextOnOrAfter(anchor, '2026-08-25')).toBe('2026-09-01') // never before start
  })

  it('respects endDate', () => {
    expect(nextOnOrAfter({ ...anchor }, '2026-09-10', '2026-09-09')).toBeNull()
    expect(nextOnOrAfter(anchor, '2026-09-10', '2026-09-10')).toBe('2026-09-10')
  })
})

describe('nextOccurrence — strictly after fromDate', () => {
  it('advances one day for daily rules', () => {
    expect(nextOccurrence({ frequency: 'daily', startDate: '2026-09-01' }, '2026-09-10')).toBe('2026-09-11')
  })

  it('returns null past endDate', () => {
    expect(
      nextOccurrence({ frequency: 'daily', startDate: '2026-09-01' }, '2026-09-10', '2026-09-10'),
    ).toBeNull()
  })

  it('rejects invalid dates', () => {
    expect(nextOccurrence({ frequency: 'monthly', startDate: 'bad' }, '2026-09-10')).toBeNull()
    expect(nextOccurrence({ frequency: 'monthly', startDate: '2026-09-10' }, 'nope')).toBeNull()
  })
})

describe('weekly', () => {
  it('anchors on the start weekday and steps in whole weeks', () => {
    // 2026-09-01 is a Tuesday.
    const anchor = { frequency: 'weekly' as const, startDate: '2026-09-01' }
    expect(nextOnOrAfter(anchor, '2026-09-02')).toBe('2026-09-08')
    expect(nextOnOrAfter(anchor, '2026-09-08')).toBe('2026-09-08') // inclusive
    expect(nextOccurrence(anchor, '2026-09-08')).toBe('2026-09-15')
    expect(nextOnOrAfter(anchor, '2026-08-01')).toBe('2026-09-01')
  })
})

describe('monthly (BR-12 clamp, no drift)', () => {
  it('keeps the anchor day-of-month', () => {
    const anchor = { frequency: 'monthly' as const, startDate: '2026-01-15' }
    expect(nextOnOrAfter(anchor, '2026-01-16')).toBe('2026-02-15')
    expect(nextOnOrAfter(anchor, '2026-05-01')).toBe('2026-05-15')
  })

  it('clamps to short months but never drifts back afterwards', () => {
    const anchor = { frequency: 'monthly' as const, startDate: '2026-01-31' }
    expect(nextOnOrAfter(anchor, '2026-02-01')).toBe('2026-02-28')
    expect(nextOnOrAfter(anchor, '2026-03-01')).toBe('2026-03-31') // still 31, not 28
    const leap = { frequency: 'monthly' as const, startDate: '2024-01-31' }
    expect(nextOnOrAfter(leap, '2024-02-01')).toBe('2024-02-29') // leap year
  })

  it('catches up across many months without drift', () => {
    const anchor = { frequency: 'monthly' as const, startDate: '2026-01-30' }
    const runs = occurrencesBetween(anchor, '2026-01-01', '2026-06-30', null, 100)
    expect(runs).toEqual(['2026-01-30', '2026-02-28', '2026-03-30', '2026-04-30', '2026-05-30', '2026-06-30'])
  })
})

describe('yearly (Feb 29 -> Feb 28 in common years)', () => {
  it('clamps leap-day anchors', () => {
    const anchor = { frequency: 'yearly' as const, startDate: '2024-02-29' }
    expect(nextOnOrAfter(anchor, '2025-01-01')).toBe('2025-02-28')
    expect(nextOnOrAfter(anchor, '2026-03-01')).toBe('2027-02-28')
    expect(nextOnOrAfter(anchor, '2028-01-01')).toBe('2028-02-29') // leap again
  })

  it('keeps normal month/day anchors', () => {
    const anchor = { frequency: 'yearly' as const, startDate: '2026-07-17' }
    expect(nextOccurrence(anchor, '2026-07-17')).toBe('2027-07-17')
  })
})

describe('occurrencesBetween (catch-up processing)', () => {
  it('returns ascending occurrences inside the window only', () => {
    const anchor = { frequency: 'weekly' as const, startDate: '2026-09-01' }
    expect(occurrencesBetween(anchor, '2026-09-01', '2026-10-05', null, 100)).toEqual([
      '2026-09-01',
      '2026-09-08',
      '2026-09-15',
      '2026-09-22',
      '2026-09-29',
    ])
  })

  it('caps at maxIterations', () => {
    const anchor = { frequency: 'daily' as const, startDate: '2026-01-01' }
    const runs = occurrencesBetween(anchor, '2026-01-01', '2026-12-31', null, 10)
    expect(runs).toHaveLength(10)
    expect(runs[0]).toBe('2026-01-01')
  })

  it('stops at endDate even inside the window', () => {
    const anchor = { frequency: 'monthly' as const, startDate: '2026-01-15' }
    const runs = occurrencesBetween(anchor, '2026-01-01', '2026-12-31', '2026-04-30', 100)
    expect(runs).toEqual(['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15'])
  })

  it('empty when window has no occurrence', () => {
    const anchor = { frequency: 'yearly' as const, startDate: '2026-12-31' }
    expect(occurrencesBetween(anchor, '2026-01-01', '2026-06-30', null, 100)).toEqual([])
  })
})
