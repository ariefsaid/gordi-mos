// The person page's cards. Each shows what the person has now, in words, with one "Change" that opens
// a ChoiceDialog: Teams · Position · Access level · Revenue scope (only while Supervisor (access) is on)
// · Receipt issues, then "What they can do" — the answer the others add up to.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { useAuth } from '@/auth/use-auth'
import { useIsOffline } from '@/shell/use-is-offline'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'
import { Notice } from '@/components/ui/notice'
import { ErrorState } from '@/components/ui/state-kit'
import {
  addTeamMembership, assignJabatan, assignRevenueScope, endTeamMembership, grantRole, removeJabatan,
  removeRevenueScope, revokeRole, setPrimaryTeam,
} from '@/lib/db/admin-users'
import { getCafeReceiptIssueAccess, setCafeReceiptIssueAccess } from '@/lib/db/cafe-receipt-issues'
import {
  ASSIGNABLE_ROLES, localizedRoleMeta, teamStreamLabel,
  type AdminPersonRow, type RevenueScopeOption, type RoleOption, type TeamOption,
} from '@/lib/db/admin-users.types'
import type { RoleAuthorityRow, TeamLeadAssignment } from '@/lib/db/admin-access.types'
import type { RoleScopeNode } from '@/lib/role-scope'
import type { MessageKey } from '@/i18n/messages'
import { AUTHORITY_ACTION_LABEL_KEYS, authorityRoleLabel, headedBusinessUnits, heldAuthorityRoles, personAuthority } from './person-authority'
import { ChoiceDialog, type ChoiceChange, type ConfirmSpec } from './choice-dialog'
import { RowStatus } from './row-status'
import { useRowCommits } from './use-row-commits'
import { isLastActiveAdmin } from './people-filter'
import './admin-settings.css'

export type PersonAuthoritySource = {
  state: 'loading' | 'loaded' | 'error'
  rows: RoleAuthorityRow[]
  leads: TeamLeadAssignment[]
  // Positions with their unit and reporting line (says who heads a unit), and the active units.
  roleTree: RoleScopeNode[]
  businessUnits: { id: string; name: string }[]
  retry: () => void
}

// ── Card shell ─────────────────────────────────────────────────────────────────

/** "Saved" beside a card's title for a moment after its picker saved everything. */
function useSavedFlash() {
  const [shown, setShown] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const flash = useCallback(() => {
    setShown(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setShown(false), 2000)
  }, [])
  return { shown, flash }
}

/** A card's picker: open or not, and "Saved" on the card after it saved everything. */
function usePicker() {
  const [open, setOpen] = useState(false)
  const { shown, flash } = useSavedFlash()
  return { open, saved: shown, show: () => setOpen(true), close: (didSave: boolean) => { setOpen(false); if (didSave) flash() } }
}

function PersonCard({ title, onChange, changeLabel, saved, children }: {
  title: string
  onChange?: () => void
  /** Accessible name of the Change button ("Change Teams"). */
  changeLabel?: string
  saved?: boolean
  children: ReactNode
}) {
  const t = useT()
  const offline = useIsOffline()
  return (
    <section className="person-card" aria-label={title}>
      <div className="person-card__head">
        <h2 className="person-card__title">{title}</h2>
        {saved && <RowStatus status="saved" item={title} onRetry={() => {}} />}
        {onChange && (
          <Button variant="outline" className="person-card__change" aria-label={changeLabel} disabled={offline} onClick={onChange}>
            {t('admin.person.change')}
          </Button>
        )}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="person-card__empty">{children}</p>
}

// ── Teams ──────────────────────────────────────────────────────────────────────

export function TeamsCard({ person, teams, refresh }: { person: AdminPersonRow; teams: TeamOption[]; refresh: () => Promise<void> }) {
  const t = useT()
  const offline = useIsOffline()
  const picker = usePicker()
  const homeCommits = useRowCommits<boolean>()
  const byId = new Map(teams.map((team) => [team.id, team]))
  const memberships = [...person.teams].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
  const home = person.teams.find((m) => m.is_primary)
  const title = t('admin.person.teams')

  function makeHome(teamId: string) {
    void homeCommits.commit(`home:${teamId}`, true, home?.team_id === teamId, () => setPrimaryTeam(person.id, teamId), refresh)
  }

  // Endings first: ending the Home team frees the one Home slot before an added Team claims it.
  const order = (changes: ChoiceChange[]) => [...changes.filter((c) => !c.wanted), ...changes.filter((c) => c.wanted)]
  // The first Team someone joins becomes their Home team, as before: without one, their Café
  // production stream resolves to nothing. Only when no Home team is left after the endings.
  function write(change: ChoiceChange, succeeded: ReadonlySet<string>) {
    if (!change.wanted) return endTeamMembership(person.id, change.id)
    const homeLeft = home !== undefined && !succeeded.has(home.team_id)
    const addedBefore = [...succeeded].some((id) => !person.teams.some((m) => m.team_id === id))
    return addTeamMembership(person.id, change.id, !homeLeft && !addedBefore)
  }
  function draftNote(draft: ReadonlySet<string>) {
    if ((home !== undefined && draft.has(home.team_id)) || draft.size === 0) return undefined
    const firstAdded = teams.find((team) => draft.has(team.id) && !person.teams.some((m) => m.team_id === team.id))
    if (firstAdded) return t('admin.picker.teams.becomesHome', { team: firstAdded.name })
    return home !== undefined ? t('admin.picker.teams.noHome') : undefined
  }

  return (
    <PersonCard title={title} changeLabel={t('admin.person.changeAria', { section: title })} onChange={picker.show} saved={picker.saved}>
      {person.teams.length > 0 && !home && (
        <Notice tone="attention" className="person-card__notice">{t('admin.teams.noHome', { name: person.full_name })}</Notice>
      )}
      {memberships.length === 0 ? (
        <Empty>{t('admin.person.noTeams')}</Empty>
      ) : (
        <ul className="person-card__list">
          {memberships.map((m) => {
            const team = byId.get(m.team_id)
            const name = team?.name ?? '—'
            const key = `home:${m.team_id}`
            const status = homeCommits.status(key, m.is_primary)
            return (
              <li key={m.team_id} className="person-card__item">
                <span className="person-card__item-text">
                  <span className="person-card__name">{name}</span>
                  {team && teamStreamLabel(team) && <span className="person-card__meta">{teamStreamLabel(team)}</span>}
                </span>
                <span className="person-card__item-end">
                  {m.is_primary ? (
                    <Pill tone="primary" dot={false}>{t('admin.person.home')}</Pill>
                  ) : status !== 'saving' && (
                    <button
                      type="button"
                      className="person-card__link-button"
                      disabled={offline || homeCommits.busy('home:')}
                      aria-label={t('admin.teams.makeHomeAria', { team: name })}
                      onClick={() => makeHome(m.team_id)}
                    >
                      {t('admin.teams.makeHome')}
                    </button>
                  )}
                  <RowStatus status={status} error={homeCommits.error(key)} item={name} onRetry={() => void homeCommits.retry(key)} />
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {home && <p className="person-card__meaning">{t('admin.person.homeNote')}</p>}
      {picker.open && (
        <ChoiceDialog
          title={t('admin.teams.legend', { name: person.full_name })}
          description={t('admin.person.homeNote')}
          choices={teams.map((team) => ({
            id: team.id,
            label: team.name,
            description: teamStreamLabel(team),
            badge: home?.team_id === team.id ? <Pill tone="primary" dot={false}>{t('admin.person.home')}</Pill> : undefined,
          }))}
          saved={new Set(person.teams.map((m) => m.team_id))}
          searchable={teams.length > 8}
          searchLabel={t('admin.person.filterLabel', { section: title })}
          emptyText={t('admin.teams.none')}
          saveLabel={t('admin.picker.save.teams')}
          order={order}
          write={write}
          draftNote={draftNote}
          refresh={refresh}
          onClose={picker.close}
        />
      )}
    </PersonCard>
  )
}

// ── Position ───────────────────────────────────────────────────────────────────

export function PositionCard({ person, roles, headed, refresh }: { person: AdminPersonRow; roles: RoleOption[]; headed: string[]; refresh: () => Promise<void> }) {
  const t = useT()
  const picker = usePicker()
  const title = t('admin.person.position')
  return (
    <PersonCard title={title} changeLabel={t('admin.person.changeAria', { section: title })} onChange={picker.show} saved={picker.saved}>
      {person.jabatan.length === 0 ? (
        <Empty>{t('admin.person.noPosition')}</Empty>
      ) : (
        <ul className="person-card__list">
          {person.jabatan.map((position) => (
            <li key={position.role_id} className="person-card__item"><span className="person-card__name">{position.role_name}</span></li>
          ))}
        </ul>
      )}
      <p className="person-card__meaning">
        {headed.length > 0 ? t('admin.person.positionHeads', { units: headed.join(', ') }) : t('admin.person.positionMeaning')}
      </p>
      {picker.open && (
        <ChoiceDialog
          title={t('admin.position.legend', { name: person.full_name })}
          description={t('admin.person.positionMeaning')}
          choices={roles.map((role) => ({ id: role.id, label: role.name }))}
          saved={new Set(person.jabatan.map((j) => j.role_id))}
          searchable={roles.length > 8}
          searchLabel={t('admin.person.filterLabel', { section: title })}
          emptyText={t('admin.position.none')}
          saveLabel={t('admin.picker.save.position')}
          write={(change) => (change.wanted ? assignJabatan(person.id, change.id) : removeJabatan(person.id, change.id))}
          refresh={refresh}
          onClose={picker.close}
        />
      )}
    </PersonCard>
  )
}

// ── Access level ───────────────────────────────────────────────────────────────

// Never self-assignable (CONTEXT.md, Access role): the database refuses it too.
const SELF_GUARDED_ROLES = new Set(['admin', 'finance', 'manager', 'supervisor', 'hr'])

export function AccessCard({ person, people, refresh }: { person: AdminPersonRow; people: readonly AdminPersonRow[]; refresh: () => Promise<void> }) {
  const t = useT()
  const auth = useAuth()
  const picker = usePicker()
  const isSelf = auth.status === 'authenticated' && auth.viewer.person.id === person.id
  const lastAdmin = isLastActiveAdmin(person, people)
  const title = t('admin.person.accessLevel')
  const held = (ASSIGNABLE_ROLES as readonly string[]).filter((role) => person.access_roles.includes(role))
    .concat(person.access_roles.filter((role) => !(ASSIGNABLE_ROLES as readonly string[]).includes(role)))

  // Admin both ways and a new Ops Lead are confirmed first, naming what they can then do.
  function confirms(changes: ChoiceChange[]): ConfirmSpec[] {
    const specs: ConfirmSpec[] = []
    const admin = changes.find((c) => c.id === 'admin')
    if (admin?.wanted) {
      specs.push({
        title: t('admin.roles.confirmGrant.title', { name: person.full_name }),
        body: t('admin.roles.confirmGrant.body'),
        confirmLabel: t('admin.roles.confirmGrant.confirm'),
      })
    } else if (admin) {
      specs.push({
        title: t('admin.roles.confirmRevoke.title', { name: person.full_name }),
        body: t('admin.roles.confirmRevoke.body'),
        confirmLabel: t('admin.roles.confirmRevoke.confirm'),
      })
    }
    if (changes.some((c) => c.id === 'ops_lead' && c.wanted)) {
      specs.push({
        title: t('admin.roles.confirmOpsLead.title', { name: person.full_name }),
        body: t('admin.roles.confirmOpsLead.body'),
        confirmLabel: t('admin.roles.confirmOpsLead.confirm'),
      })
    }
    return specs
  }

  return (
    <PersonCard title={title} changeLabel={t('admin.person.changeAria', { section: title })} onChange={picker.show} saved={picker.saved}>
      {held.length === 0 ? (
        <Empty>{t('admin.person.noAccess')}</Empty>
      ) : (
        <ul className="person-card__list">
          {held.map((role) => {
            const meta = localizedRoleMeta(role, t)
            return (
              <li key={role} className="person-card__item">
                <span className="person-card__item-text">
                  <span className="person-card__name">{meta.label}</span>
                  {meta.description && <span className="person-card__meta">{meta.description}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {picker.open && (
        <ChoiceDialog
          title={t('admin.roles.legend', { name: person.full_name })}
          description={t('admin.person.accessMeaning')}
          choices={(ASSIGNABLE_ROLES as readonly string[]).map((role) => {
            const meta = localizedRoleMeta(role, t)
            const lockedReason = role === 'admin' && lastAdmin
              ? t('admin.roles.lastAdminHint')
              : isSelf && SELF_GUARDED_ROLES.has(role) ? t('admin.roles.selfGuardShort') : undefined
            return { id: role, label: meta.label, description: meta.description, lockedReason }
          })}
          saved={new Set(person.access_roles)}
          pinSelected={false}
          saveLabel={t('admin.picker.save.access')}
          confirms={confirms}
          write={(change) => (change.wanted ? grantRole(person.id, change.id) : revokeRole(person.id, change.id))}
          refresh={refresh}
          onClose={picker.close}
        />
      )}
    </PersonCard>
  )
}

// ── Revenue scope (Supervisor (access) only) ──────────────────────────────────

const CHANNEL_ORDER = ['POS', 'B2B']
const scopeId = (channel: string, branch: string | null) => `${channel}:${branch ?? '*'}`

export function ScopeCard({ person, options, refresh }: { person: AdminPersonRow; options: RevenueScopeOption[]; refresh: () => Promise<void> }) {
  const t = useT()
  const picker = usePicker()
  const title = t('admin.person.scope')
  const channels = CHANNEL_ORDER.filter((c) => options.some((o) => o.channel === c) || person.revenue_scope.some((s) => s.channel === c))
    .concat([...new Set([...options.map((o) => o.channel), ...person.revenue_scope.map((s) => s.channel)])].filter((c) => !CHANNEL_ORDER.includes(c)))
  const branchName = (channel: string, code: string | null) =>
    options.find((o) => o.channel === channel && o.branch_code === code)?.branch_name ?? code ?? ''
  // One line per channel the person can see: the whole channel, or the branches by name.
  const lines = channels.flatMap((channel) => {
    const grants = person.revenue_scope.filter((s) => s.channel === channel)
    if (grants.length === 0) return []
    if (grants.some((g) => g.branch_code === null)) return [t('admin.scope.channelWhole', { channel })]
    return [t('admin.scope.channelSome', { channel, branches: grants.map((g) => branchName(channel, g.branch_code)).join(', ') })]
  })
  const choices = channels.flatMap((channel) => [
    { id: scopeId(channel, null), label: t('admin.scope.whole', { channel }), group: channel, emphasis: true },
    ...options.filter((o) => o.channel === channel).map((o) => ({
      id: scopeId(channel, o.branch_code), label: o.branch_name ?? o.branch_code ?? '', group: channel, indent: true,
    })),
  ])
  function write(change: ChoiceChange) {
    const [channel, branch] = change.id.split(':')
    const code = branch === '*' ? null : branch
    return change.wanted ? assignRevenueScope(person.id, channel, code) : removeRevenueScope(person.id, channel, code)
  }
  return (
    <PersonCard title={title} changeLabel={t('admin.person.changeAria', { section: title })} onChange={picker.show} saved={picker.saved}>
      {lines.length === 0 ? (
        <Empty>{t('admin.scope.empty')}</Empty>
      ) : (
        <ul className="person-card__list">{lines.map((line) => <li key={line} className="person-card__item"><span className="person-card__name">{line}</span></li>)}</ul>
      )}
      <p className="person-card__meaning">{t('admin.scope.helper')}</p>
      {picker.open && (
        <ChoiceDialog
          title={t('admin.scope.title', { name: person.full_name })}
          description={t('admin.scope.helper')}
          choices={choices}
          saved={new Set(person.revenue_scope.map((s) => scopeId(s.channel, s.branch_code)))}
          pinSelected={false}
          emptyText={t('admin.scope.none')}
          saveLabel={t('admin.picker.save.scope')}
          write={write}
          refresh={refresh}
          onClose={picker.close}
        />
      )}
    </PersonCard>
  )
}

// ── Receipt issues (procurement) ───────────────────────────────────────────────

// One yes/no, so one named button instead of a picker. Not an access role: its value is read from
// its own call, and the database refuses a self-grant.
export function ReceiptIssuesCard({ person }: { person: AdminPersonRow }) {
  const t = useT()
  const auth = useAuth()
  const offline = useIsOffline()
  const isSelf = auth.status === 'authenticated' && auth.viewer.person.id === person.id
  const [saved, setSaved] = useState<boolean | 'failed' | null>(null)
  const commits = useRowCommits<boolean>()
  const key = `receipt:${person.id}`
  const title = t('admin.person.receipt.title')

  const load = useCallback(() => getCafeReceiptIssueAccess(person.id).then(setSaved), [person.id])
  useEffect(() => {
    setSaved(null)
    load().catch(() => setSaved('failed'))
  }, [load])

  if (saved === 'failed') {
    return (
      <PersonCard title={title}>
        <ErrorState
          message={t('common.loadFailed', { what: title })}
          onRetry={() => { setSaved(null); load().catch(() => setSaved('failed')) }}
          retryLabel={t('common.retry')}
        />
      </PersonCard>
    )
  }
  if (saved === null) {
    return <PersonCard title={title}><p className="person-card__empty" role="status">{t('common.loading')}</p></PersonCard>
  }
  const allowed = commits.display(key, saved)
  const status = commits.status(key, saved)
  return (
    <PersonCard title={title}>
      <div className="person-card__item person-card__item--solo">
        <span className="person-card__item-text">
          <span className="person-card__name">{allowed ? t('admin.person.receipt.yes') : t('admin.person.receipt.no')}</span>
          <span className="person-card__meta">{isSelf ? t('admin.person.procurement.selfGuard') : t('admin.person.procurement.description')}</span>
        </span>
        <span className="person-card__item-end">
          <RowStatus status={status} error={commits.error(key)} item={title} onRetry={() => void commits.retry(key)} />
          <Button
            variant="outline"
            disabled={isSelf || offline || status === 'saving'}
            onClick={() => void commits.commit(key, !allowed, saved, () => setCafeReceiptIssueAccess(person.id, !allowed), load)}
          >
            {allowed ? t('admin.person.receipt.stop') : t('admin.person.receipt.allow')}
          </Button>
        </span>
      </div>
    </PersonCard>
  )
}

// ── What they can do ───────────────────────────────────────────────────────────

const SCOPE_WORDS: Record<'org' | 'own_bu' | 'own_team' | 'own', MessageKey> = {
  org: 'admin.person.scopeIn.org',
  own_bu: 'admin.person.scopeIn.own_bu',
  own_team: 'admin.person.scopeIn.own_team',
  own: 'admin.person.scopeIn.own',
}

export function CanDoCard({ person, authority }: { person: AdminPersonRow; authority: PersonAuthoritySource }) {
  const t = useT()
  const title = t('admin.person.canDo')
  if (authority.state === 'loading') {
    return <PersonCard title={title}><p className="person-card__empty" role="status">{t('admin.person.canDoLoading')}</p></PersonCard>
  }
  if (authority.state === 'error') {
    return (
      <PersonCard title={title}>
        <ErrorState message={t('admin.person.canDoError')} onRetry={authority.retry} retryLabel={t('common.retry')} />
      </PersonCard>
    )
  }
  const leads = authority.leads.filter((lead) => lead.lead_person_id === person.id)
  const headed = headedBusinessUnits(person, authority.roleTree, authority.businessUnits)
  const grants = personAuthority(authority.rows, heldAuthorityRoles(person.access_roles, leads.length > 0, headed.length > 0))
  const allowed = grants.filter((g) => g.scope !== 'none')
  const denied = grants.filter((g) => g.scope === 'none')
  return (
    <PersonCard title={title}>
      <dl className="person-cando-facts">
        <div className="person-cando-facts__row">
          <dt>{t('admin.person.leads')}</dt>
          <dd>
            <span>{leads.length === 0 ? t('admin.person.leadsNone') : leads.map((lead) => lead.team_name).join(', ')}</span>
            <Link to="/admin/teams" className="person-card__link">{t('admin.person.changeLeads')}</Link>
          </dd>
        </div>
        {headed.length > 0 && (
          <div className="person-cando-facts__row">
            <dt>{t('admin.person.headsLabel')}</dt>
            <dd>{t('admin.person.headsFromPosition', { units: headed.join(', ') })}</dd>
          </div>
        )}
      </dl>
      {allowed.length > 0 && (
        <ul className="person-cando">
          {allowed.map((grant) => (
            <li key={grant.action} className="person-cando__row">
              <span className="person-cando__action">{t(AUTHORITY_ACTION_LABEL_KEYS[grant.action])}</span>
              <span className="person-cando__scope">{t(SCOPE_WORDS[grant.scope as keyof typeof SCOPE_WORDS])}</span>
              <span className="person-cando__why">
                {grant.sources.includes('member')
                  ? t('admin.person.everyMember')
                  : t('admin.person.because', { roles: grant.sources.map((role) => authorityRoleLabel(role, t)).join(', ') })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {denied.length > 0 && (
        <p className="person-card__meaning">{t('admin.person.cannot', { actions: denied.map((g) => t(AUTHORITY_ACTION_LABEL_KEYS[g.action])).join(', ') })}</p>
      )}
    </PersonCard>
  )
}
