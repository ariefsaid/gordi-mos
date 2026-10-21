import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { useStaffCoverText } from '@/i18n/staff-cover'
import { useAuth } from '@/auth/use-auth'
import { AbsencePanel, CoverPanel, HrPanel, RequestsPanel } from '@/components/staff-attendance/staff-cover-panels'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { listLedStaffTeams, type LedStaffTeam } from '@/lib/db/staff-attendance'
import { ClockPanel } from '@/components/staff-attendance/clock-panel'
import { AttendanceTodayPanel } from '@/components/staff-attendance/attendance-today-panel'
import { MyShiftsPanel, StaffRosterPanel, StandingHoursPanel } from '@/components/staff-attendance/staff-shift-panels'
import './staff-shifts-page.css'

type PageState = 'loading' | 'ready' | 'error'
type View = 'mine' | 'clock' | 'today' | 'roster' | 'standing' | 'absence' | 'cover' | 'requests' | 'hr'

export function StaffShiftsPage() {
  const t = useT()
  const tt = useStaffCoverText()
  const auth = useAuth()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const roles = viewer?.accessRoles ?? []
  const reads = roles.includes('hr') || roles.includes('admin')
  useDocumentTitle(t('common.docTitle', { page: t('nav.work.shifts') }))
  const [state, setState] = useState<PageState>('loading')
  const [teams, setTeams] = useState<LedStaffTeam[]>([])
  const [params] = useSearchParams()
  const [view, setView] = useState<View>(params.get('view') === 'clock' ? 'clock' : 'mine')
  const load = useCallback(async () => {
    setState('loading')
    try {
      setTeams(await listLedStaffTeams())
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])
  useEffect(() => { void load() }, [load])

  return (
    <PageFamilyFrame family="management" title={t('attendance.mine.title')} jobSentence={t('attendance.mine.job')} state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'default'}>
      {state === 'loading' && <LoadingShell count={3} label={t('attendance.mine.loading')} />}
      {state === 'error' && <ErrorState message={t('attendance.mine.loadError')} onRetry={load} />}
      {state === 'ready' && <>
        <nav className="staff-shifts__tabs" aria-label={t('attendance.nav.aria')}>
          <button type="button" aria-pressed={view === 'mine'} onClick={() => setView('mine')}>{t('attendance.nav.mine')}</button>
          <button type="button" aria-pressed={view === 'clock'} onClick={() => setView('clock')}>{t('attendance.nav.clock')}</button>
          {teams.length > 0 && <>
            <button type="button" aria-pressed={view === 'today'} onClick={() => setView('today')}>{t('attendance.nav.today')}</button>
            <button type="button" aria-pressed={view === 'roster'} onClick={() => setView('roster')}>{t('attendance.nav.roster')}</button>
            <button type="button" aria-pressed={view === 'standing'} onClick={() => setView('standing')}>{t('attendance.nav.standing')}</button>
          </>}
          <button type="button" aria-pressed={view === 'absence'} onClick={() => setView('absence')}>{tt('tab.absence')}</button>
          <button type="button" aria-pressed={view === 'cover'} onClick={() => setView('cover')}>{tt('tab.cover')}</button>
          {(teams.length > 0 || reads) && <button type="button" aria-pressed={view === 'requests'} onClick={() => setView('requests')}>{tt('tab.requests')}</button>}
          {(teams.length > 0 || reads) && <button type="button" aria-pressed={view === 'hr'} onClick={() => setView('hr')}>{tt('tab.hr')}</button>}
        </nav>
        {view === 'absence' && viewer && <AbsencePanel orgId={viewer.person.org_id} />}
        {view === 'cover' && <CoverPanel />}
        {view === 'requests' && <RequestsPanel />}
        {view === 'hr' && <HrPanel />}
        {view === 'mine' && <MyShiftsPanel />}
        {view === 'clock' && <ClockPanel />}
        {view === 'today' && teams.length > 0 && <AttendanceTodayPanel teams={teams} />}
        {view === 'roster' && teams.length > 0 && <StaffRosterPanel teams={teams} />}
        {view === 'standing' && teams.length > 0 && <StandingHoursPanel teams={teams} />}
      </>}
    </PageFamilyFrame>
  )
}
