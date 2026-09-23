import { useCallback, useEffect, useMemo, useState } from 'react'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { Button } from '@/components/ui/button'
import { Picker, type PickerOption } from '@/components/ui/picker'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { AdminSettingsNav } from '@/components/admin/admin-settings-nav'
import {
  listRoleAuthority,
  listTeamLeadAssignments,
  listTeamLeadCandidates,
  saveRoleAuthority,
  saveTeamLeadAssignment,
} from '@/lib/db/admin-access'
import {
  AUTHORITY_ACTIONS,
  AUTHORITY_ROLES,
  getAllowedScopes,
  normalizeAuthorityRows,
  type AuthorityAction,
  type AuthorityRole,
  type AuthorityScope,
  type RoleAuthorityRow,
  type TeamLeadAssignment,
  type TeamLeadCandidate,
} from '@/lib/db/admin-access.types'
import './admin-access-page.css'

const ACTION_LABEL_KEYS: Record<AuthorityAction, MessageKey> = {
  'workline.manage': 'admin.access.action.workline.manage',
  'objective.manage': 'admin.access.action.objective.manage',
  'signal.post': 'admin.access.action.signal.post',
  'signal.tag': 'admin.access.action.signal.tag',
  'signal.retract': 'admin.access.action.signal.retract',
  'process.start': 'admin.access.action.process.start',
  'process.close': 'admin.access.action.process.close',
}

const ROLE_LABEL_KEYS: Record<AuthorityRole, MessageKey> = {
  member: 'admin.access.role.member',
  team_lead: 'admin.access.role.team_lead',
  bu_head: 'admin.access.role.bu_head',
  ops_lead: 'admin.access.role.ops_lead',
  admin: 'admin.access.role.admin',
  finance: 'admin.role.finance',
  manager: 'admin.role.manager',
  supervisor: 'admin.role.supervisor',
}

const SCOPE_LABEL_KEYS: Record<AuthorityScope, MessageKey> = {
  none: 'admin.access.noAccess',
  org: 'admin.access.scope.org',
  own_bu: 'admin.access.scope.own_bu',
  own_team: 'admin.access.scope.own_team',
  own: 'admin.access.scope.own',
}

type LoadState = 'loading' | 'loaded' | 'error'
type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type CandidateLoadState = 'loading' | 'loaded' | 'error'

interface TeamCandidateState {
  status: CandidateLoadState
  candidates: TeamLeadCandidate[]
}

function authorityKey(action: AuthorityAction, role: AuthorityRole): string {
  return `${action}:${role}`
}

function authorityDraftFromRows(rows: RoleAuthorityRow[]): Record<string, AuthorityScope> {
  return Object.fromEntries(rows.map((row) => [authorityKey(row.action, row.role), row.scope]))
}

function authorityRowsFromDraft(draft: Record<string, AuthorityScope>): RoleAuthorityRow[] {
  return AUTHORITY_ACTIONS.flatMap((action) =>
    AUTHORITY_ROLES.map((role) => ({
      action,
      role,
      scope: draft[authorityKey(action, role)] ?? 'none',
    })),
  )
}

function authorityPickerOptions(action: AuthorityAction, t: ReturnType<typeof useT>): PickerOption[] {
  return getAllowedScopes(action).map((scope) => ({
    value: scope,
    label: t(SCOPE_LABEL_KEYS[scope]),
  }))
}

function AuthorityTable({
  draft,
  onChange,
  t,
  disabled,
}: {
  draft: Record<string, AuthorityScope>
  onChange: (action: AuthorityAction, role: AuthorityRole, scope: AuthorityScope) => void
  t: ReturnType<typeof useT>
  disabled: boolean
}) {
  return (
    <div className="admin-access-table-wrap">
      <table className="admin-access-table" aria-label={t('admin.access.tableLabel')}>
        <thead>
          <tr>
            <th scope="col">{t('admin.access.actionHeader')}</th>
            {AUTHORITY_ROLES.map((role) => (
              <th key={role} scope="col" className="admin-access-table__role">{t(ROLE_LABEL_KEYS[role])}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {AUTHORITY_ACTIONS.map((action) => (
            <tr key={action}>
              <th scope="row" className="admin-access-table__action">{t(ACTION_LABEL_KEYS[action])}</th>
              {AUTHORITY_ROLES.map((role) => {
                const label = `${t(ACTION_LABEL_KEYS[action])} — ${t(ROLE_LABEL_KEYS[role])}`
                return (
                  <td key={role}>
                    {role === 'admin' ? (
                      <span className="admin-access-fixed" aria-label={`${label} — ${t('admin.access.adminFixed')}`}>
                        {t('admin.access.adminFixed')}
                      </span>
                    ) : (
                      <Picker
                        label={label}
                        hideLabel
                        fullWidth
                        value={draft[authorityKey(action, role)] ?? 'none'}
                        options={authorityPickerOptions(action, t)}
                        onChange={(value) => onChange(action, role, value as AuthorityScope)}
                        disabled={disabled}
                      />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AuthorityMobileEditor({
  draft,
  role,
  onRoleChange,
  onChange,
  t,
  disabled,
}: {
  draft: Record<string, AuthorityScope>
  role: AuthorityRole
  onRoleChange: (role: AuthorityRole) => void
  onChange: (action: AuthorityAction, role: AuthorityRole, scope: AuthorityScope) => void
  t: ReturnType<typeof useT>
  disabled: boolean
}) {
  return (
    <div className="admin-access-mobile">
      <div className="admin-access-mobile__role">
        <Picker
          label={t('admin.access.mobileRole')}
          fullWidth
          value={role}
          options={AUTHORITY_ROLES.map((option) => ({ value: option, label: t(ROLE_LABEL_KEYS[option]) }))}
          onChange={(value) => onRoleChange(value as AuthorityRole)}
          disabled={disabled}
        />
      </div>
      <div className="admin-access-mobile__actions" aria-label={t('admin.access.tableLabel')}>
        {AUTHORITY_ACTIONS.map((action) => {
          const actionLabel = t(ACTION_LABEL_KEYS[action])
          return (
            <div key={action} className="admin-access-mobile__action">
              <div className="admin-access-mobile__action-name">{actionLabel}</div>
              <div className="admin-access-mobile__scope">
                {role === 'admin' ? (
                  <span className="admin-access-fixed admin-access-mobile__scope-fixed" aria-label={`${actionLabel} — ${t(ROLE_LABEL_KEYS[role])} — ${t('admin.access.adminFixed')}`}>
                    {t('admin.access.adminFixed')}
                  </span>
                ) : (
                  <Picker
                    label={`${actionLabel} — ${t(ROLE_LABEL_KEYS[role])}`}
                    hideLabel
                    fullWidth
                    value={draft[authorityKey(action, role)] ?? 'none'}
                    options={authorityPickerOptions(action, t)}
                    onChange={(value) => onChange(action, role, value as AuthorityScope)}
                    disabled={disabled}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TeamLeadRow({
  assignment,
  draftLeadId,
  candidateState,
  status,
  onChange,
  onSave,
  onRetryCandidates,
  t,
}: {
  assignment: TeamLeadAssignment
  draftLeadId: string
  candidateState: TeamCandidateState
  status: SaveState
  onChange: (leadId: string) => void
  onSave: () => void
  onRetryCandidates: () => void
  t: ReturnType<typeof useT>
}) {
  const { candidates } = candidateState
  const currentCandidate = assignment.lead_person_id && assignment.lead_name
    ? { person_id: assignment.lead_person_id, full_name: assignment.lead_name }
    : null
  const options = currentCandidate && !candidates.some((candidate) => candidate.person_id === currentCandidate.person_id)
    ? [currentCandidate, ...candidates]
    : candidates
  const label = t('admin.access.teamLeadLabel', { team: assignment.team_name })
  const saveLabel = t('admin.access.teamSave', { team: assignment.team_name })
  const dirty = draftLeadId !== (assignment.lead_person_id ?? '')
  const hasCandidate = candidateState.status === 'loaded' && options.length > 0

  return (
    <div className="admin-team-lead-row" data-team-lead-row>
      <div className="admin-team-lead-row__name">{assignment.team_name}</div>
      <div className="admin-team-lead-row__control">
        <Picker
          label={label}
          hideLabel
          fullWidth
          value={draftLeadId}
          options={[
            { value: '', label: t('admin.access.noLead') },
            ...options.map((candidate) => ({ value: candidate.person_id, label: candidate.full_name })),
          ]}
          busy={candidateState.status === 'loading'}
          error={candidateState.status === 'error'}
          disabled={!hasCandidate || status === 'saving'}
          onChange={onChange}
        />
        {candidateState.status === 'loaded' && !hasCandidate && (
          <p className="admin-access-note__copy">{t('admin.access.noCandidates')}</p>
        )}
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
      <div className="admin-team-lead-row__action">
        {status === 'saved' && (
          <span role="status" aria-label={t('admin.access.teamSaved', { team: assignment.team_name })} className="admin-team-lead-row__feedback">
            {t('admin.access.teamSaved', { team: assignment.team_name })}
          </span>
        )}
        <Button
          variant="outline"
          disabled={!dirty || status === 'saving' || !hasCandidate}
          onClick={onSave}
          aria-label={saveLabel}
        >
          {status === 'saving' ? t('admin.access.teamSaving') : t('admin.access.teamSave', { team: assignment.team_name })}
        </Button>
      </div>
      {status === 'error' && (
        <div className="admin-team-lead-row__error">
          <ErrorState
            message={t('admin.access.teamSaveError')}
            retryLabel={t('admin.access.teamRetry', { team: assignment.team_name })}
            onRetry={onSave}
          />
        </div>
      )}
    </div>
  )
}

export function AdminAccessPage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('admin.access.title') }))
  const isDesktop = useIsDesktop()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [savedAuthority, setSavedAuthority] = useState<RoleAuthorityRow[]>([])
  const [authorityDraft, setAuthorityDraft] = useState<Record<string, AuthorityScope>>({})
  const [authorityStatus, setAuthorityStatus] = useState<SaveState>('idle')
  const [mobileRole, setMobileRole] = useState<AuthorityRole>('member')
  const [teamLeads, setTeamLeads] = useState<TeamLeadAssignment[]>([])
  const [teamLeadDrafts, setTeamLeadDrafts] = useState<Record<string, string>>({})
  const [teamCandidateStates, setTeamCandidateStates] = useState<Record<string, TeamCandidateState>>({})
  const [teamStatuses, setTeamStatuses] = useState<Record<string, SaveState>>({})

  const loadTeamCandidates = useCallback(async (teamId: string) => {
    setTeamCandidateStates((current) => ({
      ...current,
      [teamId]: { status: 'loading', candidates: current[teamId]?.candidates ?? [] },
    }))
    try {
      const candidates = await listTeamLeadCandidates(teamId)
      setTeamCandidateStates((current) => ({ ...current, [teamId]: { status: 'loaded', candidates } }))
    } catch {
      setTeamCandidateStates((current) => ({
        ...current,
        [teamId]: { status: 'error', candidates: current[teamId]?.candidates ?? [] },
      }))
    }
  }, [])

  const load = useCallback(async () => {
    setLoadState('loading')
    try {
      const [authorityRows, assignments] = await Promise.all([listRoleAuthority(), listTeamLeadAssignments()])
      const normalized = normalizeAuthorityRows(authorityRows)
      setSavedAuthority(normalized)
      setAuthorityDraft(authorityDraftFromRows(normalized))
      setTeamLeads(assignments)
      setTeamLeadDrafts(Object.fromEntries(assignments.map((assignment) => [assignment.team_id, assignment.lead_person_id ?? ''])))
      setTeamCandidateStates(Object.fromEntries(assignments.map((assignment) => [assignment.team_id, { status: 'loading', candidates: [] }])))
      setTeamStatuses({})
      setAuthorityStatus('idle')
      setLoadState('loaded')
      void Promise.all(assignments.map((assignment) => loadTeamCandidates(assignment.team_id)))
    } catch {
      setLoadState('error')
    }
  }, [loadTeamCandidates])

  useEffect(() => { void load() }, [load])

  const changedAuthorityRows = useMemo(() => authorityRowsFromDraft(authorityDraft).filter((row) => {
      if (row.role === 'admin') return false
      const saved = savedAuthority.find((candidate) => candidate.action === row.action && candidate.role === row.role)
      return saved?.scope !== row.scope
    }), [authorityDraft, savedAuthority])
  const authorityDirty = changedAuthorityRows.length > 0

  function updateAuthority(action: AuthorityAction, role: AuthorityRole, scope: AuthorityScope) {
    setAuthorityDraft((current) => ({ ...current, [authorityKey(action, role)]: scope }))
    setAuthorityStatus('idle')
  }

  async function handleSaveAuthority() {
    const changes = changedAuthorityRows
    if (!authorityDirty) return
    setAuthorityStatus('saving')
    try {
      await saveRoleAuthority(changes)
      setSavedAuthority((current) => current.map((row) => changes.find((change) => change.action === row.action && change.role === row.role) ?? row))
      setAuthorityStatus('saved')
    } catch {
      setAuthorityStatus('error')
    }
  }

  function updateTeamLead(teamId: string, leadId: string) {
    setTeamLeadDrafts((current) => ({ ...current, [teamId]: leadId }))
    setTeamStatuses((current) => ({ ...current, [teamId]: 'idle' }))
  }

  async function handleSaveTeamLead(assignment: TeamLeadAssignment) {
    const leadId = teamLeadDrafts[assignment.team_id] ?? ''
    setTeamStatuses((current) => ({ ...current, [assignment.team_id]: 'saving' }))
    try {
      await saveTeamLeadAssignment(assignment.team_id, leadId || null)
      const lead = (teamCandidateStates[assignment.team_id]?.candidates ?? []).find((candidate) => candidate.person_id === leadId)
      setTeamLeads((current) => current.map((row) => row.team_id === assignment.team_id
        ? { ...row, lead_person_id: leadId || null, lead_name: lead?.full_name ?? null }
        : row))
      setTeamStatuses((current) => ({ ...current, [assignment.team_id]: 'saved' }))
    } catch {
      setTeamStatuses((current) => ({ ...current, [assignment.team_id]: 'error' }))
    }
  }

  const frameState = loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error' : 'default'
  const showMobileSave = !isDesktop && (authorityDirty || authorityStatus !== 'idle')
  const saveAuthorityControl = (
    <Button variant="primary" disabled={!authorityDirty || authorityStatus === 'saving'} onClick={() => void handleSaveAuthority()}>
      {authorityStatus === 'saving' ? t('admin.access.saving') : t('admin.access.save')}
    </Button>
  )

  return (
    <PageFamilyFrame
      family="management"
      title={t('admin.access.title')}
      jobSentence={t('admin.access.job')}
      state={frameState}
    >
      <AdminSettingsNav />

      {loadState === 'loading' && <LoadingShell count={7} label={t('admin.access.loading')} />}

      {loadState === 'error' && (
        <ErrorState message={t('admin.access.loadError')} onRetry={load} />
      )}

      {loadState === 'loaded' && (
        <div className={`admin-access-stack${showMobileSave ? ' admin-access-stack--saving-visible' : ''}`}>
          <p className="admin-access-note">{t('admin.access.readCopy')}</p>

          <section className="admin-access-panel" aria-labelledby="admin-access-authority-title">
            <div className="admin-access-panel__head">
              <div>
                <h2 id="admin-access-authority-title" className="admin-access-panel__title">{t('admin.access.authorityTitle')}</h2>
                <p className="admin-access-panel__copy">{t('admin.access.authorityCopy')}</p>
              </div>
              {isDesktop && <div className="admin-access-panel__head-action">{saveAuthorityControl}</div>}
            </div>

            {authorityStatus === 'error' && (
              <ErrorState
                message={t('admin.access.saveError')}
                retryLabel={t('admin.access.retry')}
                onRetry={() => void handleSaveAuthority()}
              />
            )}
            {authorityStatus === 'saved' && (
                  <div className="admin-access-feedback admin-access-feedback--saved" role="status" aria-label={t('admin.access.saved')}>
                {t('admin.access.saved')}
              </div>
            )}

            {isDesktop ? (
              <AuthorityTable
                draft={authorityDraft}
                onChange={updateAuthority}
                t={t}
                disabled={authorityStatus === 'saving'}
              />
            ) : (
              <AuthorityMobileEditor
                draft={authorityDraft}
                role={mobileRole}
                onRoleChange={setMobileRole}
                onChange={updateAuthority}
                t={t}
                disabled={authorityStatus === 'saving'}
              />
            )}
            {showMobileSave && <div className="admin-access-mobile-save">{saveAuthorityControl}</div>}
          </section>

          <section className="admin-access-panel" aria-labelledby="admin-access-team-title">
            <div className="admin-access-panel__head">
              <div>
                <h2 id="admin-access-team-title" className="admin-access-panel__title">{t('admin.access.teamTitle')}</h2>
                <p className="admin-access-panel__copy">{t('admin.access.teamCopy')}</p>
              </div>
            </div>
            {teamLeads.length === 0 ? (
              <div className="admin-access-empty">
                <EmptyState
                  nested
                  variant="blank"
                  title={t('admin.access.teamEmptyTitle')}
                  copy={t('admin.access.teamEmptyCopy')}
                />
              </div>
            ) : (
              <div className="admin-team-leads">
                {teamLeads.map((assignment) => (
                  <TeamLeadRow
                    key={assignment.team_id}
                    assignment={assignment}
                    draftLeadId={teamLeadDrafts[assignment.team_id] ?? ''}
                    candidateState={teamCandidateStates[assignment.team_id] ?? { status: 'loading', candidates: [] }}
                    status={teamStatuses[assignment.team_id] ?? 'idle'}
                    onChange={(leadId) => updateTeamLead(assignment.team_id, leadId)}
                    onSave={() => void handleSaveTeamLead(assignment)}
                    onRetryCandidates={() => void loadTeamCandidates(assignment.team_id)}
                    t={t}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </PageFamilyFrame>
  )
}
