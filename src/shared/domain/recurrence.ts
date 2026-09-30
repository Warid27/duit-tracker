// Recurrence math (BR-11..BR-13). Pure & deterministic.
import {
  addDays,
  daysInMonth,
  setDateKeepingAnchor,
  toDateString,
  tryParseDate,
  type DateParts,
} from './dates'

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export type RecurringAnchor = {
  frequency: Frequency
  /** `YYYY-MM-DD` — also the anchor for day-of-month / weekday / day-of-year. */
  startDate: string
}

/**
 * Next occurrence strictly after `fromDate`, or null if it would pass `endDate`.
 * Monthly/yearly clamp to the last day of short months (BR-12):
 * anchor day is taken from `startDate`, never from the previous run, so no drift.
 */
export function nextOccurrence(
  anchor: RecurringAnchor,
  fromDate: string,
  endDate?: string | null,
): string | null {
  const n = nextOnOrAfter(anchor, addDay(fromDate, 1), endDate)
  return n
}

/** First occurrence on or after `fromDate` (inclusive), clamped by endDate. */
export function nextOnOrAfter(
  anchor: RecurringAnchor,
  fromDate: string,
  endDate?: string | null,
): string | null {
  const start = tryParseDate(anchor.startDate)
  const from = tryParseDate(fromDate)
  if (!start || !from) return null

  let candidate: DateParts
  switch (anchor.frequency) {
    case 'daily':
      // Daily rules simply run every day, but never before the start date.
      candidate = compareParts(from, start) < 0 ? start : from
      break
    case 'weekly':
      candidate = alignWeekly(start, from)
      break
    case 'monthly':
      candidate = alignMonthly(start, from)
      break
    case 'yearly':
      candidate = alignYearly(start, from)
      break
  }
  if (!candidate) return null
  const s = toDateString(candidate)
  if (endDate && s > endDate) return null
  return s
}

function addDay(date: string, days: number): string {
  const p = tryParseDate(date)
  if (!p) return date
  return toDateString(addDays(p, days))
}

function alignWeekly(start: DateParts, from: DateParts): DateParts {
  // Anchor on start weekday; step in whole weeks from start.
  const startMs = Date.UTC(start.year, start.month - 1, start.day)
  const fromMs = Date.UTC(from.year, from.month - 1, from.day)
  if (fromMs <= startMs) return start
  const diffDays = Math.round((fromMs - startMs) / 86_400_000)
  const weeks = Math.ceil(diffDays / 7)
  const d = new Date(startMs + weeks * 7 * 86_400_000)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

function alignMonthly(start: DateParts, from: DateParts): DateParts {
  // BR-12: keep anchor day, clamp to month length.
  const anchorDay = start.day
  const fromIndex = from.year * 12 + (from.month - 1)
  const startIndex = start.year * 12 + (start.month - 1)
  let target = fromIndex < startIndex ? startIndex : fromIndex
  let candidate = setDateKeepingAnchor(anchorDay, Math.floor(target / 12), (target % 12) + 1)
  if (compareParts(candidate, from) < 0) {
    target += 1
    candidate = setDateKeepingAnchor(anchorDay, Math.floor(target / 12), (target % 12) + 1)
  }
  return candidate
}

function alignYearly(start: DateParts, from: DateParts): DateParts {
  // Feb 29 -> Feb 28 in non-leap years (BR-12).
  let candidate = clampYearly(start, from.year)
  if (compareParts(candidate, from) < 0) candidate = clampYearly(start, from.year + 1)
  return candidate
}

function clampYearly(start: DateParts, year: number): DateParts {
  const day = Math.min(start.day, daysInMonth(year, start.month))
  return { year, month: start.month, day }
}

function compareParts(a: DateParts, b: DateParts): number {
  const sa = toDateString(a)
  const sb = toDateString(b)
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

/**
 * Catch-up: all occurrences in [fromInclusive, upToInclusive], capped at `maxIterations`.
 * Returns dates ascending. Used by recurring processing (BR-11).
 */
export function occurrencesBetween(
  anchor: RecurringAnchor,
  fromInclusive: string,
  upToInclusive: string,
  endDate: string | null | undefined,
  maxIterations: number,
): string[] {
  const out: string[] = []
  let cur = nextOnOrAfter(anchor, fromInclusive, endDate)
  while (cur !== null && cur <= upToInclusive && out.length < maxIterations) {
    out.push(cur)
    const nextFrom = addDay(cur, 1)
    // For monthly/yearly anchors we must re-anchor from startDate each time;
    // nextOnOrAfter handles that by comparing against anchor start.
    cur = nextOnOrAfter(anchor, nextFrom, endDate)
  }
  return out
}
