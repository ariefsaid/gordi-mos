import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n/I18nProvider'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import {
  beginClockIn, clockIn, clockOut, getMyClockState, recordAttendanceConsent, uploadAttendanceSelfie,
  type ClockInAccepted, type ClockOutAccepted, type ClockPosition, type ClockRefusal, type ClockShift, type ClockState,
} from '@/lib/db/attendance-clock'
import { compressSelfie, PositionError, readPosition } from '@/lib/attendance-capture'
import { formatDay, formatTime } from './attendance-format'
import './clock-panel.css'

type Load = 'loading' | 'ready' | 'error'
type Failure = ClockRefusal | { ok: false; reason: 'denied' | 'unavailable' | 'upload' | 'selfie' | 'generic' }
type Outcome = ClockInAccepted | ClockOutAccepted

/** The shift to act on: the one running or about to open, else the next, else the latest. */
function pickShift(shifts: ClockShift[], now: Date): ClockShift | null {
  const open = shifts.find((s) => new Date(s.opens_at) <= now && new Date(s.end_at) > now && s.record?.status !== 'out')
  return open ?? shifts.find((s) => new Date(s.end_at) > now) ?? shifts[shifts.length - 1] ?? null
}

export function ClockPanel() {
  const t = useT()
  const { locale } = useI18n()
  const [load, setLoad] = useState<Load>('loading')
  const [state, setState] = useState<ClockState | null>(null)
  const [declined, setDeclined] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [agreeError, setAgreeError] = useState(false)
  const [selfie, setSelfie] = useState<Blob | null>(null)
  const [reading, setReading] = useState<ClockPosition | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const attempt = useRef<{ id: string; orgId: string; uploaded: Blob | null } | null>(null)

  const refresh = useCallback(async () => {
    try { setState(await getMyClockState()); setLoad('ready') } catch { setLoad('error') }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  async function consent() {
    if (!agreed) { setAgreeError(true); return }
    if (!state) return
    setBusy(true)
    try { await recordAttendanceConsent(state.notice_version, locale === 'id' ? 'id' : 'en'); await refresh() }
    catch { setFailure({ ok: false, reason: 'generic' }) }
    finally { setBusy(false) }
  }

  async function checkLocation() {
    setFailure(null)
    try { setReading(await readPosition()) }
    catch (error) { setReading(null); setFailure({ ok: false, reason: error instanceof PositionError ? error.kind : 'unavailable' }) }
  }

  async function chooseSelfie(file: File | undefined) {
    setFailure(null)
    if (!file) { setSelfie(null); return }
    try { setSelfie(await compressSelfie(file)) } catch { setSelfie(null); setFailure({ ok: false, reason: 'selfie' }) }
  }

  async function submit(shift: ClockShift) {
    setFailure(null); setOutcome(null); setBusy(true)
    try {
      const position = await readPosition()
      setReading(position)
      const record = shift.record
      if (record?.status === 'in') {
        const result = await clockOut(record.id, position)
        if (result.ok) { setOutcome(result); await refresh() } else setFailure(result)
        return
      }
      if (!selfie) { setFailure({ ok: false, reason: 'photo_needed' }); return }
      const begin = await beginClockIn(shift.start_at)
      if (!begin.ok) { setFailure(begin); return }
      if (attempt.current?.id !== begin.attempt_id) attempt.current = { id: begin.attempt_id, orgId: begin.org_id, uploaded: null }
      if (attempt.current.uploaded !== selfie) {
        await uploadAttendanceSelfie(begin.org_id, begin.attempt_id, selfie)
        attempt.current.uploaded = selfie
      }
      const result = await clockIn(begin.attempt_id, position)
      if (result.ok) { attempt.current = null; setSelfie(null); setOutcome(result); await refresh() } else setFailure(result)
    } catch (error) {
      setFailure({ ok: false, reason: error instanceof PositionError ? error.kind : 'generic' })
    } finally { setBusy(false) }
  }

  if (load === 'loading') return <LoadingShell count={3} label={t('attendance.clock.loading')} />
  if (load === 'error' || !state) return <ErrorState message={t('attendance.clock.loadError')} onRetry={refresh} />

  const shift = pickShift(state.shifts, new Date(state.now))
  const time = (value: string) => formatTime(value, locale)

  if (!shift) return <section className="clock-panel" aria-label={t('attendance.clock.title')}><p className="staff-attendance__empty">{t('attendance.clock.empty')}</p></section>

  const head = <header className="clock-panel__shift">
    <strong>{formatDay(shift.local_date, locale)} · {time(shift.start_at)}–{time(shift.end_at)} WIB</strong>
    <span>{shift.site_name} · {shift.team_name}</span>
  </header>

  if (!state.consented) {
    if (declined) {
      return <section className="clock-panel" aria-label={t('attendance.clock.title')}>{head}
        <div className="clock-panel__note" role="status"><strong>{t('attendance.clock.declined.title')}</strong><p>{t('attendance.clock.declined.body')}</p></div>
        <div className="clock-panel__bar"><button type="button" onClick={() => setDeclined(false)}>{t('attendance.clock.declined.review')}</button></div>
      </section>
    }
    return <section className="clock-panel" aria-label={t('attendance.clock.title')}>{head}
      <h2>{t('attendance.clock.consent.title')}</h2>
      <p>{t('attendance.clock.consent.intro')}</p>
      <dl className="clock-panel__facts">
        <div><dt>{t('attendance.clock.consent.purposeLabel')}</dt><dd>{t('attendance.clock.consent.purpose')}</dd></div>
        <div><dt>{t('attendance.clock.consent.retentionLabel')}</dt><dd>{t('attendance.clock.consent.retention')}</dd></div>
        <div><dt>{t('attendance.clock.consent.accessLabel')}</dt><dd>{t('attendance.clock.consent.access')}</dd></div>
      </dl>
      <blockquote className="clock-panel__statement">{t('attendance.clock.consent.statement')}</blockquote>
      <label className="staff-attendance__toggle"><input type="checkbox" checked={agreed} onChange={(event) => { setAgreed(event.target.checked); setAgreeError(false) }} />{t('attendance.clock.consent.agree')}</label>
      {agreeError && <p className="staff-attendance__error" role="alert">{t('attendance.clock.consent.needTick')}</p>}
      {failure && <p className="staff-attendance__error" role="alert">{t('attendance.clock.refuse.generic.title')}</p>}
      <div className="clock-panel__bar">
        <button type="button" onClick={() => setDeclined(true)}>{t('attendance.clock.consent.decline')}</button>
        <button type="button" className="staff-attendance__primary" disabled={busy} onClick={() => void consent()}>{t('attendance.clock.consent.accept')}</button>
      </div>
    </section>
  }

  const record = shift.record
  const clockingOut = record?.status === 'in'
  const finished = record?.status === 'out' || record?.status === 'closed'
  const refusalKey = failure ? (`attendance.clock.refuse.${failure.reason}`) as MessageKey : null
  const detail = (failure ?? {}) as Partial<ClockRefusal>
  const vars = {
    distance: String(detail.distance_m ?? ''), radius: String(detail.radius_m ?? shift.radius_m),
    accuracy: String(detail.accuracy_m ?? ''), max: String(detail.max_accuracy_m ?? shift.max_accuracy_m),
    time: time(detail.opens_at ?? shift.opens_at),
  }

  return <section className="clock-panel" aria-label={t('attendance.clock.title')}>{head}
    {record && <div className="clock-panel__note" role="status">
      <strong>{record.status === 'closed' ? t('attendance.clock.state.noClockOut') : record.status === 'out' ? t('attendance.clock.state.out') : t('attendance.clock.state.in')}</strong>
      <p>{record.clock_in_at && t('attendance.clock.state.clockIn', { time: time(record.clock_in_at) })}{record.late && ` · ${t('attendance.clock.state.late', { minutes: String(record.late_minutes ?? 0) })}`}</p>
      {record.clock_out_at && <p>{t('attendance.clock.state.clockOut', { time: time(record.clock_out_at) })}{record.early_leave && ` · ${t('attendance.clock.state.early', { minutes: String(record.early_minutes ?? 0) })}`}</p>}
      {record.status === 'closed' && <p>{t('attendance.clock.state.noClockOutHelp')}</p>}
    </div>}
    {outcome && outcome.ok && <p className="staff-attendance__notice" role="status">{t(outcome.status === 'in' ? 'attendance.clock.result.in' : 'attendance.clock.result.out')}</p>}
    {!shift.site_ready && <p className="staff-attendance__error" role="alert">{t('attendance.clock.refuse.site_not_set.body')}</p>}
    {!finished && <>
      <h2>{t('attendance.clock.location.title')}</h2>
      <div className="clock-panel__check"><span>{t('attendance.clock.location.accuracy')}</span><strong>{reading ? `±${Math.round(reading.accuracy)} m / ${shift.max_accuracy_m} m` : t('attendance.clock.location.none')}</strong></div>
      <p className="staff-attendance__muted">{t('attendance.clock.location.note', { radius: String(shift.radius_m) })}</p>
      <div className="staff-attendance__actions"><button type="button" onClick={() => void checkLocation()}>{t('attendance.clock.location.check')}</button></div>
      {!clockingOut && <>
        <h2>{t('attendance.clock.selfie.title')}</h2>
        <p>{selfie ? t('attendance.clock.selfie.ready') : t('attendance.clock.selfie.none')}</p>
        <label className="clock-panel__file">{selfie ? t('attendance.clock.selfie.retake') : t('attendance.clock.selfie.take')}
          <input type="file" accept="image/*" capture="user" onChange={(event) => void chooseSelfie(event.target.files?.[0])} />
        </label>
      </>}
      {clockingOut && <p className="staff-attendance__muted">{t('attendance.clock.out.note')}</p>}
    </>}
    {failure && refusalKey && <div className="clock-panel__note clock-panel__note--error" role="alert">
      <strong>{t(`${refusalKey}.title` as MessageKey, vars)}</strong>
      <p>{t(`${refusalKey}.body` as MessageKey, vars)}</p>
    </div>}
    {!finished && <div className="clock-panel__bar">
      <span>{failure ? t('attendance.clock.bar.notRecorded') : busy ? t('attendance.clock.bar.checking') : t('attendance.clock.bar.final')}</span>
      <button type="button" className="staff-attendance__primary" disabled={busy || !shift.site_ready} onClick={() => void submit(shift)}>
        {busy ? t('attendance.clock.action.checking') : clockingOut ? t('attendance.clock.action.out') : t('attendance.clock.action.in')}
      </button>
    </div>}
  </section>
}
