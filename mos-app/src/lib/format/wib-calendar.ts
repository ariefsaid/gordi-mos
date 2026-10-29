const WIB_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The Asia/Jakarta calendar date for an instant, formatted as YYYY-MM-DD. */
export function wibToday(now: Date = new Date()): string {
  return WIB_DATE.format(now)
}

/** The Asia/Jakarta start-of-month calendar date for an instant, formatted as YYYY-MM-01. */
export function wibStartOfMonth(now: Date = new Date()): string {
  const [yStr, mStr] = wibToday(now).split('-')
  return `${yStr}-${mStr}-01`
}

/** The Asia/Jakarta end-of-month calendar date for an instant, formatted as YYYY-MM-DD. */
export function wibEndOfMonth(now: Date = new Date()): string {
  const [yStr, mStr] = wibToday(now).split('-')
  const year = Number(yStr)
  const month = Number(mStr)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`
}
