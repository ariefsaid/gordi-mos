// RoleEditor — "Access level" dialog for a person (FR-050, FR-205, AC-050, AC-121..123).
// Opens as a dialog on the shared ModalShell; one checkbox per ASSIGNABLE_ROLES role, including
// 'manager' (ADR-0050 — company-wide financial view, admin-assignable, never labeled "Role").
// Checked = currently granted (from person.access_roles).
// Toggling ON → grantRole, OFF → revokeRole; calls onDone to trigger list reload.
// Self-assign guard: admin/finance/manager/supervisor disabled when person.id === viewer's person.id
// (FR-023, ADR-0050 D4 + ADR-0051).
// Position (Jabatan) section mounts below Access level; Revenue scope (ADR-0051) below that, only
// when the person holds supervisor.
// Last-admin guard: admin checkbox disabled when person is the sole active admin (FR-041, item 5).
// ESC or Close button dismisses — except while a grant/revoke is in flight, where dismissal would
// strand a pending write behind a closed dialog.
//
// Interaction ownership (#201): focus trap, focus return, Esc and the scrim all belong to
// ModalShell now — this component supplies content and dismissal POLICY only. The bespoke trap
// and invoker capture it used to carry are deleted, not disabled.
//
// Rework items:
//   item 5: last-admin guard — admin checkbox disabled with reason tooltip
//   item 6: onShowToast prop for success feedback
//   item 13: heading uses .subheading token instead of fontSize: '18px'
//   item 14: self-assign copy → plain language

import { useState, useEffect, useId } from 'react'
import { useT } from '@/i18n/use-t'
import { useAuth } from '@/auth/use-auth'
import { Button } from '@/components/ui/button'
import { ModalShell } from '@/components/ui/modal-shell'
import { CloseIcon } from '@/shell/icons'
import { grantRole, revokeRole } from '@/lib/db/admin-users'
import { ASSIGNABLE_ROLES, localizedRoleMeta } from '@/lib/db/admin-users.types'
import type { AdminPersonRow, RoleOption, RevenueScopeOption } from '@/lib/db/admin-users.types'
import { PositionPicker } from './position-picker'
import { RevenueScopePicker } from './revenue-scope-picker'
import { CheckboxRow, PickerError } from './checkbox-row'

// Roles protected by self-assign guard (FR-023, ADR-0050 D4 + ADR-0051)
const SELF_GUARDED_ROLES = new Set(['admin', 'finance', 'manager', 'supervisor'])

export interface RoleEditorProps {
  person: AdminPersonRow
  /** The full people list — needed to compute last-admin guard (item 5, FR-041). */
  people?: AdminPersonRow[]
  /** Org roles (Positions) for the Position section, from listRoles() (ADR-0050). */
  roles?: RoleOption[]
  /** Live revenue-branch options for the Revenue scope section, from listRevenueScopeOptions() (ADR-0051). */
  scopeOptions?: RevenueScopeOption[]
  open: boolean
  onClose: () => void
  /** Called after a successful grant/revoke so the page can reload the list. */
  onDone: () => void
  /** Called with a success message after grant/revoke succeeds (item 6). */
  onShowToast?: (message: string) => void
}

/** Returns true if person is the only active admin in the list (FR-041). */
function isLastAdmin(person: AdminPersonRow, people: AdminPersonRow[]): boolean {
  const activeAdminCount = people.filter(
    (p) => p.access_roles.includes('admin') && p.login === 'active' && !p.archived_at,
  ).length
  return (
    person.access_roles.includes('admin') &&
    person.login === 'active' &&
    !person.archived_at &&
    activeAdminCount === 1
  )
}

export function RoleEditor({
  person,
  people = [],
  roles = [],
  scopeOptions,
  open,
  onClose,
  onDone,
  onShowToast,
}: RoleEditorProps) {
  const t = useT()
  const auth = useAuth()
  const viewerPersonId = auth.status === 'authenticated' ? auth.viewer.person.id : ''
  const isSelf = person.id === viewerPersonId
  const lastAdmin = isLastAdmin(person, people)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const titleId = useId()

  // Reset error whenever dialog opens / person changes
  useEffect(() => {
    if (open) setError('')
  }, [open, person.id])

  if (!open) return null

  async function handleToggle(role: string) {
    const isGranted = person.access_roles.includes(role)
    setBusy(true)
    setError('')
    try {
      // The toast names the role in the viewer's locale (it previously leaked the raw slug).
      const roleName = localizedRoleMeta(role, t).label
      if (isGranted) {
        await revokeRole(person.id, role)
        onShowToast?.(t('admin.roles.removedToast', { role: roleName, name: person.full_name }))
      } else {
        await grantRole(person.id, role)
        onShowToast?.(t('admin.roles.grantedToast', { role: roleName, name: person.full_name }))
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.roles.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      ariaLabelledBy={titleId}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
    >
      <div className="role-editor-panel">
        {/* Header — stays outside the scroll area so it's always reachable */}
        <div className="flex shrink-0 items-start justify-between gap-3 px-6 pt-6 pb-4">
          <div>
            <h2
              id={titleId}
              className="subheading text-lg font-semibold"
              style={{ color: 'var(--foreground)' }}
            >
              {t('admin.roles.title')}
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {person.full_name}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('admin.roles.dismissAria')}
            className="-mr-1 -mt-1 rounded-sm p-1 hover:bg-accent/60"
            style={{ color: 'var(--muted-foreground)' }}
            onClick={onClose}
            disabled={busy}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="shrink-0" style={{ borderTop: '1px solid var(--border)' }} />

        {/* Scrollable body — Access-level rows + Position + Revenue scope. Constrained so the
            header ✕ and footer Close stay reachable on short viewports (WCAG 1.4.10). This is
            NOT ModalShell's own `overflow: auto` doing the work: the surface is switched to
            `overflow: hidden` for this panel (modal-shell.css) precisely so the header and
            footer can stay put while only this region scrolls. */}
        <div
          data-testid="role-editor-scroll-body"
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {/* Role rows — grouped bordered container, label + description per row */}
          <div className="px-6 py-5">
            <fieldset disabled={busy}>
              <legend className="sr-only">{t('admin.roles.legend', { name: person.full_name })}</legend>
              <div
                className="overflow-hidden rounded-md"
                style={{ border: '1px solid var(--input)' }}
              >
                {(ASSIGNABLE_ROLES as readonly string[]).map((role, i) => {
                  const isGranted = person.access_roles.includes(role)
                  const isSelfGuarded = isSelf && SELF_GUARDED_ROLES.has(role)
                  // Last-admin guard: disable the admin checkbox for the last active admin (item 5)
                  const isLastAdminGuarded = role === 'admin' && lastAdmin
                  const isDisabled = isSelfGuarded || isLastAdminGuarded || busy
                  const meta = localizedRoleMeta(role, t)

                  // Reason for disabled state (tooltip/title)
                  const disabledReason = isSelfGuarded
                    ? t('admin.roles.selfGuard') // item 14: plain language
                    : isLastAdminGuarded
                      ? t('admin.people.lastAdmin')
                      : undefined

                  // Description shows either the guard reason or the role's normal description
                  const description = (isSelfGuarded || isLastAdminGuarded)
                    ? isLastAdminGuarded
                      ? t('admin.roles.lastAdminHint')
                      : t('admin.roles.selfGuardShort')
                    : meta.description

                  return (
                    <CheckboxRow
                      key={role}
                      label={meta.label}
                      checked={isGranted}
                      disabled={isDisabled}
                      divider={i > 0}
                      description={description}
                      title={isDisabled ? disabledReason : undefined}
                      onToggle={() => handleToggle(role)}
                    />
                  )
                })}
              </div>
            </fieldset>

            {/* Inline error */}
            <PickerError message={error} />
          </div>

          {/* Position section (Jabatan, ADR-0050) — bordered, same dialog, below Access level */}
          <PositionPicker person={person} roles={roles} onDone={onDone} onShowToast={onShowToast} />

          {/* Revenue scope section (ADR-0051) — only when the person holds supervisor */}
          {person.access_roles.includes('supervisor') && (
            <RevenueScopePicker
              person={person}
              options={scopeOptions ?? []}
              onDone={onDone}
              onShowToast={onShowToast}
            />
          )}
        </div>
        {/* end scrollable body */}

        {/* Footer — stays outside the scroll area so it's always reachable */}
        <div className="shrink-0" style={{ borderTop: '1px solid var(--border)' }} />
        <div className="flex shrink-0 justify-end px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t('admin.roles.close')}
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}
