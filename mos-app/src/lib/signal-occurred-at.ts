import { WIB_OFFSET_MS } from '@/lib/format/date'

export interface WibDateTimeParts {
  date: string
  time: string
}

const WIB_TIME_ZONE = 'Asia/Jakarta'
const WIB_FORMATTER = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
  timeZone: WIB_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function wibPartsFromInstant(instant: Date | string): WibDateTimeParts | null {
  const date = instant instanceof Date ? instant : new Date(instant)
  if (!Number.isFinite(date.getTime())) return null

  const parts = Object.fromEntries(WIB_FORMATTER.formatToParts(date).map(({ type, value }) => [type, value]))
  const year = parts.year
  const month = parts.month
  const day = parts.day
  const hour = parts.hour
  const minute = parts.minute
  if (!year || !month || !day || !hour || !minute) return null

  return { date: `${year.padStart(4, '0')}-${month}-${day}`, time: `${hour}:${minute}` }
}

export function signalOccurredAtIsoFromWib(date: string, time: string): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const timeMatch = /^(\d{2}):([0-5]\d)$/.exec(time)
  if (!dateMatch || !timeMatch) return null

  const [, yearText, monthText, dayText] = dateMatch
  const [, hourText, minuteText] = timeMatch
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  if (year === 0 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23) return null

  const utcDate = new Date(0)
  utcDate.setUTCFullYear(year, month - 1, day)
  utcDate.setUTCHours(hour, minute, 0, 0)
  utcDate.setTime(utcDate.getTime() - WIB_OFFSET_MS)
  if (!Number.isFinite(utcDate.getTime())) return null

  const iso = utcDate.toISOString()
  const roundTrip = wibPartsFromInstant(iso)
  return roundTrip?.date === date && roundTrip.time === time ? iso : null
}
