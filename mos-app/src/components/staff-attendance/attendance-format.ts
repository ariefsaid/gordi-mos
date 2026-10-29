import { wibToday } from '@/lib/format/date'

export function todayInJakarta(): string {
  return wibToday()
}

export function formatDay(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(`${date}T12:00:00+07:00`))
}

export function formatTime(timestamp: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta' }).format(new Date(timestamp))
}
