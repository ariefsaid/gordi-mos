// AdminAccessPage — Admin Settings › Roles & permissions: the role × action authority table.
// It edits organization policy in bulk, so unlike the eager rows elsewhere in Admin Settings it
// keeps one explicit "Save access rules", and leaving with unsaved changes asks first.
// Role names match the person panel's Access section; the two derived columns say where they
// come from and link there.

import { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { Picker, type PickerOption } from '@/components/ui/picker'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { AdminSettingsNav } from '@/components/admin/admin-settings-nav'
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
  const [more, setMore] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      el.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [])
  return { ref, more }
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
  const { ref, more } = useOverflowRight<HTMLDivElement>()
  return (
    <div className={more ? 'admin-access-table-frame admin-access-table-frame--more' : 'admin-access-table-frame'}>
      {more && <p className="admin-access-scroll-hint">{t('admin.access.scrollHint')}</p>}
      <div ref={ref} className="admin-access-table-wrap">
      <table className="admin-access-table" aria-label={t('admin.access.tableLabel')}>
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
          options={AUTHORITY_ROLES.map((option) => ({ value: option, label: authorityRoleLabel(option, t) }))}
          onChange={(value) => onRoleChange(value as AuthorityRole)}
          disabled={disabled}
        />
        <DerivedSource role={role} t={t} />
      </div>
      <div className="admin-access-mobile__actions" aria-label={t('admin.access.tableLabel')}>
        {AUTHORITY_ACTIONS.map((action) => {
          const actionLabel = t(ACTION_LABEL_KEYS[action])
          return (
            <div key={action} className="admin-access-mobile__action">
              <div className="admin-access-mobile__action-name">{actionLabel}</div>
              <div className="admin-access-mobile__scope">
                {role === 'admin' ? (
                  <span className="admin-access-fixed admin-access-mobile__scope-fixed" aria-label={`${actionLabel} — ${authorityRoleLabel(role, t)} — ${t('admin.access.adminFixed')}`}>
                    {t('admin.access.adminFixed')}
                  </span>
                ) : (
                  <Picker
                    label={`${actionLabel} — ${authorityRoleLabel(role, t)}`}
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

export function AdminAccessPage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('admin.access.title') }))
  const isDesktop = useIsDesktop()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [savedAuthority, setSavedAuthority] = useState<RoleAuthorityRow[]>([])
  const [authorityDraft, setAuthorityDraft] = useState<Record<string, AuthorityScope>>({})
  const [authorityStatus, setAuthorityStatus] = useState<SaveState>('idle')
  const [mobileRole, setMobileRole] = useState<AuthorityRole>('member')

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
  const showMobileSave = !isDesktop && (authorityDirty || authorityStatus !== 'idle')
  const saveAuthorityControl = (
    <div className="admin-access-save">
      {authorityDirty && authorityStatus !== 'saving' && (
        <span className="admin-access-unsaved">{t('admin.access.unsaved')}</span>
      )}
      <Button variant="primary" disabled={!authorityDirty || authorityStatus === 'saving'} onClick={() => void handleSaveAuthority()}>
        {authorityStatus === 'saving' ? t('admin.access.saving') : t('admin.access.save')}
      </Button>
    </div>
  )

  return (
    <PageFamilyFrame
      family="management"
      title={t('admin.access.title')}
      jobSentence={t('admin.access.job')}
      state={frameState}
    >
      <AdminSettingsNav />
      <RouteLeaveGuard when={authorityDirty} message={t('admin.access.leaveMessage')} />

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
        </div>
      )}
    </PageFamilyFrame>
  )
}
