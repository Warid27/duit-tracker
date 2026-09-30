// Pure date helpers. Transaction dates are local calendar days in APP_TIMEZONE,
// never UTC timestamps, so monthly reports don't shift across timezones.

export type DateParts = { year: number; month: number; day: number }

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH_RE = /^(\d{4})-(\d{2})$/

export function tryParseDate(s: string): DateParts | null {
  const m = DATE_RE.exec(s)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

export function isDate(s: string): boolean {
  return tryParseDate(s) !== null
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  // month: 1-12
  const table = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const d = table[month - 1]
  if (d === undefined) throw new RangeError(`Invalid month: ${month}`)
  return d
}

export function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

export function toDateString(p: DateParts): string {
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`
}

export function compareDates(a: string, b: string): number {
  // ISO-like YYYY-MM-DD strings compare lexicographically.
  return a < b ? -1 : a > b ? 1 : 0
}

/** Add days to a date, normalizing overflow (pure arithmetic via epoch-day math). */
export function addDays(p: DateParts, days: number): DateParts {
  const ms = Date.UTC(p.year, p.month - 1, p.day) + days * 86_400_000
  const d = new Date(ms)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/** Clamp day-of-month to the target month's length (BR-12). */
export function setDateKeepingAnchor(anchorDay: number, year: number, month: number): DateParts {
  return { year, month, day: Math.min(anchorDay, daysInMonth(year, month)) }
}

/** `YYYY-MM` key of a date. */
export function monthKeyOf(date: string): string {
  return date.slice(0, 7)
}

export function tryParseMonth(s: string): { year: number; month: number } | null {
  const m = MONTH_RE.exec(s)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  return { year, month }
}

export function monthRange(key: string): { first: string; last: string } {
  const parsed = tryParseMonth(key)
  if (!parsed) throw new RangeError(`Invalid month key: ${key}`)
  const { year, month } = parsed
  return { first: `${year}-${pad2(month)}-01`, last: toDateString({ year, month, day: daysInMonth(year, month) }) }
}

export function addMonths(key: string, delta: number): string {
  const parsed = tryParseMonth(key)
  if (!parsed) throw new RangeError(`Invalid month key: ${key}`)
  const total = parsed.year * 12 + (parsed.month - 1) + delta
  const year = Math.floor(total / 12)
  const month = (total % 12 + 12) % 12 + 1
  return `${year}-${pad2(month)}`
}

/** List of `YYYY-MM` keys, oldest first, ending at `endKey` inclusive, `count` items. */
export function lastNMonths(endKey: string, count: number): string[] {
  const out: string[] = []
  let cur = endKey
  for (let i = 0; i < count; i++) {
    out.unshift(cur)
    cur = addMonths(cur, -1)
  }
  return out
}

/** Every `YYYY-MM-DD` in a month. */
export function datesOfMonth(key: string): string[] {
  const parsed = tryParseMonth(key)
  if (!parsed) throw new RangeError(`Invalid month key: ${key}`)
  const n = daysInMonth(parsed.year, parsed.month)
  const out: string[] = []
  for (let d = 1; d <= n; d++) out.push(`${key}-${pad2(d)}`)
  return out
}

/** Day-of-month of `today` when the month is the current one, else null. */
export function dayOfTodayIfCurrentMonth(today: string, monthKey: string): number | null {
  return monthKeyOf(today) === monthKey ? Number(today.slice(8, 10)) : null
}

/**
 * Current date (`YYYY-MM-DD`) in a IANA timezone, computed from a fixed UTC instant
 * so tests can be deterministic. Uses Intl (available in Workers and Node).
 */
export function formatDateInTimeZone(instant: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // en-CA yields YYYY-MM-DD.
  return fmt.format(instant)
}

export function todayIn(timeZone: string, now: Date = new Date()): string {
  return formatDateInTimeZone(now, timeZone)
}

/** UTC ISO timestamp with milliseconds, e.g. `2026-09-30T12:00:00.000Z`. */
export function nowIsoUtc(instant: Date = new Date()): string {
  return instant.toISOString()
}

export function addDaysIso(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * 86_400_000)
}

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
]

/** Short Indonesian weekday name for a `YYYY-MM-DD` date (uses UTC fields; date-only so safe). */
export function shortDayName(date: string): string {
  const parsed = tryParseDate(date)
  if (!parsed) return ''
  const d = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day))
  const name = DAY_NAMES[d.getUTCDay()]
  return name ?? ''
}

export function shortMonthName(monthKey: string): string {
  const parsed = tryParseMonth(monthKey)
  if (!parsed) return ''
  return MONTH_NAMES[parsed.month - 1] ?? ''
}

/** `30 Sep` style label for a date. */
export function shortDateLabel(date: string): string {
  const parsed = tryParseDate(date)
  if (!parsed) return date
  return `${parsed.day} ${MONTH_NAMES[parsed.month - 1] ?? ''}`
}
