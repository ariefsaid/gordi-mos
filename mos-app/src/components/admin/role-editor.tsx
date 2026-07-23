// RoleEditor — manage access roles for a person (FR-050, AC-050).
// Opens as a dialog; one checkbox per ASSIGNABLE_ROLES role (never 'manager').
// Checked = currently granted (from person.access_roles).
// Toggling ON → grantRole, OFF → revokeRole; calls onDone to trigger list reload.
// Self-assign guard: admin/finance disabled when person.id === viewer's person.id (FR-023).
// Last-admin guard: admin checkbox disabled when person is the sole active admin (FR-041, item 5).
// ESC or Close button dismisses (no destructive consequence — normal dismiss is fine).
//
// Rework items:
//   item 4: focus trap + focus-return on close
//   item 5: last-admin guard — admin checkbox disabled with reason tooltip
//   item 6: onShowToast prop for success feedback
//   item 13: heading uses .subheading token instead of fontSize: '18px'
//   item 14: self-assign copy → plain language

import { useState, useEffect, useId } from 'react'
import { useT } from '@/i18n/use-t'
import { useAuth } from '@/auth/use-auth'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { ModalShell } from '@/components/ui/modal-shell'
import { CloseIcon } from '@/shell/icons'
import { grantRole, revokeRole } from '@/lib/db/admin-users'
import { ASSIGNABLE_ROLES, localizedRoleMeta } from '@/lib/db/admin-users.types'
import type { AdminPersonRow } from '@/lib/db/admin-users.types'

// Roles protected by self-assign guard (FR-023)
const SELF_GUARDED_ROLES = new Set(['admin', 'finance'])

export interface RoleEditorProps {
  person: AdminPersonRow
  /** The full people list — needed to compute last-admin guard (item 5, FR-041). */
  people?: AdminPersonRow[]
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
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4">
          <div>
            <h2
              id={titleId}
              className="subheading text-lg font-semibold"
              style={{ color: 'var(--foreground)' }}
            >
              {t('admin.people.action.manageRoles')}
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
        <div style={{ borderTop: '1px solid var(--border)' }} />

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

                return (
                  <label
                    key={role}
                    className={`flex items-start gap-3 px-3 py-2.5 select-none ${
                      isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-accent/60'
                    }`}
                    style={i > 0 ? { borderTop: '1px solid var(--input)' } : undefined}
                    title={isDisabled ? disabledReason : undefined}
                  >
                    <span className="mt-0.5">
                      <Checkbox
                        checked={isGranted}
                        disabled={isDisabled}
                        onChange={() => !isDisabled && handleToggle(role)}
                        aria-label={meta.label}
                      />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span
                        className="text-sm font-medium leading-tight"
                        style={{ color: 'var(--foreground)' }}
                      >
                        {meta.label}
                      </span>
                      <span
                        className="text-xs leading-snug"
                        style={{ color: 'var(--muted-foreground)' }}
                      >
                        {(isSelfGuarded || isLastAdminGuarded)
                          ? isLastAdminGuarded
                            ? t('admin.roles.lastAdminHint')
                            : t('admin.roles.selfGuardShort')
                          : meta.description}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          {/* Inline error */}
          {error && (
            <div
              role="alert"
              className="mt-4 rounded-md px-3 py-2 text-sm"
              style={{
                background: 'color-mix(in srgb, var(--destructive) 10%, var(--card))',
                color: 'var(--destructive)',
                border: '1px solid color-mix(in srgb, var(--destructive) 30%, transparent)',
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--border)' }} />
        <div className="flex justify-end px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t('admin.roles.close')}
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}
