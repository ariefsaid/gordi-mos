import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '@/i18n/I18nProvider'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { Select } from '@/components/ui/select'
import {
  attendanceSelfieUrl, correctAttendanceRecord, getAttendanceRecord, listTeamAttendance,
  type AttendanceRecordDetail, type TeamAttendanceRow,
} from '@/lib/db/attendance-clock'
import type { LedStaffTeam } from '@/lib/db/staff-attendance'
import { formatTime, todayInJakarta } from './attendance-format'
import './clock-panel.css'

type Load = 'loading' | 'ready' | 'error'

/** A WIB wall-clock time on a date as an instant. */
function wibInstant(date: string, time: string): string {
  return new Date(`${date}T${time}:00+07:00`).toISOString()
}

function wibTime(timestamp: string | null): string {
  if (!timestamp) return ''
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta' }).format(new Date(timestamp))
}

function RecordDetail({ row, onSaved }: { row: TeamAttendanceRow; onSaved: () => void }) {
  const t = useT()
  const { locale } = useI18n()
  const [detail, setDetail] = useState<AttendanceRecordDetail | null>(null)
  const [selfie, setSelfie] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [error, setError] = useState('')
  const date = new Date(row.start_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

  const load = useCallback(async () => {
    if (!row.record_id) { setDetail(null); return }
    try {
      const next = await getAttendanceRecord(row.record_id)
      setDetail(next)
      setSelfie(next.selfie_path ? await attendanceSelfieUrl(next.selfie_path) : null)
    } catch { setFailed(true) }
  }, [row.record_id])
  useEffect(() => { void load() }, [load])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const clockIn = form.get('clockIn')?.toString() ?? ''
    const clockOut = form.get('clockOut')?.toString() ?? ''
    const reason = form.get('reason')?.toString().trim() ?? ''
    if (!reason) { setError(t('attendance.today.reasonRequired')); return }
    if (!clockIn) { setError(t('attendance.today.clockInRequired')); return }
    setError('')
    try {
      await correctAttendanceRecord(row.person_id, row.start_at, wibInstant(date, clockIn), clockOut ? wibInstant(date, clockOut) : null, reason)
      onSaved()
    } catch { setError(t('attendance.today.saveError')) }
  }

  if (failed) return <p className="staff-attendance__error" role="alert">{t('attendance.today.recordError')}</p>
  return <div className="clock-panel__detail">
    {detail && <dl className="clock-panel__facts">
      {detail.in_distance_m !== null && <div><dt>{t('attendance.today.distance')}</dt><dd>{detail.in_distance_m} m · ±{detail.in_accuracy_m} m</dd></div>}
      {detail.history.map((entry) => <div key={entry.at}>
        <dt>{t('attendance.today.corrected', { name: entry.by })}</dt>
        <dd>{entry.reason} · {t('attendance.today.was', { state: String(entry.before?.status ?? '—') })}</dd>
      </div>)}
    </dl>}
    {selfie && <img className="clock-panel__selfie" src={selfie} alt={t('attendance.today.selfieAlt', { name: row.person_name })} />}
    <form onSubmit={(event) => void save(event)} className="staff-attendance__form" aria-label={t('attendance.today.correctTitle', { name: row.person_name })}>
      <label>{t('attendance.today.clockIn')}<input name="clockIn" type="time" defaultValue={wibTime(row.clock_in_at)} /></label>
      <label>{t('attendance.today.clockOut')}<input name="clockOut" type="time" defaultValue={wibTime(row.clock_out_at)} /></label>
      <label>{t('attendance.today.reason')}<input name="reason" type="text" maxLength={300} /></label>
      <p className="staff-attendance__muted">{t('attendance.today.keepOriginal')}</p>
      {error && <p className="staff-attendance__error" role="alert">{error}</p>}
      <button type="submit" className="staff-attendance__primary">{t('attendance.today.save')}</button>
    </form>
    <span className="staff-attendance__muted">{formatTime(row.start_at, locale)}–{formatTime(row.end_at, locale)} WIB</span>
  </div>
}

export function AttendanceTodayPanel({ teams }: { teams: LedStaffTeam[] }) {
  const t = useT()
  const { locale } = useI18n()
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '')
  const [date, setDate] = useState(todayInJakarta())
  const [state, setState] = useState<Load>('loading')
  const [rows, setRows] = useState<TeamAttendanceRow[]>([])
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!teamId) { setRows([]); setState('ready'); return }
    setState('loading')
    try { setRows(await listTeamAttendance(teamId, date)); setState('ready') } catch { setState('error') }
  }, [teamId, date])
  useEffect(() => { void load() }, [load])

  return <section className="staff-attendance__panel" aria-label={t('attendance.today.title')}>
    <div className="staff-attendance__toolbar">
      <Select label={t('attendance.today.team')} value={teamId} onChange={(event) => setTeamId(event.target.value)}>
        {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
      </Select>
      <label className="staff-attendance__select-label">{t('attendance.today.date')}<input type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} /></label>
    </div>
    {state === 'loading' && <LoadingShell count={3} label={t('attendance.today.loading')} />}
    {state === 'error' && <ErrorState message={t('attendance.today.loadError')} onRetry={load} />}
    {state === 'ready' && rows.length === 0 && <p className="staff-attendance__empty">{t('attendance.today.empty')}</p>}
    {state === 'ready' && rows.map((row) => {
      const key = `${row.person_id}-${row.start_at}`
      return <article className="staff-attendance__shift clock-panel__row" key={key}>
        <div className="staff-attendance__shift-main">
          <strong>{row.person_name}</strong>
          <span className={`staff-attendance__badge clock-panel__status clock-panel__status--${row.status}`}>{t(`attendance.status.${row.status}` as MessageKey)}</span>
          <span className="staff-attendance__time">{formatTime(row.start_at, locale)}–{formatTime(row.end_at, locale)} WIB{row.clock_in_at ? ` · ${t('attendance.today.in', { time: formatTime(row.clock_in_at, locale) })}` : ''}{row.clock_out_at ? ` · ${t('attendance.today.out', { time: formatTime(row.clock_out_at, locale) })}` : ''}</span>
        </div>
        <div className="staff-attendance__actions">
          <button type="button" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>{t('attendance.today.view', { name: row.person_name })}</button>
        </div>
        {open === key && <RecordDetail row={row} onSaved={() => { setOpen(null); void load() }} />}
      </article>
    })}
  </section>
}
