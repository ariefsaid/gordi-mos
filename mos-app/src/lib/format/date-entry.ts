// date-entry.ts — typed date entry is ALWAYS day-first (dd/mm/yyyy), whatever the browser's
// locale order. The parser is strict: a value is either a real calendar date or an error. It
// never guesses a partial value, never swaps day and month, and never clamps 31/02 to 28/02.

export type DateEntry =
  | { kind: 'empty' }
  | { kind: 'ok'; iso: string }
  | { kind: 'format' }
  | { kind: 'impossible' }

const MIN_YEAR = 1900
const MAX_YEAR = 2100

/** True when y-m-d is a real calendar date inside the supported years. */
export function isRealDate(y: number, m: number, d: number): boolean {
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

const pad = (n: number, width: number) => String(n).padStart(width, '0')

/** Parse typed text. Accepts d/m/yyyy with / - . or space, a bare 8-digit run, or yyyy-mm-dd. */
export function parseDayFirst(text: string): DateEntry {
  const s = text.trim()
  if (s === '') return { kind: 'empty' }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  const dmy = /^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})$/.exec(s)
  const digits = /^(\d{2})(\d{2})(\d{4})$/.exec(s)
  const parts: [number, number, number] | undefined = iso
    ? [+iso[1], +iso[2], +iso[3]]
    : dmy ? [+dmy[3], +dmy[2], +dmy[1]]
    : digits ? [+digits[3], +digits[2], +digits[1]]
    : undefined
  if (!parts) return { kind: 'format' }
  const [y, m, d] = parts
  return isRealDate(y, m, d) ? { kind: 'ok', iso: `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}` } : { kind: 'impossible' }
}

/** "2026-10-05" → "05/10/2026" (the editing text). Anything else comes back as given. */
export function toDayFirst(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/** Insert the slashes as digits are typed: "0510" → "05/10", "5/102" → "5/10/2". */
export function maskDayFirst(text: string): string {
  if (!/^[\d/]*$/.test(text)) return text // a pasted yyyy-mm-dd or other separators are parsed as typed
  return text
    .replace(/^(\d{2})(\d)/, '$1/$2')
    .replace(/^(\d{1,2}\/\d{2})(\d)/, '$1/$2')
}
