import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { useStaffCoverText } from '@/i18n/staff-cover'
import { useAuth } from '@/auth/use-auth'
import { AbsencePanel, CoverPanel, HrPanel, RequestsPanel } from '@/components/staff-attendance/staff-cover-panels'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { ViewTabs } from '@/components/ui/view-tabs'
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
  useDocumentTitle(t('common.docTitle', { page: t('nav.staff.shifts') }))
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

  const tabs: Array<{ id: View; label: string }> = [
    { id: 'mine', label: t('attendance.nav.mine') },
    { id: 'clock', label: t('attendance.nav.clock') },
    ...(teams.length > 0 ? [
      { id: 'today' as const, label: t('attendance.nav.today') },
      { id: 'roster' as const, label: t('attendance.nav.roster') },
      { id: 'standing' as const, label: t('attendance.nav.standing') },
    ] : []),
    { id: 'absence', label: tt('tab.absence') },
    { id: 'cover', label: tt('tab.cover') },
    ...(teams.length > 0 || reads ? [{ id: 'requests' as const, label: tt('tab.requests') }, { id: 'hr' as const, label: tt('tab.hr') }] : []),
  ]
  const title = tabs.find((tab) => tab.id === view)?.label ?? t('attendance.mine.title')

  return (
    <PageFamilyFrame family="management" title={title} jobSentence={view === 'mine' ? t('attendance.mine.job') : undefined} state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'default'}>
      {state === 'loading' && <LoadingShell count={3} label={t('attendance.mine.loading')} />}
      {state === 'error' && <ErrorState message={t('attendance.mine.loadError')} onRetry={load} />}
      {state === 'ready' && <>
        <div className="staff-shifts__tabs">
          <ViewTabs ariaLabel={t('attendance.nav.aria')} tabs={tabs} active={view} onChange={(id) => setView(id as View)} panelId="staff-shifts-panel" idPrefix="staff-shifts-tab" />
        </div>
        <div id="staff-shifts-panel" role="tabpanel" aria-labelledby={`staff-shifts-tab-${view}`}>
        {view === 'absence' && viewer && <AbsencePanel orgId={viewer.person.org_id} />}
        {view === 'cover' && <CoverPanel />}
        {view === 'requests' && <RequestsPanel />}
        {view === 'hr' && <HrPanel />}
        {view === 'mine' && <MyShiftsPanel />}
        {view === 'clock' && <ClockPanel />}
        {view === 'today' && teams.length > 0 && <AttendanceTodayPanel teams={teams} />}
        {view === 'roster' && teams.length > 0 && <StaffRosterPanel teams={teams} />}
        {view === 'standing' && teams.length > 0 && <StandingHoursPanel teams={teams} />}
        </div>
      </>}
    </PageFamilyFrame>
  )
}
