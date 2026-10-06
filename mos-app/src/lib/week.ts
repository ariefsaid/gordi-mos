// WIB (Asia/Jakarta, UTC+7, no DST) month utilities.
// Uses a fixed +7h offset arithmetic so no host-timezone leakage (NFR-005).

export interface WibMonthRange {
  month: string
  startISO: string
  endISO: string
}

/** Return YYYY-MM for the WIB calendar month containing `now`. */
export function wibMonthKey(now: Date = new Date()): string {
  const { year, month } = wibParts(now)
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Validate a calendar month and return its half-open UTC range in WIB. */
export function wibMonthRange(month: string): WibMonthRange | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month)
  if (!match) return null
  const year = Number(match[1])
  const index = Number(match[2]) - 1
  const start = Date.UTC(year, index, 1) - WIB_OFFSET_MS
  const end = Date.UTC(year, index + 1, 1) - WIB_OFFSET_MS
  return { month, startISO: new Date(start).toISOString(), endISO: new Date(end).toISOString() }
}

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * Read WIB calendar values by shifting UTC time by +7h and reading UTC parts.
 * This avoids any dependency on the host timezone.
 */
function wibParts(now: Date): {
  year: number
  month: number // 1-based
} {
  const shifted = new Date(now.getTime() + WIB_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
  }
}
