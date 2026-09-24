// AdminTeamsPage — Admin Settings › Teams. Each Team with its stream (when it is one), its active
// member count and its lead. A lead is one of the Team's active members, designated explicitly and
// org-scoped by the database; choosing one here saves at once and reports beside the row, the same
// grammar as every row in the person panel. There is no per-row Save, so nothing chosen can be
// left unsaved by navigating away.

import { useCallback, useEffect, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { Picker } from '@/components/ui/picker'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { AdminSettingsNav } from '@/components/admin/admin-settings-nav'
import { RowStatus } from '@/components/admin/row-status'
import { useRowCommits, type RowCommitStatus } from '@/components/admin/use-row-commits'
import { listTeamLeadAssignments, listTeamLeadCandidates, saveTeamLeadAssignment } from '@/lib/db/admin-access'
import { listTeams } from '@/lib/db/admin-users'
import type { TeamLeadAssignment, TeamLeadCandidate } from '@/lib/db/admin-access.types'
import { teamStreamLabel, type TeamOption } from '@/lib/db/admin-users.types'
import './admin-access-page.css'

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
  const [candidates, setCandidates] = useState<Record<string, CandidateState>>({})
  const commits = useRowCommits<string>()

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
      const [rows, options] = await Promise.all([
        listTeamLeadAssignments(),
        // Stream labels only; a failure here must not cost the admin the leads themselves.
        listTeams().catch(() => [] as TeamOption[]),
      ])
      setAssignments(rows)
      setTeamOptions(options)
      setLoadState('loaded')
      void Promise.all(rows.map((row) => loadCandidates(row.team_id)))
    } catch {
      setLoadState('error')
    }
  }, [loadCandidates])

  useEffect(() => { void load() }, [load])

  function chooseLead(assignment: TeamLeadAssignment, leadId: string) {
    const teamId = assignment.team_id
    const saved = assignment.lead_person_id ?? ''
    void commits.commit(`lead:${teamId}`, leadId, saved, async () => {
      await saveTeamLeadAssignment(teamId, leadId || null)
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

      {loadState === 'loading' && <LoadingShell count={6} label={t('admin.teamsPage.loading')} />}
      {loadState === 'error' && <ErrorState message={t('admin.teamsPage.loadError')} onRetry={load} />}

      {loadState === 'loaded' && (
        <section className="admin-access-panel" aria-labelledby="admin-teams-heading">
          <div className="admin-access-panel__head">
            <div>
              <h2 id="admin-teams-heading" className="admin-access-panel__title">{t('admin.access.teamTitle')}</h2>
              <p className="admin-access-panel__copy">{t('admin.teamsPage.helper')}</p>
            </div>
          </div>
          {assignments.length === 0 ? (
            <div className="admin-access-empty">
              <EmptyState nested variant="blank" title={t('admin.access.teamEmptyTitle')} copy={t('admin.access.teamEmptyCopy')} />
            </div>
          ) : (
            <div className="admin-teams">
              <div className="admin-teams__header" aria-hidden="true">
                <span>{t('admin.teamsPage.col.team')}</span>
                <span>{t('admin.teamsPage.col.members')}</span>
                <span>{t('admin.teamsPage.col.lead')}</span>
              </div>
              <div role="list">
                {assignments.map((assignment) => (
                  <TeamRow
                    key={assignment.team_id}
                    assignment={assignment}
                    stream={streamOf.get(assignment.team_id)}
                    candidateState={candidates[assignment.team_id] ?? { status: 'loading', candidates: [] }}
                    value={commits.display(`lead:${assignment.team_id}`, assignment.lead_person_id ?? '')}
                    status={commits.status(`lead:${assignment.team_id}`)}
                    error={commits.error(`lead:${assignment.team_id}`)}
                    onChoose={(leadId) => chooseLead(assignment, leadId)}
                    onRetry={() => void commits.retry(`lead:${assignment.team_id}`)}
                    onRetryCandidates={() => void loadCandidates(assignment.team_id)}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </PageFamilyFrame>
  )
}

function TeamRow({ assignment, stream, candidateState, value, status, error, onChoose, onRetry, onRetryCandidates }: {
  assignment: TeamLeadAssignment
  stream: string | undefined
  candidateState: CandidateState
  value: string
  status: RowCommitStatus | undefined
  error: string | undefined
  onChoose: (leadId: string) => void
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
    <div className="admin-teams__row" role="listitem" data-team-lead-row>
      <div className="admin-teams__name">
        <span className="admin-teams__team">{assignment.team_name}</span>
        {stream && <span className="admin-teams__stream">{stream}</span>}
      </div>
      <div className="admin-teams__members">
        {loaded ? t(count === 1 ? 'admin.teamsPage.members.one' : 'admin.teamsPage.members.other', { count }) : '—'}
      </div>
      <div className="admin-teams__lead">
        <Picker
          label={t('admin.teamsPage.leadLabel', { team: assignment.team_name })}
          hideLabel
          fullWidth
          value={value}
          options={[
            { value: '', label: t('admin.access.noLead') },
            ...options.map((c) => ({ value: c.person_id, label: c.full_name })),
          ]}
          busy={candidateState.status === 'loading'}
          error={candidateState.status === 'error'}
          disabled={!hasCandidate || status === 'saving'}
          onChange={onChoose}
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
      <div className="admin-teams__status">
        <RowStatus status={status} error={error} item={t('admin.teamsPage.leadLabel', { team: assignment.team_name })} onRetry={onRetry} />
      </div>
    </div>
  )
}
