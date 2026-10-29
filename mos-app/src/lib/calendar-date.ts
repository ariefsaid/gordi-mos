/**
 * Strict calendar date validator for ISO-8601 calendar dates in `YYYY-MM-DD` format.
 * Rejects non-strings, malformed strings, invalid months (e.g. month 00 or 13),
 * invalid days (e.g. 31st of April, 30th of February), and non-leap year Feb 29.
 */
export function isIsoCalendarDate(value: string): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
