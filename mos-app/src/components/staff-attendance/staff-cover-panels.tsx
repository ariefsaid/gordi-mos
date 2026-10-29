import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useI18n } from '@/i18n/I18nProvider'
import { useStaffCoverText, type StaffCoverKey, type StaffCoverText } from '@/i18n/staff-cover'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { Select } from '@/components/ui/select'
import { listMyStaffShifts, type StaffShift } from '@/lib/db/staff-attendance'
import {
  assignStaffCover, attachStaffAbsenceNote, cancelStaffAbsence, cancelStaffOffer, claimStaffShift, decideStaffAbsence,
  decideStaffClaim, listOpenStaffShifts, listMyStaffAbsences, listStaffAbsences, listStaffCoverQueue, listStaffMonthlyTotals,
  offerStaffShift, reportStaffAbsence, staffNoteUrl, withdrawStaffClaim,
  type AbsenceKind, type AbsenceStatus, type CoverQueue, type HrAbsence, type MonthlyTotal, type MyAbsence, type OpenShiftsView,
} from '@/lib/db/staff-cover'
import { wibToday } from '@/lib/format/date'
import './staff-shift-panels.css'
import './staff-cover-panels.css'

type FetchState = 'loading' | 'ready' | 'error'

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function mondayOf(date: string): string {
  const day = new Date(`${date}T12:00:00Z`)
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
  return day.toISOString().slice(0, 10)
}

function dayLabel(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(`${date}T12:00:00+07:00`))
}

function timeLabel(timestamp: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta' }).format(new Date(timestamp))
}

function span(date: string, start: string, end: string, locale: string): string {
  return `${dayLabel(date, locale)} · ${timeLabel(start, locale)}–${timeLabel(end, locale)} WIB`
}

function token(error: unknown): string {
  return error instanceof Error ? error.message : ''
}

function absenceError(tt: StaffCoverText, error: unknown): string {
  switch (token(error)) {
    case 'STAFF_ABSENCE_TOO_LATE': return tt('absence.error.tooLate')
    case 'STAFF_SICK_SAME_DAY_ONLY': return tt('absence.error.sickToday')
    case 'STAFF_ABSENCE_EXISTS': return tt('absence.error.exists')
    case 'STAFF_SHIFT_NOT_FOUND': return tt('absence.error.notFound')
    default: return tt('absence.error.generic')
  }
}

function coverError(tt: StaffCoverText, error: unknown): string {
  switch (token(error)) {
    case 'STAFF_CLAIM_TAKEN': return tt('cover.taken')
    case 'STAFF_SHIFT_OVERLAP': return tt('cover.overlap')
    case 'STAFF_CLAIM_NOT_ELIGIBLE': return tt('cover.notEligible')
    case 'STAFF_SHIFT_STARTED': return tt('cover.started')
    default: return tt('cover.error.generic')
  }
}

function queueError(tt: StaffCoverText, error: unknown): string {
  switch (token(error)) {
    case 'STAFF_REASON_REQUIRED': return tt('queue.error.reason')
    case 'STAFF_ABSENCE_NOT_PENDING': case 'STAFF_CLAIM_CLOSED': case 'STAFF_OFFER_CLOSED': return tt('queue.error.closed')
    case 'STAFF_CLAIM_NOT_ELIGIBLE': return tt('queue.error.notEligible')
    case 'STAFF_SHIFT_OVERLAP': return tt('queue.error.overlap')
    default: return tt('queue.error.generic')
  }
}

function useLoader<T>(load: () => Promise<T>) {
  const [state, setState] = useState<FetchState>('loading')
  const [data, setData] = useState<T | null>(null)
  const run = useCallback(async () => {
    setState('loading')
    try { setData(await load()); setState('ready') } catch { setState('error') }
  }, [load])
  useEffect(() => { void run() }, [run])
  return { state, data, reload: run }
}

function Gate({ state, reload, tt, children }: { state: FetchState; reload: () => void; tt: StaffCoverText; children: React.ReactNode }) {
  if (state === 'loading') return <LoadingShell count={3} label={tt('loading')} />
  if (state === 'error') return <ErrorState message={tt('loadError')} onRetry={reload} retryLabel={tt('retry')} />
  return <>{children}</>
}

function StatusBadge({ status, tt }: { status: AbsenceStatus; tt: StaffCoverText }) {
  const tone = status === 'rejected' ? 'staff-cover__badge--bad' : status === 'pending' ? 'staff-cover__badge--wait' : 'staff-cover__badge--ok'
  return <span className={`staff-attendance__badge ${tone}`}>{tt(`status.${status}` as StaffCoverKey)}</span>
}

function shiftKey(shift: StaffShift): string {
  return shift.id ?? `${shift.team_id}|${shift.local_date}`
}

/** My upcoming shifts for this week and next, standing-hours days included. */
function useUpcomingShifts() {
  const load = useCallback(async () => {
    const week = mondayOf(wibToday())
    const [a, b] = await Promise.all([listMyStaffShifts(week), listMyStaffShifts(addDays(week, 7))])
    const now = Date.now()
    return [...a, ...b].filter((shift) => Date.parse(shift.end_at) > now)
  }, [])
  return useLoader(load)
}

export function AbsencePanel({ orgId }: { orgId: string }) {
  const tt = useStaffCoverText()
  const { locale } = useI18n()
  const shifts = useUpcomingShifts()
  const absences = useLoader(listMyStaffAbsences)
  const [kind, setKind] = useState<AbsenceKind>('sick')
  const [key, setKey] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const today = wibToday()
  const options = (shifts.data ?? []).filter((shift) => kind !== 'sick' || shift.local_date === today)
  const chosen = options.find((shift) => shiftKey(shift) === key) ?? options[0]

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!chosen) return
    setBusy(true); setError(''); setDone('')
    try {
      await reportStaffAbsence({
        kind, shiftId: chosen.id, teamId: chosen.id ? null : chosen.team_id, localDate: chosen.id ? null : chosen.local_date, reason,
      })
      setDone(kind === 'sick' ? tt('absence.done.sick') : tt('absence.done.other'))
      setReason('')
      await absences.reload()
    } catch (e) { setError(absenceError(tt, e)) } finally { setBusy(false) }
  }

  return <section className="staff-attendance__panel" aria-label={tt('absence.title')}>
    <Gate state={shifts.state} reload={shifts.reload} tt={tt}>
      <form className="staff-cover__form" onSubmit={submit}>
        <h2>{tt('absence.title')}</h2>
        <Select label={tt('absence.kind')} value={kind} onChange={(e) => { setKind(e.target.value as AbsenceKind); setKey('') }} fullWidth>
          {(['sick', 'permission', 'leave'] as const).map((k) => <option key={k} value={k}>{tt(`kind.${k}` as StaffCoverKey)}</option>)}
        </Select>
        <p className="staff-attendance__muted">{kind === 'sick' ? tt('absence.kind.hint.sick') : tt('absence.kind.hint.other')}</p>
        {options.length === 0
          ? <p className="staff-attendance__empty">{tt('absence.noShifts')}</p>
          : <Select label={tt('absence.shift')} value={chosen ? shiftKey(chosen) : ''} onChange={(e) => setKey(e.target.value)} fullWidth>
            {options.map((shift) => <option key={shiftKey(shift)} value={shiftKey(shift)}>{span(shift.local_date, shift.start_at, shift.end_at, locale)} · {shift.site_name}</option>)}
          </Select>}
        <label>{tt('absence.reason')}
          <textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error && <p className="staff-attendance__error" role="alert">{error}</p>}
        {done && <p className="staff-attendance__notice" role="status">{done}</p>}
        <div className="staff-cover__bar">
          <button type="submit" className="staff-attendance__primary" disabled={busy || !chosen}>
            {busy ? tt('absence.sending') : kind === 'sick' ? tt('absence.submit.sick') : tt('absence.submit.other')}
          </button>
        </div>
      </form>
    </Gate>
    <Gate state={absences.state} reload={absences.reload} tt={tt}>
      <section className="staff-attendance__subpanel" aria-label={tt('absence.mine')}>
        <h2>{tt('absence.mine')}</h2>
        {(absences.data ?? []).length === 0 && <p className="staff-attendance__empty">{tt('absence.mine.empty')}</p>}
        {(absences.data ?? []).map((item) => <AbsenceRow key={item.id} item={item} orgId={orgId} onChanged={absences.reload} />)}
      </section>
    </Gate>
  </section>
}

function AbsenceRow({ item, orgId, onChanged }: { item: MyAbsence; orgId: string; onChanged: () => Promise<void> }) {
  const tt = useStaffCoverText()
  const { locale } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function withdraw() {
    setBusy(true); setError('')
    try { await cancelStaffAbsence(item.id); await onChanged() } catch (e) { setError(absenceError(tt, e)) } finally { setBusy(false) }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true); setError('')
    try { await attachStaffAbsenceNote(item.id, orgId, file); await onChanged() } catch { setError(tt('absence.noteError')) } finally { setBusy(false) }
  }
  async function view() {
    if (!item.note_path) return
    try { window.open(await staffNoteUrl(item.note_path), '_blank', 'noopener') } catch { setError(tt('absence.noteError')) }
  }
  return <article className="staff-attendance__shift">
    <div className="staff-attendance__shift-main">
      <strong>{tt(`kind.${item.kind}` as StaffCoverKey)} · {span(item.local_date, item.start_at, item.end_at, locale)}</strong>
      <span>{item.team_name} · {item.site_name}</span>
      <span><StatusBadge status={item.status} tt={tt} />{item.flagged && <span className="staff-attendance__badge">{tt('flag.sameDay')}</span>}</span>
      {item.kind === 'sick' && <span className="staff-attendance__muted">{item.documented ? tt('note.attached') : tt('note.missing')}</span>}
      {item.recorded_by_other && <span className="staff-attendance__muted">{tt('absence.recordedByLead')}</span>}
      {item.decision_reason && <span className="staff-attendance__muted">{tt('absence.decision', { reason: item.decision_reason })}</span>}
      {error && <span className="staff-attendance__error" role="alert">{error}</span>}
    </div>
    <div className="staff-attendance__actions">
      {item.status === 'pending' && <button type="button" disabled={busy} onClick={withdraw}>{tt('absence.withdraw')}</button>}
      {item.kind === 'sick' && !item.documented && ['accepted', 'approved'].includes(item.status) && <label className="staff-cover__file">
        <span>{busy ? tt('absence.noteSending') : tt('absence.addNote')}</span>
        <input type="file" accept="image/*" disabled={busy} onChange={upload} aria-describedby={`note-help-${item.id}`} />
        <small id={`note-help-${item.id}`}>{tt('absence.noteHelp')}</small>
      </label>}
      {item.documented && <button type="button" onClick={view}>{tt('absence.viewNote')}</button>}
    </div>
  </article>
}

export function CoverPanel() {
  const tt = useStaffCoverText()
  const { locale } = useI18n()
  const view = useLoader<OpenShiftsView>(listOpenStaffShifts)
  const shifts = useUpcomingShifts()
  const [offerKey, setOfferKey] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const offerable = (shifts.data ?? []).filter((shift) => shift.id && Date.parse(shift.start_at) > Date.now()
    && !(view.data?.mine ?? []).some((offer) => offer.shift_id === shift.id))
  const chosen = offerable.find((shift) => shift.id === offerKey) ?? offerable[0]

  async function act(id: string, work: () => Promise<unknown>, message = '') {
    setBusy(id); setError(''); setNotice('')
    try { await work(); setNotice(message); await view.reload() } catch (e) { setError(coverError(tt, e)); await view.reload() } finally { setBusy('') }
  }

  return <section className="staff-attendance__panel" aria-label={tt('cover.title')}>
    <Gate state={view.state} reload={view.reload} tt={tt}>
      <p className="staff-attendance__muted">{tt('cover.job')} {tt('cover.privacy')}</p>
      {error && <p className="staff-attendance__error" role="alert">{error}</p>}
      {notice && <p className="staff-attendance__notice" role="status">{notice}</p>}
      {(view.data?.open ?? []).length === 0 && <p className="staff-attendance__empty">{tt('cover.empty')}</p>}
      {(view.data?.open ?? []).map((item) => <article className="staff-attendance__shift" key={item.offer_id}>
        <div className="staff-attendance__shift-main">
          <strong>{span(item.local_date, item.start_at, item.end_at, locale)}</strong>
          <span>{item.team_name} · {item.site_name}</span>
          <span className="staff-attendance__badge">{tt(`cover.kind.${item.kind}` as StaffCoverKey)}</span>
          {item.my_claim_id && <span className="staff-attendance__muted">{tt('cover.myClaim')}</span>}
        </div>
        <div className="staff-attendance__actions">
          {item.my_claim_id
            ? <button type="button" disabled={busy === item.offer_id} onClick={() => act(item.offer_id, () => withdrawStaffClaim(item.my_claim_id as string))}>{tt('cover.withdrawClaim')}</button>
            : <button type="button" className="staff-attendance__primary" disabled={!item.can_claim || busy === item.offer_id}
              onClick={() => act(item.offer_id, () => claimStaffShift(item.offer_id), tt('cover.claimed'))}>{tt('cover.claim')}</button>}
        </div>
      </article>)}
      {(view.data?.mine ?? []).length > 0 && <section className="staff-attendance__subpanel" aria-label={tt('cover.mine')}>
        <h2>{tt('cover.mine')}</h2>
        {(view.data?.mine ?? []).map((offer) => <article className="staff-attendance__shift" key={offer.offer_id}>
          <div className="staff-attendance__shift-main">
            <strong>{span(offer.local_date, offer.start_at, offer.end_at, locale)}</strong>
            <span>{offer.claimant_name ? tt('cover.waitingOn', { name: offer.claimant_name }) : tt('cover.noClaim')}</span>
          </div>
          {offer.kind === 'swap' && <div className="staff-attendance__actions">
            <button type="button" disabled={busy === offer.offer_id} onClick={() => act(offer.offer_id, () => cancelStaffOffer(offer.offer_id))}>{tt('cover.offer.cancel')}</button>
          </div>}
        </article>)}
      </section>}
    </Gate>
    <Gate state={shifts.state} reload={shifts.reload} tt={tt}>
      <form className="staff-cover__form" onSubmit={(e) => { e.preventDefault(); if (chosen?.id) void act('offer', () => offerStaffShift(chosen.id as string), tt('cover.offer.done')) }}>
        <h2>{tt('cover.offer.title')}</h2>
        <p className="staff-attendance__muted">{tt('cover.offer.help')}</p>
        {offerable.length === 0 ? <p className="staff-attendance__empty">{tt('cover.offer.none')}</p>
          : <Select label={tt('cover.offer.shift')} value={chosen?.id ?? ''} onChange={(e) => setOfferKey(e.target.value)} fullWidth>
            {offerable.map((shift) => <option key={shift.id} value={shift.id as string}>{span(shift.local_date, shift.start_at, shift.end_at, locale)} · {shift.site_name}</option>)}
          </Select>}
        <div className="staff-cover__bar">
          <button type="submit" className="staff-attendance__primary" disabled={!chosen || busy === 'offer'}>{tt('cover.offer.submit')}</button>
        </div>
      </form>
    </Gate>
  </section>
}

export function RequestsPanel() {
  const tt = useStaffCoverText()
  const { locale } = useI18n()
  const queue = useLoader<CoverQueue>(listStaffCoverQueue)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [assignees, setAssignees] = useState<Record<string, string>>({})

  async function act(id: string, work: () => Promise<unknown>) {
    setBusy(id); setError('')
    try { await work(); setRejecting(null); setReason(''); await queue.reload() } catch (e) { setError(queueError(tt, e)); await queue.reload() } finally { setBusy('') }
  }
  const data = queue.data
  const empty = data && !data.absences.length && !data.claims.length && !data.uncovered.length && !data.sick.length
  const anyViewOnly = data && [...data.absences, ...data.claims, ...data.uncovered].some((row) => !row.can_decide)

  return <section className="staff-attendance__panel" aria-label={tt('queue.title')}>
    <Gate state={queue.state} reload={queue.reload} tt={tt}>
      <p className="staff-attendance__muted">{tt('queue.job')}</p>
      {anyViewOnly && <p className="staff-attendance__muted">{tt('queue.viewOnly')}</p>}
      {error && <p className="staff-attendance__error" role="alert">{error}</p>}
      {empty && <p className="staff-attendance__empty">{tt('queue.empty')}</p>}
      {data && data.uncovered.length > 0 && <section className="staff-attendance__subpanel" aria-label={tt('queue.uncovered')}>
        <h2>{tt('queue.uncovered')}</h2>
        {data.uncovered.map((row) => {
          const options = data.candidates.filter((c) => c.site_id === row.site_id && c.person_id !== row.person_id)
          const pick = assignees[row.offer_id] ?? ''
          return <article className="staff-attendance__shift" key={row.offer_id}>
            <div className="staff-attendance__shift-main">
              <strong>{tt('queue.uncoveredLine', { person: row.person_name })}</strong>
              <span>{span(row.local_date, row.start_at, row.end_at, locale)} · {row.team_name}</span>
            </div>
            {row.can_decide && <div className="staff-attendance__actions">
              <Select aria-label={tt('queue.assignPick')} value={pick} onChange={(e) => setAssignees({ ...assignees, [row.offer_id]: e.target.value })}>
                <option value="">{tt('queue.assignNone')}</option>
                {options.map((c) => <option key={c.person_id} value={c.person_id}>{c.full_name}</option>)}
              </Select>
              <button type="button" className="staff-attendance__primary" disabled={!pick || busy === row.offer_id} onClick={() => act(row.offer_id, () => assignStaffCover(row.offer_id, pick))}>{tt('queue.assign')}</button>
            </div>}
          </article>
        })}
      </section>}
      {data && data.claims.length > 0 && <section className="staff-attendance__subpanel" aria-label={tt('queue.claims')}>
        <h2>{tt('queue.claims')}</h2>
        {data.claims.map((row) => <article className="staff-attendance__shift" key={row.id}>
          <div className="staff-attendance__shift-main">
            <strong>{tt('queue.claimLine', { claimant: row.claimant_name, person: row.person_name })}</strong>
            <span>{span(row.local_date, row.start_at, row.end_at, locale)} · {row.team_name}</span>
          </div>
          {row.can_decide && <div className="staff-attendance__actions">
            <button type="button" disabled={busy === row.id} onClick={() => act(row.id, () => decideStaffClaim(row.id, false))}>{tt('queue.decline')}</button>
            <button type="button" className="staff-attendance__primary" disabled={busy === row.id} onClick={() => act(row.id, () => decideStaffClaim(row.id, true))}>{tt('queue.confirm')}</button>
          </div>}
        </article>)}
      </section>}
      {data && data.absences.length > 0 && <section className="staff-attendance__subpanel" aria-label={tt('queue.absences')}>
        <h2>{tt('queue.absences')}</h2>
        {data.absences.map((row) => <article className="staff-attendance__shift" key={row.id}>
          <div className="staff-attendance__shift-main">
            <strong>{row.person_name} · {tt(`kind.${row.kind}` as StaffCoverKey)}</strong>
            <span>{span(row.local_date, row.start_at, row.end_at, locale)} · {row.team_name}</span>
            {row.reason && <span className="staff-attendance__muted">{row.reason}</span>}
            {rejecting === row.id && <label className="staff-cover__inline">{tt('queue.rejectReason')}
              <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            </label>}
          </div>
          {row.can_decide && <div className="staff-attendance__actions">
            {rejecting === row.id
              ? <button type="button" disabled={busy === row.id} onClick={() => act(row.id, () => decideStaffAbsence(row.id, false, reason))}>{tt('queue.rejectConfirm')}</button>
              : <button type="button" onClick={() => { setRejecting(row.id); setReason('') }}>{tt('queue.reject')}</button>}
            <button type="button" className="staff-attendance__primary" disabled={busy === row.id} onClick={() => act(row.id, () => decideStaffAbsence(row.id, true))}>{tt('queue.approve')}</button>
          </div>}
        </article>)}
      </section>}
      {data && data.sick.length > 0 && <section className="staff-attendance__subpanel" aria-label={tt('queue.sick')}>
        <h2>{tt('queue.sick')}</h2>
        {data.sick.map((row) => <article className="staff-attendance__shift" key={row.id}>
          <div className="staff-attendance__shift-main">
            <strong>{row.person_name}</strong>
            <span>{dayLabel(row.local_date, locale)} · {row.team_name}</span>
            <span className="staff-attendance__muted">{row.documented ? tt('note.attached') : tt('note.missing')}</span>
          </div>
        </article>)}
      </section>}
    </Gate>
  </section>
}

function currentMonth(): string {
  return wibToday().slice(0, 7)
}

function Count({ value, tt }: { value: number | null; tt: StaffCoverText }) {
  return value === null ? <span className="staff-attendance__muted">{tt('hr.notRecorded')}</span> : <span className="staff-cover__num">{value}</span>
}

export function HrPanel() {
  const tt = useStaffCoverText()
  const { locale } = useI18n()
  const [month, setMonth] = useState(currentMonth())
  const [teamId, setTeamId] = useState('')
  const load = useCallback(async () => {
    const first = `${month}-01`
    const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10)
    const [totals, absences] = await Promise.all([listStaffMonthlyTotals(first), listStaffAbsences(first, last)])
    return { totals, absences }
  }, [month])
  const view = useLoader<{ totals: MonthlyTotal[]; absences: HrAbsence[] }>(load)
  const teams = [...new Map((view.data?.totals ?? []).map((row) => [row.team_id, row.team_name])).entries()]
  const totals = (view.data?.totals ?? []).filter((row) => !teamId || row.team_id === teamId)
  const absences = (view.data?.absences ?? []).filter((row) => !teamId || row.team_id === teamId)
  const [error, setError] = useState('')
  async function viewNote(path: string) {
    setError('')
    try { window.open(await staffNoteUrl(path), '_blank', 'noopener') } catch { setError(tt('absence.noteError')) }
  }
  return <section className="staff-attendance__panel" aria-label={tt('hr.title')}>
    <p className="staff-attendance__muted">{tt('hr.job')}</p>
    <div className="staff-cover__filters">
      <label>{tt('hr.month')}<input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label>
      <Select label={tt('hr.team')} value={teamId} onChange={(e) => setTeamId(e.target.value)} fullWidth>
        <option value="">{tt('hr.allTeams')}</option>
        {teams.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </Select>
    </div>
    {error && <p className="staff-attendance__error" role="alert">{error}</p>}
    <Gate state={view.state} reload={view.reload} tt={tt}>
      <section className="staff-attendance__subpanel" aria-label={tt('hr.totals')}>
        <h2>{tt('hr.totals')}</h2>
        <p className="staff-attendance__muted">{tt('hr.totals.basis')}</p>
        {totals.length === 0 && <p className="staff-attendance__empty">{tt('hr.totals.empty')}</p>}
        {totals.map((row) => <article className="staff-cover__person" key={row.person_id}>
          <strong>{row.full_name}</strong><span className="staff-attendance__muted">{row.team_name}</span>
          <dl>
            <div><dt>{tt('hr.worked')}</dt><dd><Count value={row.shifts_worked} tt={tt} /></dd></div>
            <div><dt>{tt('hr.late')}</dt><dd><Count value={row.late} tt={tt} /></dd></div>
            <div><dt>{tt('hr.early')}</dt><dd><Count value={row.early_leave} tt={tt} /></dd></div>
            <div><dt>{tt('hr.sickDocumented')}</dt><dd><Count value={row.sick_documented} tt={tt} /></dd></div>
            <div><dt>{tt('hr.sickUndocumented')}</dt><dd><Count value={row.sick_undocumented} tt={tt} /></dd></div>
            <div><dt>{tt('hr.permission')}</dt><dd><Count value={row.permission} tt={tt} /></dd></div>
            <div><dt>{tt('hr.leave')}</dt><dd><Count value={row.leave} tt={tt} /></dd></div>
            <div><dt>{tt('hr.noShow')}</dt><dd><Count value={row.no_show} tt={tt} /></dd></div>
          </dl>
        </article>)}
      </section>
      <section className="staff-attendance__subpanel" aria-label={tt('hr.absences')}>
        <h2>{tt('hr.absences')}</h2>
        {absences.length === 0 && <p className="staff-attendance__empty">{tt('hr.absences.empty')}</p>}
        {absences.map((row) => <article className="staff-attendance__shift" key={row.id}>
          <div className="staff-attendance__shift-main">
            <strong>{row.person_name} · {tt(`kind.${row.kind}` as StaffCoverKey)}</strong>
            <span>{span(row.local_date, row.start_at, row.end_at, locale)} · {row.team_name}</span>
            <span><StatusBadge status={row.status} tt={tt} />{row.flagged && <span className="staff-attendance__badge">{tt('flag.sameDay')}</span>}</span>
            {row.kind === 'sick' && <span className="staff-attendance__muted">{row.documented ? tt('note.attached') : tt('note.missing')}</span>}
          </div>
          {row.note_path && <div className="staff-attendance__actions"><button type="button" onClick={() => viewNote(row.note_path as string)}>{tt('hr.viewNote')}</button></div>}
        </article>)}
      </section>
    </Gate>
  </section>
}
