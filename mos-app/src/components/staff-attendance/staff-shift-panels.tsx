import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useI18n } from '@/i18n/I18nProvider'
import { useT } from '@/i18n/use-t'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { Select } from '@/components/ui/select'
import {
  copyStaffRoster, getStaffRoster, listMyStaffShifts, listStaffSiteTemplates, listStaffStandingHours,
  publishStaffRoster, removeStaffShift, saveStaffShift, saveStandingHours,
  type LedStaffTeam, type StaffRoster, type StaffShift, type StandingRule, type StandingSchedule, type ShiftTemplate,
} from '@/lib/db/staff-attendance'
import { formatDay, formatTime, todayInJakarta } from './attendance-format'
import './staff-shift-panels.css'

type FetchState = 'loading' | 'ready' | 'error'
type Translate = ReturnType<typeof useT>

function mondayOf(date: string): string {
  const day = new Date(`${date}T12:00:00Z`)
  const offset = (day.getUTCDay() + 6) % 7
  day.setUTCDate(day.getUTCDate() - offset)
  return day.toISOString().slice(0, 10)
}

function moveWeek(weekStart: string, weeks: number): string {
  const date = new Date(`${weekStart}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + weeks * 7)
  return date.toISOString().slice(0, 10)
}

function moveDate(dateValue: string, days: number): string {
  const date = new Date(`${dateValue}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function formatWeek(weekStart: string, locale: string): string {
  const end = moveWeek(weekStart, 1)
  const endDate = new Date(`${end}T12:00:00Z`)
  endDate.setUTCDate(endDate.getUTCDate() - 1)
  const formatter = new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' })
  const startDate = new Date(`${weekStart}T12:00:00+07:00`)
  return `${formatter.format(startDate)} – ${formatter.format(endDate)}`
}

function errorText(t: Translate, error: unknown): string {
  const token = error instanceof Error ? error.message : ''
  if (token === 'STAFF_SHIFT_OVERLAP' || token === 'STAFF_STANDING_CONFLICT') return t('attendance.error.overlap')
  if (token === 'STAFF_SHIFT_PERSON_NOT_MEMBER') return t('attendance.error.notMember')
  if (token === 'STAFF_TEAM_STANDING_HOURS') return t('attendance.error.standing')
  if (token === 'STAFF_STANDING_DEFAULT_REQUIRED') return t('attendance.error.standingDefaultRequired')
  if (token === 'STAFF_TEAM_SITE_REQUIRED') return t('attendance.error.siteRequired')
  if (token === 'STAFF_COPY_SOURCE_UNAVAILABLE') return t('attendance.error.copyUnavailable')
  if (token === 'STAFF_COPY_TARGET_EXISTS') return t('attendance.error.copyExists')
  return t('attendance.error.generic')
}

function weekControls(weekStart: string, setWeekStart: (value: string) => void, locale: string, t: Translate) {
  return <div className="staff-attendance__week"><button type="button" aria-label={t('attendance.week.previous')} onClick={() => setWeekStart(moveWeek(weekStart, -1))}>‹</button><strong>{formatWeek(weekStart, locale)}</strong><button type="button" aria-label={t('attendance.week.next')} onClick={() => setWeekStart(moveWeek(weekStart, 1))}>›</button></div>
}

function ShiftCard({ shift, locale, t, scope, actions, inDay }: { shift: StaffShift; locale: string; t: Translate; scope?: StaffRoster; actions?: ReactNode; inDay?: boolean }) {
  return <article className={inDay ? 'staff-attendance__shift staff-attendance__shift--in-day' : 'staff-attendance__shift'}>
    <div className="staff-attendance__shift-main">
      {!inDay && <strong>{formatDay(shift.local_date, locale)}</strong>}
      {inDay && scope && shift.person_name && <strong>{shift.person_name}</strong>}
      <span className="staff-attendance__time">{formatTime(shift.start_at, locale)}–{formatTime(shift.end_at, locale)} WIB</span>
      {!(inDay && scope) && <span>{shift.team_name} · {shift.site_name}</span>}
      {!(inDay && scope) && shift.person_name && <span>{shift.person_name}</span>}
      {shift.crew && shift.crew.length > 0 && <span className="staff-attendance__muted">{t('attendance.shift.crew')}: {shift.crew.join(', ')}</span>}
      {shift.template_name === 'Standing shift' && <span className="staff-attendance__badge">{t('attendance.shift.standing')}</span>}
    </div>
    {actions && <div className="staff-attendance__actions">{actions}</div>}
  </article>
}

export function MyShiftsPanel() {
  const t = useT()
  const { locale } = useI18n()
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayInJakarta()))
  const [state, setState] = useState<FetchState>('loading')
  const [shifts, setShifts] = useState<StaffShift[]>([])
  const load = useCallback(async () => {
    setState('loading')
    try { setShifts(await listMyStaffShifts(weekStart)); setState('ready') }
    catch { setState('error') }
  }, [weekStart])
  useEffect(() => { void load() }, [load])
  if (state === 'loading') return <LoadingShell count={4} label={t('attendance.mine.loading')} />
  if (state === 'error') return <ErrorState message={t('attendance.mine.loadError')} onRetry={load} />
  return <section className="staff-attendance__panel" aria-label={t('attendance.mine.title')}>
    <div className="staff-attendance__toolbar">{weekControls(weekStart, setWeekStart, locale, t)}<span>{t('attendance.mine.timezone')}</span></div>
    {shifts.length === 0 && <p className="staff-attendance__empty">{t('attendance.mine.emptyWeek')}</p>}
    {shifts.length > 0 && <div className="staff-attendance__days-list">{Array.from({ length: 7 }, (_, index) => moveDate(weekStart, index)).map((date) => {
      const dayShifts = shifts.filter((shift) => shift.local_date === date)
      if (dayShifts.length === 0) return <p className="staff-attendance__day staff-attendance__day--rest" key={date}><span>{formatDay(date, locale)}</span><span>{t('attendance.mine.restDay')}</span></p>
      return <section className="staff-attendance__day" key={date}><h2>{formatDay(date, locale)}</h2>{dayShifts.map((shift, index) => <ShiftCard key={`${shift.team_id}-${shift.start_at}-${index}`} shift={shift} locale={locale} t={t} inDay />)}</section>
    })}</div>}
  </section>
}

export function StaffRosterPanel({ teams }: { teams: LedStaffTeam[] }) {
  const t = useT()
  const { locale } = useI18n()
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '')
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayInJakarta()))
  const [state, setState] = useState<FetchState>('loading')
  const [roster, setRoster] = useState<StaffRoster | null>(null)
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [localDate, setLocalDate] = useState(weekStart)
  const [personId, setPersonId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [editing, setEditing] = useState<StaffShift | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const team = teams.find((item) => item.id === teamId) ?? null

  const load = useCallback(async () => {
    if (!team) { setState('ready'); setRoster(null); setTemplates([]); return }
    setState('loading')
    try {
      const nextRoster = await getStaffRoster(team.id, weekStart)
      const nextTemplates = nextRoster.site_id ? await listStaffSiteTemplates(nextRoster.site_id) : []
      setRoster(nextRoster)
      setTemplates(nextTemplates.filter((item) => item.archived_at === null))
      setPersonId((current) => nextRoster.members.some((member) => member.person_id === current) ? current : nextRoster.members[0]?.person_id ?? '')
      setTemplateId((current) => nextTemplates.some((item) => item.id === current && item.archived_at === null) ? current : nextTemplates.find((item) => item.archived_at === null)?.id ?? '')
      setLocalDate(weekStart)
      setEditing(null)
      setError('')
      setState('ready')
    } catch {
      setState('error')
    }
  }, [team, weekStart])
  useEffect(() => { void load() }, [load])

  async function saveShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!team || !personId || !templateId) return
    if (!editing && mondayOf(localDate) !== weekStart) { setError(t('attendance.roster.dateInvalid')); return }
    setError(''); setNotice('')
    try {
      await saveStaffShift(team.id, personId, editing?.local_date ?? localDate, templateId, editing?.id ?? null)
      setNotice(t('attendance.roster.saved'))
      await load()
    } catch (reason) { setError(errorText(t, reason)) }
  }

  async function removeShift(shift: StaffShift) {
    if (!shift.id || !window.confirm(t('attendance.roster.removeConfirm', { person: shift.person_name ?? '' }))) return
    setError(''); setNotice('')
    try { await removeStaffShift(shift.id); setNotice(t('attendance.roster.removed')); await load() }
    catch (reason) { setError(errorText(t, reason)) }
  }

  async function copyWeek() {
    if (!team) return
    setError(''); setNotice('')
    try {
      const count = await copyStaffRoster(team.id, weekStart)
      setNotice(t('attendance.roster.copied', { count }))
      await load()
    } catch (reason) { setError(errorText(t, reason)) }
  }

  async function publishWeek() {
    if (!team || !roster) return
    setError(''); setNotice('')
    try {
      const count = await publishStaffRoster(team.id, weekStart)
      setNotice(t('attendance.roster.published', { count }))
      await load()
    } catch (reason) { setError(errorText(t, reason)) }
  }

  function startEdit(shift: StaffShift) {
    setEditing(shift); setPersonId(shift.person_id ?? ''); setTemplateId(shift.template_id ?? ''); setLocalDate(shift.local_date)
  }

  if (state === 'loading') return <LoadingShell count={5} label={t('attendance.roster.loading')} />
  if (state === 'error') return <ErrorState message={t('attendance.roster.loadError')} onRetry={load} />
  if (!team) return <p className="staff-attendance__empty">{t('attendance.roster.noTeams')}</p>
  const isPublished = roster?.status === 'published'
  return <section className="staff-attendance__panel" aria-label={t('attendance.roster.title')}>
    <div className="staff-attendance__toolbar"><Select className="staff-attendance__select-label" label={t('attendance.roster.team')} value={teamId} onChange={(event) => setTeamId(event.target.value)} fullWidth>{teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>{weekControls(weekStart, setWeekStart, locale, t)}</div>
    {!(roster?.site_id ?? team.site_id) ? <p className="staff-attendance__empty">{t('attendance.roster.siteRequired')}</p> : <>
      <div className="staff-attendance__status"><strong>{team.name} · {roster?.site_name ?? team.site_name ?? t('attendance.roster.site')}</strong><span className={isPublished ? 'staff-attendance__badge staff-attendance__badge--published' : 'staff-attendance__badge'}>{t(isPublished ? 'attendance.roster.publishedStatus' : 'attendance.roster.draftStatus')}</span></div>
      {templates.length === 0 ? <p className="staff-attendance__empty">{t('attendance.roster.noTemplates')}</p> : <form className="staff-attendance__form" onSubmit={(event) => void saveShift(event)}>
        <Select label={t('attendance.roster.person')} value={personId} onChange={(event) => setPersonId(event.target.value)} required fullWidth><option value="">{t('attendance.roster.choosePerson')}</option>{roster?.members.map((member) => <option key={member.person_id} value={member.person_id}>{member.full_name}</option>)}</Select>
        <label>{t('attendance.roster.date')}<input type="date" value={localDate} min={weekStart} max={moveDate(weekStart, 6)} onChange={(event) => setLocalDate(event.target.value)} required disabled={Boolean(editing)} /></label>
        <Select label={t('attendance.roster.shift')} value={templateId} onChange={(event) => setTemplateId(event.target.value)} required fullWidth><option value="">{t('attendance.roster.chooseShift')}</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.start_time.slice(0, 5)}–{template.end_time.slice(0, 5)}</option>)}</Select>
        <div className="staff-attendance__actions"><button className="staff-attendance__primary" type="submit" disabled={!(roster?.site_id ?? team.site_id)}>{t(editing ? 'attendance.roster.saveEdit' : 'attendance.roster.addShift')}</button>{editing && <button type="button" onClick={() => { setEditing(null); setLocalDate(weekStart) }}>{t('common.cancel')}</button>}</div>
      </form>}
      <div className="staff-attendance__actions staff-attendance__roster-actions">
        <button type="button" onClick={() => void copyWeek()} disabled={!team.site_id}>{t('attendance.roster.copy')}</button>
        {!isPublished && <button type="button" className="staff-attendance__primary" disabled={!roster || roster.shifts.length === 0} onClick={() => void publishWeek()}>{t('attendance.roster.publish')}</button>}
      </div>
      {roster?.shifts.length ? <div className="staff-attendance__days-list">{Array.from(new Set(roster.shifts.map((shift) => shift.local_date))).sort().map((date) => <section className="staff-attendance__day" key={date}><h2>{formatDay(date, locale)}</h2>{roster.shifts.filter((shift) => shift.local_date === date).map((shift) => <ShiftCard key={shift.id} shift={shift} locale={locale} t={t} scope={roster} inDay actions={<><button type="button" onClick={() => startEdit(shift)}>{t('attendance.roster.edit')}</button><button type="button" className="staff-attendance__quiet" onClick={() => void removeShift(shift)}>{t('attendance.roster.remove')}</button></>} />)}</section>)}</div> : <p className="staff-attendance__empty">{t('attendance.roster.empty')}</p>}
    </>}
    {error && <p className="staff-attendance__error" role="alert">{error}</p>}{notice && <p className="staff-attendance__notice" role="status">{notice}</p>}
  </section>
}

function ruleSummary(rule: StandingRule | null, t: Translate): string {
  if (!rule) return t('attendance.standing.none')
  if (!rule.active) return t('attendance.standing.noShift')
  const names = rule.working_days.map((day) => t(`attendance.day.${day}` as Parameters<Translate>[0])).join(', ')
  return `${names} · ${rule.start_time?.slice(0, 5)}–${rule.end_time?.slice(0, 5)} WIB`
}

const DEFAULT_DAYS = [0, 1, 2, 3, 4]

export function StandingHoursPanel({ teams }: { teams: LedStaffTeam[] }) {
  const t = useT()
  const { locale } = useI18n()
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '')
  const [schedule, setSchedule] = useState<StandingSchedule | null>(null)
  const [members, setMembers] = useState<StaffRoster['members']>([])
  const [state, setState] = useState<FetchState>('loading')
  const [days, setDays] = useState<number[]>(DEFAULT_DAYS)
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('17:00')
  const [active, setActive] = useState(false)
  const [personId, setPersonId] = useState('')
  const [exceptionDays, setExceptionDays] = useState<number[]>(DEFAULT_DAYS)
  const [exceptionStart, setExceptionStart] = useState('09:00')
  const [exceptionEnd, setExceptionEnd] = useState('17:00')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const team = teams.find((item) => item.id === teamId) ?? null
  const effectiveFrom = schedule?.effective_from ?? ''

  const load = useCallback(async () => {
    if (!team) { setState('ready'); setSchedule(null); return }
    setState('loading')
    try {
      const result = await listStaffStandingHours(team.id)
      const roster = await getStaffRoster(team.id, result.effective_from)
      setSchedule(result); setMembers(roster.members)
      setDays(result.default?.working_days ?? DEFAULT_DAYS)
      setStart(result.default?.start_time?.slice(0, 5) ?? '09:00')
      setEnd(result.default?.end_time?.slice(0, 5) ?? '17:00')
      setActive(result.default?.active ?? false)
      setPersonId((current) => roster.members.some((member) => member.person_id === current) && !result.exceptions.some((rule) => rule.person_id === current) ? current : '')
      setError(''); setState('ready')
    } catch {
      setState('error')
    }
  }, [team])
  useEffect(() => { void load() }, [load])

  async function saveDefault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!team) return
    if (active && (!days.length || start === end)) { setError(t('attendance.standing.invalid')); return }
    setError(''); setNotice('')
    try { await saveStandingHours(team.id, null, active ? days : [], active ? start : null, active ? end : null, active); setNotice(t('attendance.standing.saved', { date: formatDay(effectiveFrom, locale) })); await load() }
    catch (reason) { setError(errorText(t, reason)) }
  }

  async function saveException(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!team || !personId) { setError(t('attendance.standing.choosePerson')); return }
    if (!exceptionDays.length || exceptionStart === exceptionEnd) { setError(t('attendance.standing.invalid')); return }
    setError(''); setNotice('')
    try { await saveStandingHours(team.id, personId, exceptionDays, exceptionStart, exceptionEnd, true); setNotice(t('attendance.standing.saved', { date: formatDay(effectiveFrom, locale) })); setPersonId(''); await load() }
    catch (reason) { setError(errorText(t, reason)) }
  }

  async function revertException(id: string, name: string) {
    if (!team || !window.confirm(t('attendance.standing.revertConfirm', { person: name }))) return
    setError(''); setNotice('')
    try { await saveStandingHours(team.id, id, [], null, null, null); setNotice(t('attendance.standing.reverted')); await load() }
    catch (reason) { setError(errorText(t, reason)) }
  }

  function editException(rule: StandingSchedule['exceptions'][number]) {
    setPersonId(rule.person_id); setExceptionDays(rule.working_days); setExceptionStart(rule.start_time?.slice(0, 5) ?? '09:00'); setExceptionEnd(rule.end_time?.slice(0, 5) ?? '17:00')
  }

  function toggleDay(day: number, selected: number[], setSelected: (days: number[]) => void) {
    setSelected(selected.includes(day) ? selected.filter((item) => item !== day) : [...selected, day].sort())
  }

  if (state === 'loading') return <LoadingShell count={5} label={t('attendance.standing.loading')} />
  if (state === 'error') return <ErrorState message={t('attendance.standing.loadError')} onRetry={load} />
  if (!team) return <p className="staff-attendance__empty">{t('attendance.roster.noTeams')}</p>
  const exceptions = schedule?.exceptions ?? []
  return <section className="staff-attendance__panel" aria-label={t('attendance.standing.title')}>
    <div className="staff-attendance__toolbar"><Select className="staff-attendance__select-label" label={t('attendance.roster.team')} value={teamId} onChange={(event) => setTeamId(event.target.value)} fullWidth>{teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><span>{team.site_name ?? t('attendance.roster.site')}</span></div>
    <div className="staff-attendance__effectivity"><strong>{t('attendance.standing.starts', { date: effectiveFrom ? formatDay(effectiveFrom, locale) : '' })}</strong><span>{t('attendance.standing.current')}</span><p>{t('attendance.standing.unchanged')}</p></div>
    {!team.site_id && <p className="staff-attendance__empty">{t('attendance.roster.siteRequired')}</p>}
    <section className="staff-attendance__subpanel"><h2>{t('attendance.standing.teamDefault')}</h2><p>{t('attendance.standing.defaultHelp')}</p><p className="staff-attendance__muted">{t('attendance.standing.current')}: {ruleSummary(schedule?.current_default ?? null, t)}</p>
      <form className="staff-attendance__form" onSubmit={(event) => void saveDefault(event)}>
        <label className="staff-attendance__toggle"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span>{t('attendance.standing.enable')}</span></label>
        <fieldset className="staff-attendance__days"><legend>{t('attendance.standing.days')}</legend>{[0, 1, 2, 3, 4, 5, 6].map((day) => <label key={day}><input type="checkbox" checked={days.includes(day)} disabled={!active} onChange={() => toggleDay(day, days, setDays)} /><span>{t(`attendance.day.${day}` as Parameters<Translate>[0])}</span></label>)}</fieldset>
        <div className="staff-attendance__form-grid"><label>{t('attendance.standing.start')}<input type="time" value={start} onChange={(event) => setStart(event.target.value)} required disabled={!active} /></label><label>{t('attendance.standing.end')}<input type="time" value={end} onChange={(event) => setEnd(event.target.value)} required disabled={!active} /></label></div>
        <button className="staff-attendance__primary" type="submit" disabled={!team.site_id}>{t('attendance.standing.saveDefault')}</button>
      </form>
    </section>
    <section className="staff-attendance__subpanel"><h2>{t('attendance.standing.exceptions')}</h2><p>{t('attendance.standing.exceptionHelp')}</p>
      {exceptions.length > 0 && <div className="staff-attendance__list">{exceptions.map((rule) => <article className="staff-attendance__shift" key={rule.person_id}><div className="staff-attendance__shift-main"><strong>{rule.full_name}</strong><span>{ruleSummary(rule, t)}</span></div><div className="staff-attendance__actions"><button type="button" onClick={() => editException(rule)}>{t('attendance.standing.edit')}</button><button className="staff-attendance__quiet" type="button" onClick={() => void revertException(rule.person_id, rule.full_name)}>{t('attendance.standing.revert')}</button></div></article>)}</div>}
      {exceptions.length === 0 && <p className="staff-attendance__empty">{t('attendance.standing.noExceptions')}</p>}
      <form className="staff-attendance__form" onSubmit={(event) => void saveException(event)}>
        <Select label={t('attendance.standing.person')} value={personId} onChange={(event) => setPersonId(event.target.value)} fullWidth><option value="">{t('attendance.standing.choosePerson')}</option>{members.filter((member) => member.person_id === personId || !exceptions.some((rule) => rule.person_id === member.person_id)).map((member) => <option key={member.person_id} value={member.person_id}>{member.full_name}</option>)}</Select>
        <fieldset className="staff-attendance__days"><legend>{t('attendance.standing.days')}</legend>{[0, 1, 2, 3, 4, 5, 6].map((day) => <label key={day}><input type="checkbox" checked={exceptionDays.includes(day)} onChange={() => toggleDay(day, exceptionDays, setExceptionDays)} /><span>{t(`attendance.day.${day}` as Parameters<Translate>[0])}</span></label>)}</fieldset>
        <div className="staff-attendance__form-grid"><label>{t('attendance.standing.start')}<input type="time" value={exceptionStart} onChange={(event) => setExceptionStart(event.target.value)} required /></label><label>{t('attendance.standing.end')}<input type="time" value={exceptionEnd} onChange={(event) => setExceptionEnd(event.target.value)} required /></label></div>
        <button className="staff-attendance__primary" type="submit" disabled={!team.site_id || !personId}>{t('attendance.standing.saveException')}</button>
      </form>
    </section>
    <section className="staff-attendance__subpanel"><h2>{t('attendance.standing.preview')}</h2><p>{t('attendance.standing.nextMonday')}</p>{members.map((member) => { const exception = exceptions.find((rule) => rule.person_id === member.person_id); return <p className="staff-attendance__preview" key={member.person_id}><strong>{member.full_name}</strong><span>{ruleSummary(exception ?? schedule?.default ?? null, t)}</span></p> })}</section>
    {error && <p className="staff-attendance__error" role="alert">{error}</p>}{notice && <p className="staff-attendance__notice" role="status">{notice}</p>}
  </section>
}
