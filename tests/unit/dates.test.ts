import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  compareDates,
  datesOfMonth,
  daysInMonth,
  formatDateInTimeZone,
  isDate,
  isLeapYear,
  lastNMonths,
  monthKeyOf,
  monthRange,
  setDateKeepingAnchor,
  shortDayName,
  shortDateLabel,
  todayIn,
  tryParseDate,
  tryParseMonth,
} from '@shared/domain/dates'

describe('tryParseDate / isDate', () => {
  it('accepts valid calendar dates', () => {
    expect(tryParseDate('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 })
    expect(isDate('2024-02-29')).toBe(true) // leap year
  })

  it('rejects malformed or impossible dates', () => {
    expect(isDate('2026-2-3')).toBe(false) // needs zero padding
    expect(isDate('2025-02-29')).toBe(false) // not a leap year
    expect(isDate('2026-13-01')).toBe(false)
    expect(isDate('2026-00-10')).toBe(false)
    expect(isDate('2026-04-31')).toBe(false)
    expect(isDate('not-a-date')).toBe(false)
  })
})

describe('leap years & month lengths', () => {
  it('follows the Gregorian rules', () => {
    expect(isLeapYear(2000)).toBe(true)
    expect(isLeapYear(1900)).toBe(false)
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2026)).toBe(false)
  })

  it('daysInMonth matches the calendar', () => {
    expect(daysInMonth(2026, 1)).toBe(31)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(() => daysInMonth(2026, 13)).toThrow(RangeError)
  })
})

describe('addDays', () => {
  it('normalizes month and year overflow', () => {
    expect(addDays({ year: 2026, month: 1, day: 31 }, 1)).toEqual({ year: 2026, month: 2, day: 1 })
    expect(addDays({ year: 2025, month: 12, day: 31 }, 1)).toEqual({ year: 2026, month: 1, day: 1 })
    expect(addDays({ year: 2026, month: 3, day: 1 }, -1)).toEqual({ year: 2026, month: 2, day: 28 })
    expect(addDays({ year: 2024, month: 2, day: 28 }, 1)).toEqual({ year: 2024, month: 2, day: 29 })
  })
})

describe('setDateKeepingAnchor (BR-12 clamp)', () => {
  it('clamps day-of-month to the target month length', () => {
    expect(setDateKeepingAnchor(31, 2026, 2)).toEqual({ year: 2026, month: 2, day: 28 })
    expect(setDateKeepingAnchor(31, 2024, 2)).toEqual({ year: 2024, month: 2, day: 29 })
    expect(setDateKeepingAnchor(15, 2026, 4)).toEqual({ year: 2026, month: 4, day: 15 })
  })
})

describe('month keys', () => {
  it('monthKeyOf / monthRange / tryParseMonth', () => {
    expect(monthKeyOf('2026-09-30')).toBe('2026-09')
    expect(monthRange('2026-02')).toEqual({ first: '2026-02-01', last: '2026-02-28' })
    expect(monthRange('2024-02')).toEqual({ first: '2024-02-01', last: '2024-02-29' })
    expect(tryParseMonth('2026-13')).toBeNull()
    expect(() => monthRange('2026/09')).toThrow(RangeError)
  })

  it('addMonths wraps across years, including negatives', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-03', -14)).toBe('2025-01')
  })

  it('lastNMonths returns ascending keys ending at endKey', () => {
    expect(lastNMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
    expect(lastNMonths('2026-09', 1)).toEqual(['2026-09'])
  })

  it('datesOfMonth enumerates every day', () => {
    const feb = datesOfMonth('2026-02')
    expect(feb).toHaveLength(28)
    expect(feb[0]).toBe('2026-02-01')
    expect(feb.at(-1)).toBe('2026-02-28')
    expect(datesOfMonth('2024-02')).toHaveLength(29)
  })
})

describe('timezone-aware "today"', () => {
  it('uses the local calendar day of the given IANA timezone', () => {
    // 2026-09-30T18:00:00Z -> already Oct 1 in WIB (UTC+7), still Sep 30 in NY.
    const instant = new Date('2026-09-30T18:00:00Z')
    expect(todayIn('Asia/Jakarta', instant)).toBe('2026-10-01')
    expect(formatDateInTimeZone(instant, 'America/New_York')).toBe('2026-09-30')
  })
})

describe('Indonesian labels', () => {
  it('shortDayName maps weekdays', () => {
    expect(shortDayName('2026-09-30')).toBe('Rab') // Wednesday
    expect(shortDayName('2026-10-03')).toBe('Sab') // Saturday
    expect(shortDayName('bogus')).toBe('')
  })

  it('shortDateLabel renders day + month', () => {
    expect(shortDateLabel('2026-09-30')).toBe('30 Sep')
    expect(shortDateLabel('2026-05-01')).toBe('1 Mei')
  })

  it('compareDates orders ISO strings lexicographically', () => {
    expect(compareDates('2026-01-02', '2026-01-10')).toBe(-1)
    expect(compareDates('2026-02-01', '2026-02-01')).toBe(0)
    expect(compareDates('2026-12-31', '2026-12-30')).toBe(1)
  })
})
