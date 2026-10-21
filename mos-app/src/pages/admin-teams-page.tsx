// AdminTeamsPage — Admin Settings › Teams. Each Team with its stream (when it is one), active
// member count, designated lead, and physical Site. Changes save at once and report beside the row, the same
// grammar as every row in the person panel. There is no per-row Save, so nothing chosen can be
// left unsaved by navigating away.

import { GroupHeader } from '@/components/ui/group-header'
import { useCallback, useEffect, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { Picker } from '@/components/ui/picker'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { SortButton, type SortDir } from '@/components/admin/sort-button'
import { useSearchParamState } from '@/lib/use-search-param-state'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsOffline } from '@/shell/use-is-offline'
import { OfflineNotice } from '@/components/ui/offline-notice'
import { AdminSettingsNav } from '@/components/admin/admin-settings-nav'
import { RowStatus } from '@/components/admin/row-status'
import { useRowCommits, type RowCommitStatus } from '@/components/admin/use-row-commits'
import { listTeamLeadAssignments, listTeamLeadCandidates, saveTeamLeadAssignment } from '@/lib/db/admin-access'
import { listAttendanceAdminDirectory, saveAttendanceTeamSite, type AttendanceSite } from '@/lib/db/staff-attendance'
import { listTeams } from '@/lib/db/admin-users'
import type { TeamLeadAssignment, TeamLeadCandidate } from '@/lib/db/admin-access.types'
import { teamStreamLabel, type TeamOption } from '@/lib/db/admin-users.types'
import './admin-teams-page.css'

type LoadState = 'loading' | 'loaded' | 'error'

interface CandidateState {
  status: LoadState
  candidates: TeamLeadCandidate[]
}

export function AdminTeamsPage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('admin.teamsPage.title') }))
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [assignments, setAssignments] = useState<TeamLeadAssignment[]>([])
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([])
  const [sites, setSites] = useState<AttendanceSite[]>([])
  const [teamSites, setTeamSites] = useState<Record<string, string>>({})
  const [candidates, setCandidates] = useState<Record<string, CandidateState>>({})
  const commits = useRowCommits<string>()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const offline = useIsOffline()
  // Sort lives in the URL: "team" / "members", "-" for descending. Default is the Team name, A to Z.
  const [sortParam, setSortParam] = useSearchParamState('sort', 'team')
  const sortKey: 'team' | 'members' = sortParam.replace(/^-/, '') === 'members' ? 'members' : 'team'
  const sortDir: SortDir = sortParam.startsWith('-') ? 'desc' : 'asc'
  const sortBy = (key: 'team' | 'members') => setSortParam(`${key === sortKey && sortDir === 'asc' ? '-' : ''}${key}`)

  const loadCandidates = useCallback(async (teamId: string) => {
    setCandidates((current) => ({ ...current, [teamId]: { status: 'loading', candidates: current[teamId]?.candidates ?? [] } }))
    try {
      const list = await listTeamLeadCandidates(teamId)
      setCandidates((current) => ({ ...current, [teamId]: { status: 'loaded', candidates: list } }))
    } catch {
      setCandidates((current) => ({ ...current, [teamId]: { status: 'error', candidates: current[teamId]?.candidates ?? [] } }))
    }
  }, [])

  const load = useCallback(async () => {
    setLoadState('loading')
    try {
      const assignmentsPromise = listTeamLeadAssignments()
      const directoryPromise = listAttendanceAdminDirectory()
      // Stream labels only; a failure here must not cost the admin the leads themselves.
      const optionsPromise = listTeams().catch(() => [] as TeamOption[])
      const rows = await assignmentsPromise
      setAssignments(rows)
      // Candidate reads depend on the assignments alone — fan out before the optional labels and
      // Site directory settle (#1359). The roster waits so groups do not jump after first paint.
      const candidatesPromise = Promise.all(rows.map((row) => loadCandidates(row.team_id)))
      const directory = await directoryPromise
      setSites(directory.sites)
      setTeamSites(Object.fromEntries(directory.teams.map((team) => [team.id, team.site_id ?? ''])))
      setTeamOptions(await optionsPromise)
      await candidatesPromise
      setLoadState('loaded')
    } catch {
      setLoadState('error')
    }
  }, [loadCandidates])

  useEffect(() => { void load() }, [load])

  function chooseSite(assignment: TeamLeadAssignment, siteId: string) {
    const key = `site:${assignment.team_id}`
    const saved = teamSites[assignment.team_id] ?? ''
    void commits.commit(key, siteId, saved,
      async () => {
        await saveAttendanceTeamSite(assignment.team_id, siteId || null)
        setTeamSites((current) => ({ ...current, [assignment.team_id]: siteId }))
      },
      async () => {
        const directory = await listAttendanceAdminDirectory()
        setSites(directory.sites)
        setTeamSites(Object.fromEntries(directory.teams.map((team) => [team.id, team.site_id ?? ''])))
      },
    )
  }

  function chooseLead(assignment: TeamLeadAssignment, leadId: string) {
    const teamId = assignment.team_id
    const saved = assignment.lead_person_id ?? ''
    void commits.commit(`lead:${teamId}`, leadId, saved, async () => {
      try {
        await saveTeamLeadAssignment(teamId, leadId || null)
      } catch (error) {
        // The response may be lost after the save committed: show the lead the server holds.
        const rows = await listTeamLeadAssignments().catch(() => null)
        if (rows) setAssignments(rows)
        throw error
      }
      const lead = (candidates[teamId]?.candidates ?? []).find((c) => c.person_id === leadId)
      setAssignments((current) => current.map((row) => row.team_id === teamId
        ? { ...row, lead_person_id: leadId || null, lead_name: lead?.full_name ?? null }
        : row))
    })
  }

  const frameState = loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error' : 'default'
  const streamOf = new Map(teamOptions.map((team) => [team.id, teamStreamLabel(team)]))

  return (
    <PageFamilyFrame
      family="management"
      title={t('admin.teamsPage.title')}
      jobSentence={t('admin.teamsPage.job')}
      state={frameState}
    >
      <AdminSettingsNav />
      <OfflineNotice />

      {loadState === 'loading' && <LoadingShell count={6} label={t('admin.teamsPage.loading')} />}
      {loadState === 'error' && <ErrorState message={t('admin.teamsPage.loadError')} onRetry={load} />}

      {loadState === 'loaded' && (
        <section className="teams-roster" aria-label={t('admin.teamsPage.title')}>
          {assignments.length > 0 && <div className="admin-teams__phone-bar">
            <p className="admin-teams__saves-note">{t('admin.teamsPage.savesNote')}</p>
            <Select label={t('admin.people.sort.label')} value={`${sortDir === 'desc' ? '-' : ''}${sortKey}`} onChange={(event) => setSortParam(event.target.value)} fullWidth>
              <option value="team">{t('admin.teamsPage.sort.teamAsc')}</option>
              <option value="-team">{t('admin.teamsPage.sort.teamDesc')}</option>
              <option value="-members">{t('admin.teamsPage.sort.membersDesc')}</option>
              <option value="members">{t('admin.teamsPage.sort.membersAsc')}</option>
            </Select>
          </div>}
          {assignments.length === 0 ? (
            <EmptyState variant="blank" title={t('admin.access.teamEmptyTitle')} copy={t('admin.access.teamEmptyCopy')} />
          ) : <>
            {(['needs-site', 'needs-lead', 'no-members', 'assigned'] as const).map((group) => {
              const rows = assignments.filter((row) => groupOf(row, candidates, teamSites) === group).sort((a, b) => {
                const sign = sortDir === 'desc' ? -1 : 1
                const byName = a.team_name.localeCompare(b.team_name)
                if (sortKey === 'members') return sign * ((candidates[a.team_id]?.candidates.length ?? 0) - (candidates[b.team_id]?.candidates.length ?? 0)) || byName
                return sign * byName
              })
              if (group !== 'needs-lead' && group !== 'needs-site' && rows.length === 0) return null
              const title = group === 'needs-site' ? t('admin.teamsPage.needsSite') : group === 'needs-lead' ? t('admin.teamsPage.needsLead') : group === 'no-members' ? t('admin.teamsPage.noMembers') : t('admin.access.teamTitle')
              const open = !collapsed.has(group)
              return <section className={`teams-group teams-group--${group}`} key={group} aria-label={title}>
                <GroupHeader
                  className="teams-group__head"
                  level={2}
                  label={title}
                  count={rows.length}
                  open={open}
                  controlsId={`teams-${group}-body`}
                  onToggle={() => setCollapsed((current) => { const next = new Set(current); if (next.has(group)) next.delete(group); else next.add(group); return next })}
                />
                <div id={`teams-${group}-body`} role="table" aria-label={title} hidden={!open}>
                <div className="admin-teams__header" role="row">
                  <span role="columnheader" aria-sort={sortKey === 'team' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}><SortButton dir={sortKey === 'team' ? sortDir : null} onClick={() => sortBy('team')}>{t('admin.teamsPage.col.team')}</SortButton></span><span role="columnheader">{t('admin.teamsPage.col.stream')}</span><span role="columnheader">{t('admin.teamsPage.col.lead')}</span><span role="columnheader">{t('admin.teamsPage.col.site')}</span><span role="columnheader"><span className="sr-only">{t('admin.teamsPage.col.status')}</span></span><span role="columnheader" className="admin-teams__num" aria-sort={sortKey === 'members' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}><SortButton dir={sortKey === 'members' ? sortDir : null} onClick={() => sortBy('members')}>{t('admin.teamsPage.col.members')}</SortButton></span>
                </div>
                <div role="rowgroup">
                  {rows.map((assignment) => <TeamRow
                    key={assignment.team_id} assignment={assignment} stream={streamOf.get(assignment.team_id)}
                    candidateState={candidates[assignment.team_id] ?? { status: 'loading', candidates: [] }}
                    value={commits.display(`lead:${assignment.team_id}`, assignment.lead_person_id ?? '')}
                    status={commits.status(`lead:${assignment.team_id}`, assignment.lead_person_id ?? '')}
                    error={commits.error(`lead:${assignment.team_id}`)}
                    onChoose={(leadId) => chooseLead(assignment, leadId)}
                    siteId={commits.display(`site:${assignment.team_id}`, teamSites[assignment.team_id] ?? '')}
                    siteStatus={commits.status(`site:${assignment.team_id}`, teamSites[assignment.team_id] ?? '')}
                    siteError={commits.error(`site:${assignment.team_id}`)} sites={sites} offline={offline}
                    onChooseSite={(siteId) => chooseSite(assignment, siteId)}
                    onRetrySite={() => void commits.retry(`site:${assignment.team_id}`)}
                    onRetry={() => void commits.retry(`lead:${assignment.team_id}`)}
                    onRetryCandidates={() => void loadCandidates(assignment.team_id)}
                  />)}
                </div>
                </div>
              </section>
            })}
          </>}
        </section>
      )}
    </PageFamilyFrame>
  )
}

/** Keep Teams without a Site visible first; otherwise group by lead availability. */
function groupOf(row: TeamLeadAssignment, candidates: Record<string, CandidateState>, teamSites: Record<string, string>): 'needs-site' | 'needs-lead' | 'no-members' | 'assigned' {
  if (!teamSites[row.team_id]) return 'needs-site'
  if (row.lead_person_id) return 'assigned'
  const state = candidates[row.team_id]
  return state?.status === 'loaded' && state.candidates.length === 0 ? 'no-members' : 'needs-lead'
}

function TeamRow({ assignment, stream, candidateState, value, status, error, siteId, siteStatus, siteError, sites, offline, onChoose, onChooseSite, onRetrySite, onRetry, onRetryCandidates }: {
  assignment: TeamLeadAssignment
  stream: string | undefined
  candidateState: CandidateState
  value: string
  status: RowCommitStatus | undefined
  error: string | undefined
  siteId: string
  siteStatus: RowCommitStatus | undefined
  siteError: string | undefined
  sites: AttendanceSite[]
  offline: boolean
  onChoose: (leadId: string) => void
  onChooseSite: (siteId: string) => void
  onRetrySite: () => void
  onRetry: () => void
  onRetryCandidates: () => void
}) {
  const t = useT()
  const { candidates } = candidateState
  // A lead who has since left the Team still shows as the current value until it is changed.
  const current = assignment.lead_person_id && assignment.lead_name
    ? { person_id: assignment.lead_person_id, full_name: assignment.lead_name }
    : null
  const options = current && !candidates.some((c) => c.person_id === current.person_id) ? [current, ...candidates] : candidates
  const loaded = candidateState.status === 'loaded'
  const hasCandidate = loaded && options.length > 0
  const count = candidates.length

  return (
    <div className="admin-teams__row" role="row" data-team-lead-row>
      <div className="admin-teams__name" role="cell">
        <span className="admin-teams__team">{assignment.team_name}</span>
      </div>
      <div className="admin-teams__stream" role="cell">{stream}</div>
      <div className="admin-teams__lead" role="cell">
        <span className="admin-teams__phone-label">{t('admin.teamsPage.col.lead')}</span>
        <Picker
          label={t('admin.teamsPage.leadLabel', { team: assignment.team_name })}
          hideLabel
          fullWidth
          value={value}
          placeholder={t('admin.teamsPage.chooseLead')}
          options={[
            { value: '', label: t('admin.teamsPage.chooseLead') },
            { value: '__no_lead__', label: t('admin.access.noLead') },
            ...options.map((c) => ({ value: c.person_id, label: c.full_name })),
          ]}
          busy={candidateState.status === 'loading'}
          error={candidateState.status === 'error'}
          disabled={!hasCandidate || status === 'saving' || offline}
          onChange={(leadId) => onChoose(leadId === '__no_lead__' ? '' : leadId)}
        />
        {loaded && !hasCandidate && <p className="admin-access-note__copy">{t('admin.access.noCandidates')}</p>}
        {candidateState.status === 'error' && (
          <div className="admin-team-lead-row__candidate-error">
            <ErrorState
              message={t('admin.access.teamLoadError')}
              retryLabel={t('admin.access.teamLoadRetry', { team: assignment.team_name })}
              onRetry={onRetryCandidates}
            />
          </div>
        )}
      </div>
      <div className="admin-teams__site" role="cell">
        <span className="admin-teams__phone-label">{t('admin.teamsPage.col.site')}</span>
        <Select aria-label={t('admin.teamsPage.siteLabel', { team: assignment.team_name })} value={siteId} onChange={(event) => onChooseSite(event.target.value)} disabled={offline || siteStatus === 'saving'} fullWidth>
          <option value="">{t('admin.teamsPage.chooseSite')}</option>
          {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
        </Select>
        <RowStatus status={siteStatus} error={siteError} item={t('admin.teamsPage.siteLabel', { team: assignment.team_name })} onRetry={onRetrySite} />
      </div>
      <div className="admin-teams__status" role="cell">
        <RowStatus status={status} error={error} item={t('admin.teamsPage.leadLabel', { team: assignment.team_name })} onRetry={onRetry} />
      </div>
      <div className="admin-teams__members admin-teams__num" role="cell">
        {loaded ? <><span>{count}</span><span className="admin-teams__unit">{' '}{t(count === 1 ? 'admin.teamsPage.unit.one' : 'admin.teamsPage.unit.other')}</span></> : '—'}
      </div>
    </div>
  )
}
