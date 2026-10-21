import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '@/i18n/I18nProvider'
import { useT } from '@/i18n/use-t'
import { listNextMyStaffShifts, type StaffShift } from '@/lib/db/staff-attendance'
import './home-staff-shifts.css'

type State = 'loading' | 'ready' | 'error'

export function HomeStaffShifts() {
  const t = useT()
  const { locale } = useI18n()
  const [state, setState] = useState<State>('loading')
  const [shifts, setShifts] = useState<StaffShift[]>([])
  const load = useCallback(async () => {
    setState('loading')
    try { setShifts(await listNextMyStaffShifts()); setState('ready') }
    catch { setState('error') }
  }, [])
  useEffect(() => { void load() }, [load])

  return <section className="home-staff-shifts" aria-labelledby="home-staff-shifts-title">
    <div className="home-staff-shifts__heading"><h2 id="home-staff-shifts-title">{t('attendance.home.title')}</h2><Link to="/work/shifts">{t('attendance.home.all')}</Link></div>
    {state === 'loading' && <p role="status">{t('attendance.home.loading')}</p>}
    {state === 'error' && <div className="home-staff-shifts__error"><p role="alert">{t('attendance.home.error')}</p><button type="button" onClick={() => void load()}>{t('common.retry')}</button></div>}
    {state === 'ready' && shifts.length === 0 && <p>{t('attendance.home.empty')}</p>}
    {state === 'ready' && shifts.length > 0 && <ul>{shifts.map((shift, index) => <li key={`${shift.team_id}-${shift.local_date}-${shift.start_at}-${index}`}>
      <strong>{new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(`${shift.local_date}T12:00:00+07:00`))}</strong>
      <span>{new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta' }).format(new Date(shift.start_at))}–{new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta' }).format(new Date(shift.end_at))} WIB</span>
      <span>{shift.site_name} · {shift.team_name}</span>
      {shift.crew && shift.crew.length > 0 && <span>{t('attendance.shift.crew')}: {shift.crew.join(', ')}</span>}
    </li>)}</ul>}
  </section>
}
