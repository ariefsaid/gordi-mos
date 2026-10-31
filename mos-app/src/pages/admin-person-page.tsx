// AdminPersonPage — one person, read first: /admin/people/:personId (behind AdminRoute).
//
// Header: who they are (name, email, login, Home team) and their account actions — the likely next
// one as a button, the rest under More. Body: what they have (Teams, Position, Access level, Revenue
// scope while Supervisor (access) is on, Modules, Receipt issues), each with one Change; beside it, what that
// adds up to. The People list's filters ride along in this page's URL so Back returns to the same list.
import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { useSetBreadcrumbTitle } from '@/shell/breadcrumb-title'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsOffline } from '@/shell/use-is-offline'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'
import { StatusBadge } from '@/components/ui/status-badge'
import { ErrorState } from '@/components/ui/state-kit'
import { OfflineNotice } from '@/components/ui/offline-notice'
import { RecordMenu } from '@/components/record/record-menu'
import { useAdminPeople } from '@/components/admin/use-admin-people'
import { ACCOUNT_ACTION_LABEL, accountActionsFor, nextAccountAction, useAccountActions } from '@/components/admin/account-actions'
import { headedBusinessUnits } from '@/components/admin/person-authority'
import {
  AccessCard, CanDoCard, PositionCard, ReceiptIssuesCard, ScopeCard, TeamsCard, type PersonAuthoritySource,
} from '@/components/admin/person-cards'
import { PersonModulesCard } from '@/components/admin/person-modules-card'
import { LIST_PARAMS, isLastActiveAdmin } from '@/components/admin/people-filter'
import { listRoleAuthority, listTeamLeadAssignments } from '@/lib/db/admin-access'
import { getBusinessUnits, getRoles } from '@/lib/db/directory'
import { normalizeAuthorityRows, type RoleAuthorityRow, type TeamLeadAssignment } from '@/lib/db/admin-access.types'
import { hasAccessRole } from '@/lib/capabilities'
import type { AdminPersonRow } from '@/lib/db/admin-users.types'
import './admin-person-page.css'

// Start a load inside a promise, so one that throws before returning still rejects into the catch.
const start = <T,>(load: () => Promise<T>) => Promise.resolve().then(load)

function useAuthority(): PersonAuthoritySource {
  const [state, setState] = useState<PersonAuthoritySource['state']>('loading')
  const [rows, setRows] = useState<RoleAuthorityRow[]>([])
  const [leads, setLeads] = useState<TeamLeadAssignment[]>([])
  const [roleTree, setRoleTree] = useState<PersonAuthoritySource['roleTree']>([])
  const [businessUnits, setBusinessUnits] = useState<PersonAuthoritySource['businessUnits']>([])
  const load = useCallback(async () => {
    setState('loading')
    try {
      const [r, l, tree, units] = await Promise.all([
        start(() => listRoleAuthority()), start(() => listTeamLeadAssignments()), start(() => getRoles()), start(() => getBusinessUnits()),
      ])
      setRows(normalizeAuthorityRows(r))
      setLeads(l)
      setRoleTree(tree)
      setBusinessUnits(units)
      setState('loaded')
    } catch {
      setState('error')
    }
  }, [])
  useEffect(() => { void load() }, [load])
  return { state, rows, leads, roleTree, businessUnits, retry: () => void load() }
}

export function AdminPersonPage() {
  const t = useT()
  const { personId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const data = useAdminPeople()
  const authority = useAuthority()
  const actions = useAccountActions(data.refresh)
  const person = data.people.find((p) => p.id === personId) ?? null

  const listQuery = new URLSearchParams()
  for (const key of LIST_PARAMS) {
    const value = searchParams.get(key)
    if (value) listQuery.set(key, value)
  }
  const back = { to: `/admin/people${listQuery.size ? `?${listQuery}` : ''}`, label: t('record.backToCollection', { collection: t('admin.people.title') }) }

  useDocumentTitle(t('common.docTitle', { page: person?.full_name ?? t('admin.people.title') }))
  useSetBreadcrumbTitle(person?.full_name ?? '')

  if (data.state !== 'loaded' || !person) {
    return (
      <PageFamilyFrame
        family="management"
        title={data.state === 'loaded' ? t('admin.person.notFound.title') : t('admin.people.title')}
        back={back}
        state={data.state === 'loading' ? 'loading' : 'default'}
      >
        {data.state === 'error' && <ErrorState message={t('admin.people.loadError')} onRetry={data.load} />}
        {data.state === 'loaded' && <p className="person-page__missing">{t('admin.person.notFound.copy')}</p>}
      </PageFamilyFrame>
    )
  }

  return (
    <PageFamilyFrame
      family="management"
      title={person.full_name}
      back={back}
      action={data.refreshError ? undefined : <PersonAccountActions person={person} people={data.people} run={actions.run} />}
      phoneActionBar={false}
      statusRow={<PersonFacts person={person} teams={data.teams} justSaved={actions.justSavedId === person.id} />}
      headClassName="person-head"
    >
      <OfflineNotice />
      {actions.error && (
        <ErrorState message={actions.error} onRetry={actions.clearError} retryLabel={t('admin.people.dismiss')} className="person-page__error" />
      )}
      {data.refreshError && (
        <ErrorState
          message={t('admin.people.loadError')}
          onRetry={() => void data.refresh().catch(() => {})}
          retryLabel={t('admin.row.retry')}
          className="person-page__error"
        />
      )}
      <div className="person-page" inert={!!data.refreshError}>
        <div className="person-page__column">
          <TeamsCard person={person} teams={data.teams} refresh={data.refresh} />
          <PositionCard
            person={person}
            roles={data.roles}
            headed={authority.state === 'loaded' ? headedBusinessUnits(person, authority.roleTree, authority.businessUnits) : []}
            refresh={data.refresh}
          />
          <AccessCard person={person} people={data.people} refresh={data.refresh} />
          {hasAccessRole(person.access_roles, 'supervisor') && <ScopeCard person={person} options={data.scopeOptions} refresh={data.refresh} />}
          <PersonModulesCard person={person} />
          <ReceiptIssuesCard person={person} />
        </div>
        <div className="person-page__column">
          <CanDoCard person={person} authority={authority} />
        </div>
      </div>
      {actions.dialogs}
    </PageFamilyFrame>
  )
}

/** Email · login · Archived · Home team, one wrapping line under the name. */
function PersonFacts({ person, teams, justSaved }: { person: AdminPersonRow; teams: { id: string; name: string }[]; justSaved: boolean }) {
  const t = useT()
  const home = person.teams.find((m) => m.is_primary)
  const homeName = home ? teams.find((team) => team.id === home.team_id)?.name : undefined
  return (
    <ul className="person-facts" aria-label={t('admin.person.summary')}>
      {person.email && <li className={person.email.includes('@ops.gordi.local') ? 'person-facts__email person-facts__email--mono' : 'person-facts__email'}>{person.email}</li>}
      <li className="person-facts__login">
        {person.login === 'none'
          ? <Pill tone="neutral" dot={false}>{t('admin.people.login.none')}</Pill>
          : <StatusBadge status={person.login === 'active' ? 'active' : 'disabled'} />}
        {justSaved && <span className="person-facts__saved" role="status">{t('admin.row.saved')}</span>}
      </li>
      {person.archived_at && <li><StatusBadge status="archived" /></li>}
      <li className="person-facts__home">{homeName ? t('admin.person.facts.home', { team: homeName }) : t('admin.person.facts.noHome')}</li>
    </ul>
  )
}

function PersonAccountActions({ person, people, run }: {
  person: AdminPersonRow
  people: readonly AdminPersonRow[]
  run: ReturnType<typeof useAccountActions>['run']
}) {
  const t = useT()
  const offline = useIsOffline()
  const next = nextAccountAction(person)
  const others = accountActionsFor(person, people).filter((item) => item.action !== next)
  const blocked = others.some((item) => item.blocked)
  // Fixing an unusual state (no login, disabled, archived) is the filled next step; a reset is not.
  const variant = next === 'reset-password' ? 'outline' : 'primary'
  return (
    <span className="person-actions">
      <Button variant={variant} disabled={offline} onClick={() => void run(next, person)}>{t(ACCOUNT_ACTION_LABEL[next])}</Button>
      <RecordMenu
        label={t('admin.people.moreActionsFor', { name: person.full_name })}
        triggerLabel={t('admin.person.more')}
        minItems={1}
        note={blocked && isLastActiveAdmin(person, people) ? t('admin.people.lastAdmin') : offline ? t('common.offline.reconnect') : undefined}
        items={others.map((item, i) => ({
          id: item.action,
          label: t(ACCOUNT_ACTION_LABEL[item.action]),
          onSelect: () => void run(item.action, person),
          destructive: item.action === 'archive',
          separatorBefore: i > 0 && (item.action === 'archive' || item.action === 'restore'),
          disabled: item.blocked || offline,
        }))}
      />
    </span>
  )
}
