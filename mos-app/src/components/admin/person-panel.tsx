// PersonPanel — one person in Admin Settings, read first, then edited.
//
// Opens from a People row (click, or Enter on the name) and from the row menu's "Manage person".
// It mounts in the shared record panel host: a panel beside the list on a wide desktop, a sheet
// on narrower screens, full screen on a phone.
//
// Top: what an admin needs to answer "what can this person do, and why" without leaving the
// panel — access roles, Teams with the Home Team marked, the Teams they lead, and each action
// group from the role authority table with the widest scope they get and which role grants it.
// Below: the editable sections in the order the domain reads them — Teams · Position · Access ·
// Revenue scope (only while Supervisor is on). Every row commits and reports beside itself.

import { useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { RecordPanelHost } from '@/shell/record-panel-host'
import { useIsPhone } from '@/shell/use-is-phone'
import { Chevron } from '@/shell/icons'
import { Pill } from '@/components/ui/pill'
import { Tag } from '@/components/ui/tag'
import { Button } from '@/components/ui/button'
import { localizedRoleMeta, type AdminPersonRow, type RevenueScopeOption, type RoleOption, type TeamOption } from '@/lib/db/admin-users.types'
import type { RoleAuthorityRow, TeamLeadAssignment } from '@/lib/db/admin-access.types'
import { AUTHORITY_ACTION_LABEL_KEYS, AUTHORITY_SCOPE_LABEL_KEYS, authorityRoleLabel, heldAuthorityRoles, personAuthority } from './person-authority'
import { useRowCommits, type RowCommits } from './use-row-commits'
import { TeamPicker } from './team-picker'
import { PositionPicker } from './position-picker'
import { AccessRoles } from './access-roles'
import { RevenueScopePicker } from './revenue-scope-picker'
import './admin-settings.css'

export interface PersonAuthoritySource {
  state: 'loading' | 'loaded' | 'error'
  rows: RoleAuthorityRow[]
  leads: TeamLeadAssignment[]
  retry: () => void
}

export interface PersonPanelProps {
  person: AdminPersonRow
  people: readonly AdminPersonRow[]
  roles: RoleOption[]
  teams: TeamOption[]
  scopeOptions: RevenueScopeOption[]
  authority: PersonAuthoritySource
  /** Reload people after a write, without blanking the list. */
  refresh: () => Promise<void>
  onClose: () => void
}

export function PersonPanel({ person, people, roles, teams, scopeOptions, authority, refresh, onClose }: PersonPanelProps) {
  const t = useT()
  const commits = useRowCommits<boolean>()
  // Read-first: open on the heading, not the summary's first link.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const title = t('admin.person.title', { name: person.full_name })
  // Closing mid-write would strand the row's outcome behind a closed panel.
  const close = () => { if (!commits.busy()) onClose() }

  return (
    <RecordPanelHost
      label={title}
      title={<h2 ref={headingRef} tabIndex={-1} className="admin-person__title">{title}</h2>}
      closeLabel={t('record.close')}
      onClose={close}
      focusKey={person.id}
      initialFocusRef={headingRef}
      rootClassName="admin-person-panel"
    >
      <div className="admin-person">
        {person.email && <p className="admin-person__email">{person.email}</p>}
        <PersonSummary person={person} teams={teams} authority={authority} />
        <PersonSections
          person={person}
          people={people}
          roles={roles}
          teams={teams}
          scopeOptions={scopeOptions}
          commits={commits}
          refresh={refresh}
        />
      </div>
    </RecordPanelHost>
  )
}

function PersonSummary({ person, teams, authority }: { person: AdminPersonRow; teams: TeamOption[]; authority: PersonAuthoritySource }) {
  const t = useT()
  const teamName = new Map(teams.map((team) => [team.id, team.name]))
  const memberships = [...person.teams].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
  const leads = authority.leads.filter((lead) => lead.lead_person_id === person.id)
  const hasHome = person.teams.some((m) => m.is_primary)

  return (
    <section className="admin-person-summary" aria-label={t('admin.person.summary')}>
      <dl className="admin-person-facts">
        <div className="admin-person-facts__row">
          <dt>{t('admin.person.access')}</dt>
          <dd>
            {person.access_roles.length === 0 ? (
              <span className="admin-person-muted">{t('admin.people.roles.none')}</span>
            ) : (
              <span className="flex flex-wrap gap-1">
                {person.access_roles.map((role) => (
                  <Tag key={role} color="gray">{localizedRoleMeta(role, t).label}</Tag>
                ))}
              </span>
            )}
          </dd>
        </div>
        <div className="admin-person-facts__row">
          <dt>{t('admin.person.teams')}</dt>
          <dd>
            {memberships.length === 0 ? (
              <span className="admin-person-muted">{t('admin.person.noTeams')}</span>
            ) : (
              <ul className="admin-person-teams">
                {memberships.map((m) => (
                  <li key={m.team_id}>
                    <span>{teamName.get(m.team_id) ?? '—'}</span>
                    {m.is_primary && <Pill tone="primary" dot={false}>{t('admin.person.home')}</Pill>}
                  </li>
                ))}
              </ul>
            )}
            {hasHome && <p className="admin-person-note">{t('admin.person.homeNote')}</p>}
          </dd>
        </div>
        <div className="admin-person-facts__row">
          <dt>{t('admin.person.leads')}</dt>
          <dd>
            {authority.state === 'loaded' && (
              <span>{leads.length === 0 ? t('admin.person.leadsNone') : leads.map((lead) => lead.team_name).join(', ')}</span>
            )}
            {' '}
            <Link to="/admin/teams" className="admin-person-link">{t('admin.person.changeLeads')}</Link>
          </dd>
        </div>
      </dl>

      <h3 className="admin-person-subhead">{t('admin.person.canDo')}</h3>
      <CanDo person={person} authority={authority} leadsATeam={leads.length > 0} />
    </section>
  )
}

function CanDo({ person, authority, leadsATeam }: { person: AdminPersonRow; authority: PersonAuthoritySource; leadsATeam: boolean }) {
  const t = useT()
  if (authority.state === 'loading') {
    return <p className="admin-person-muted" role="status">{t('admin.person.canDoLoading')}</p>
  }
  if (authority.state === 'error') {
    return (
      <div className="admin-person-candoerror" role="alert">
        <span>{t('admin.person.canDoError')}</span>
        <Button variant="outline" onClick={authority.retry}>{t('common.retry')}</Button>
      </div>
    )
  }
  const grants = personAuthority(authority.rows, heldAuthorityRoles(person.access_roles, leadsATeam))
  const buHeadAddsSomething = authority.rows.some((row) => row.role === 'bu_head' && row.scope !== 'none')
  return (
    <>
      <ul className="admin-person-cando">
        {grants.map((grant) => (
          <li key={grant.action} className="admin-person-cando__row">
            <span className="admin-person-cando__action">{t(AUTHORITY_ACTION_LABEL_KEYS[grant.action])}</span>
            <span className={grant.scope === 'none' ? 'admin-person-cando__scope admin-person-muted' : 'admin-person-cando__scope'}>
              {grant.scope === 'none' ? t('admin.person.notAllowed') : t(AUTHORITY_SCOPE_LABEL_KEYS[grant.scope])}
            </span>
            {grant.scope !== 'none' && (
              <span className="admin-person-cando__source">
                {grant.sources.includes('member')
                  ? t('admin.person.memberBaseline')
                  : t('admin.person.via', { roles: grant.sources.map((role) => authorityRoleLabel(role, t)).join(', ') })}
              </span>
            )}
          </li>
        ))}
      </ul>
      {buHeadAddsSomething && <p className="admin-person-note">{t('admin.person.buHeadNote')}</p>}
    </>
  )
}

function PersonSections({ person, people, roles, teams, scopeOptions, commits, refresh }: {
  person: AdminPersonRow
  people: readonly AdminPersonRow[]
  roles: RoleOption[]
  teams: TeamOption[]
  scopeOptions: RevenueScopeOption[]
  commits: RowCommits<boolean>
  refresh: () => Promise<void>
}) {
  const t = useT()
  // Phone: accordions, Teams open. Wider: every section open, each still collapsible.
  const isPhone = useIsPhone()
  const count = (n: number) => (n > 0 ? t('admin.person.selectedCount', { count: n }) : undefined)
  const supervisor = person.access_roles.includes('supervisor')

  return (
    <div className="admin-person-sections">
      <PanelSection title={t('admin.person.teams')} summary={count(person.teams.length)} defaultOpen>
        <TeamPicker person={person} teams={teams} commits={commits} refresh={refresh} />
      </PanelSection>
      <PanelSection title={t('admin.person.position')} summary={count(person.jabatan.length)} defaultOpen={!isPhone}>
        <PositionPicker person={person} roles={roles} commits={commits} refresh={refresh} />
      </PanelSection>
      <PanelSection title={t('admin.person.access')} summary={count(person.access_roles.length)} defaultOpen={!isPhone}>
        <AccessRoles person={person} people={people} commits={commits} refresh={refresh} />
      </PanelSection>
      {supervisor && (
        <PanelSection title={t('admin.person.scope')} summary={count(person.revenue_scope.length)} defaultOpen={!isPhone}>
          <RevenueScopePicker person={person} options={scopeOptions} commits={commits} refresh={refresh} />
        </PanelSection>
      )}
    </div>
  )
}

function PanelSection({ title, summary, defaultOpen, children }: {
  title: string
  summary?: string
  defaultOpen: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()
  return (
    <section className="admin-person-section" aria-label={title}>
      <h3 className="admin-person-section__heading">
        <button
          type="button"
          className="admin-person-section__toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((value) => !value)}
        >
          <Chevron className={open ? 'admin-person-section__chevron' : 'admin-person-section__chevron admin-person-section__chevron--closed'} />
          <span className="admin-person-section__title">{title}</span>
          {summary && <span className="admin-person-section__summary">{summary}</span>}
        </button>
      </h3>
      <div id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  )
}
