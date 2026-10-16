// AdminAccessPage — Admin Settings › Roles & permissions: the role × action authority table.
// It edits organization policy in bulk, so unlike the eager rows elsewhere in Admin Settings it
// keeps one explicit "Save access rules", and leaving with unsaved changes asks first.
// Role names match the person panel's Access section; the two derived columns say where they
// come from and link there.

import { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { Picker, type PickerOption } from '@/components/ui/picker'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsOffline } from '@/shell/use-is-offline'
import { AdminSettingsNav } from '@/components/admin/admin-settings-nav'
import { AccessChangeSummary } from '@/components/admin/access-change-summary'
import { AUTHORITY_ACTION_LABEL_KEYS as ACTION_LABEL_KEYS, AUTHORITY_SCOPE_LABEL_KEYS as SCOPE_LABEL_KEYS, authorityRoleLabel } from '@/components/admin/person-authority'
import { listRoleAuthority, saveRoleAuthority } from '@/lib/db/admin-access'
import {
  AUTHORITY_ACTIONS,
  AUTHORITY_ROLES,
  getAllowedScopes,
  normalizeAuthorityRows,
  type AuthorityAction,
  type AuthorityRole,
  type AuthorityScope,
  type RoleAuthorityRow,
} from '@/lib/db/admin-access.types'
import './admin-access-page.css'

type LoadState = 'loading' | 'loaded' | 'error'
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** Where a derived column's grant comes from, and the Admin Settings tab that sets it. */
function DerivedSource({ role, t }: { role: AuthorityRole; t: ReturnType<typeof useT> }) {
  if (role === 'team_lead') {
    return <Link to="/admin/teams" className="admin-access-derived">{t('admin.access.derived.teamLead')}</Link>
  }
  if (role === 'bu_head') {
    return <Link to="/admin/people" className="admin-access-derived">{t('admin.access.derived.buHead')}</Link>
  }
  return null
}

/** True while the wrapped element has columns hidden past its right edge. */
function useOverflowRight<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setOverflow({
      left: el.scrollLeft > 1,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    })
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      el.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [])
  return { ref, overflow }
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
  const { ref, overflow } = useOverflowRight<HTMLDivElement>()
  return (
    <div className={`admin-access-table-frame${overflow.right ? ' admin-access-table-frame--more' : ''}${overflow.left ? ' admin-access-table-frame--more-left' : ''}`}>
      {overflow.right && <p className="admin-access-scroll-hint">{t('admin.access.scrollHint')}</p>}
      <div ref={ref} className="admin-access-table-wrap">
      <table className="admin-access-table admin-access-table--responsive" aria-label={t('admin.access.tableLabel')}>
        <thead>
          <tr>
            <th scope="col">{t('admin.access.actionHeader')}</th>
            {AUTHORITY_ROLES.map((role) => (
              <th key={role} scope="col" className="admin-access-table__role">
                <span className="admin-access-table__role-name">{authorityRoleLabel(role, t)}</span>
                <DerivedSource role={role} t={t} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {AUTHORITY_ACTIONS.map((action) => (
            <tr key={action}>
              <th scope="row" className="admin-access-table__action">{t(ACTION_LABEL_KEYS[action])}</th>
              {AUTHORITY_ROLES.map((role) => {
                const label = `${t(ACTION_LABEL_KEYS[action])} — ${authorityRoleLabel(role, t)}`
                return (
                  <td key={role} className="admin-access-table__value admin-access-table__value--wrap-no-ellipsis">
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
    </div>
  )
}

type AuthorityGroupKey = 'signals' | 'processes' | 'agents'

function FocusedAuthorityEditor({ draft, role, onChange, t, disabled, activeGroup }: {
  draft: Record<string, AuthorityScope>
  role: AuthorityRole
  onChange: (action: AuthorityAction, role: AuthorityRole, scope: AuthorityScope) => void
  t: ReturnType<typeof useT>
  disabled: boolean
  activeGroup?: AuthorityGroupKey
}) {
  const groups: { key: AuthorityGroupKey; title: string; actions: AuthorityAction[] }[] = [
    { key: 'signals', title: t('nav.signals'), actions: ['signal.post', 'signal.tag', 'signal.retract'] },
    { key: 'processes', title: t('nav.projectsProcesses'), actions: ['workline.manage', 'process.start', 'process.close'] },
    { key: 'agents', title: t('agentConnections.self.title'), actions: ['agent.connect'] },
  ]
  return <div className="access-editor">
    {groups.filter((group) => activeGroup == null || group.key === activeGroup).map((group) => <section className="access-editor__group" key={group.key}>
      <h3>{group.title}</h3>
      {group.actions.map((action) => <div className="access-editor__row" key={action}>
        <div className="access-editor__action">{t(ACTION_LABEL_KEYS[action])}</div>
        <div className="access-editor__scope">{role === 'admin'
          ? <span className="admin-access-fixed">{t('admin.access.adminFixed')}</span>
          : <Picker label={`${t(ACTION_LABEL_KEYS[action])} — ${authorityRoleLabel(role, t)}`} fullWidth hideLabel value={draft[authorityKey(action, role)] ?? 'none'} options={authorityPickerOptions(action, t)} onChange={(value) => onChange(action, role, value as AuthorityScope)} disabled={disabled} />}</div>
      </div>)}
    </section>)}
  </div>
}

export function AdminAccessPage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('admin.access.title') }))
  const isDesktop = useIsDesktop()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [savedAuthority, setSavedAuthority] = useState<RoleAuthorityRow[]>([])
  const [authorityDraft, setAuthorityDraft] = useState<Record<string, AuthorityScope>>({})
  const [authorityStatus, setAuthorityStatus] = useState<SaveState>('idle')
  // The level being edited, the phone's action group and the comparison view live in the URL (NV4).
  const [params, setParams] = useSearchParams()
  const levelParam = params.get('level')
  const groupParam = params.get('group')
  const mobileRole: AuthorityRole = (AUTHORITY_ROLES as readonly string[]).includes(levelParam ?? '') ? levelParam as AuthorityRole : 'member'
  const mobileActionGroup: AuthorityGroupKey = groupParam === 'processes' || groupParam === 'agents' ? groupParam : 'signals'
  const showComparison = params.get('compare') === '1'
  const setParam = useCallback((key: string, value: string | null) => setParams((prev) => {
    const next = new URLSearchParams(prev)
    if (value) next.set(key, value); else next.delete(key)
    return next
  }, { replace: true }), [setParams])
  const setMobileRole = (role: AuthorityRole) => setParam('level', role === 'member' ? null : role)
  const setMobileActionGroup = (group: AuthorityGroupKey) => setParam('group', group === 'signals' ? null : group)
  const setShowComparison = (update: (value: boolean) => boolean) => setParam('compare', update(showComparison) ? '1' : null)
  const offline = useIsOffline()

  const load = useCallback(async () => {
    setLoadState('loading')
    try {
      const normalized = normalizeAuthorityRows(await listRoleAuthority())
      setSavedAuthority(normalized)
      setAuthorityDraft(authorityDraftFromRows(normalized))
      setAuthorityStatus('idle')
      setLoadState('loaded')
    } catch {
      setLoadState('error')
    }
  }, [])

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

  const frameState = loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error' : 'default'
  // One save model for the page: edit freely, then Save access rules. Why Save is unavailable
  // (nothing changed, or no connection) sits beside it; after a save, the same slot says Saved.
  const saving = authorityStatus === 'saving'
  const saveReason = offline ? t('common.offline.reconnect')
    : saving ? undefined
    : authorityDirty ? t('admin.access.unsaved')
    : authorityStatus === 'saved' ? t('admin.access.saved')
    : t('admin.access.noChanges')
  const saveAction = loadState === 'loaded'
    ? <Button variant="primary" disabled={!authorityDirty || saving || offline} onClick={() => void handleSaveAuthority()}>
      {saving ? t('admin.access.saving') : t('admin.access.save')}
    </Button>
    : undefined

  return (
    <PageFamilyFrame
      family="management"
      title={t('admin.access.title')}
      jobSentence={t('admin.access.job')}
      action={saveAction}
      actionReason={saveAction && saveReason ? <span role="status">{saveReason}</span> : undefined}
      state={frameState}
    >
      <AdminSettingsNav />
      <RouteLeaveGuard when={authorityDirty} message={t('admin.access.leaveMessage')} />

      {loadState === 'loading' && <LoadingShell count={7} label={t('admin.access.loading')} />}

      {loadState === 'error' && (
        <ErrorState message={t('admin.access.loadError')} onRetry={load} />
      )}

      {loadState === 'loaded' && (
        <div className="admin-access-stack">
          <section className="access-policy" aria-labelledby="admin-access-authority-title">
            <div className="access-policy__intro">
              <h2 id="admin-access-authority-title">{t('admin.access.authorityTitle')}</h2>
              {isDesktop && <Button variant="outline" onClick={() => setShowComparison((value) => !value)} aria-expanded={showComparison}>{showComparison ? t('admin.access.hideComparison') : t('admin.access.compareLevels')}</Button>}
            </div>
            <div className="access-policy__scroll">
            <div className="access-policy__workspace">
              {isDesktop ? <nav className="access-policy__levels" aria-label={t('admin.access.levelsLabel')}>
                {AUTHORITY_ROLES.map((role) => <div className="access-policy__level" key={role}>
                  <button type="button" className={mobileRole === role ? 'access-policy__level-button access-policy__level-button--active' : 'access-policy__level-button'} aria-current={mobileRole === role ? 'true' : undefined} onClick={() => setMobileRole(role)}>
                    {authorityRoleLabel(role, t)}
                  </button>
                  {(role === 'team_lead' || role === 'bu_head') && <span className="access-policy__source"><DerivedSource role={role} t={t} /></span>}
                </div>)}
              </nav> : <div className="access-policy__mobile-level"><Picker label={t('admin.access.levelsLabel')} fullWidth value={mobileRole} options={AUTHORITY_ROLES.map((role) => ({ value: role, label: authorityRoleLabel(role, t) }))} onChange={(value) => setMobileRole(value as AuthorityRole)} disabled={authorityStatus === 'saving'} />{(mobileRole === 'team_lead' || mobileRole === 'bu_head') && <DerivedSource role={mobileRole} t={t} />}</div>}
              <div className="access-policy__focused">
                <div className="access-policy__selected"><h3>{t('admin.access.levelEditorTitle', { level: authorityRoleLabel(mobileRole, t) })}</h3></div>
                {!isDesktop && <div className="access-policy__mobile-groups" role="group" aria-label={t('admin.access.authorityTitle')}>
                  {([
                    ['signals', t('nav.signals')],
                    ['processes', t('nav.projectsProcesses')],
                    ['agents', t('agentConnections.self.title')],
                  ] as [AuthorityGroupKey, string][]).map(([key, label]) => <button key={key} type="button" aria-pressed={mobileActionGroup === key} onClick={() => setMobileActionGroup(key)}>{label}</button>)}
                </div>}
                <FocusedAuthorityEditor draft={authorityDraft} role={mobileRole} onChange={updateAuthority} t={t} disabled={authorityStatus === 'saving'} activeGroup={isDesktop ? undefined : mobileActionGroup} />
              </div>
            </div>
            {!isDesktop && <Button variant="outline" className="access-policy__compare-mobile" onClick={() => setShowComparison((value) => !value)} aria-expanded={showComparison}>{showComparison ? t('admin.access.hideComparison') : t('admin.access.compareLevels')}</Button>}
            {showComparison && <div className="access-policy__comparison"><AuthorityTable draft={authorityDraft} onChange={updateAuthority} t={t} disabled={authorityStatus === 'saving'} /></div>}
            <AccessChangeSummary changes={changedAuthorityRows} saved={savedAuthority} t={t} />
            {authorityStatus === 'error' && <ErrorState message={t('admin.access.saveError')} retryLabel={t('admin.access.retry')} onRetry={() => void handleSaveAuthority()} />}
            </div>
          </section>
        </div>
      )}
    </PageFamilyFrame>
  )
}
