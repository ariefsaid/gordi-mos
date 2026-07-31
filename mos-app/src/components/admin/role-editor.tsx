// RoleEditor — "Access level" dialog for a person (FR-050, FR-205, AC-050, AC-121..123).
// Opens as a dialog; one checkbox per ASSIGNABLE_ROLES role, including 'manager' (ADR-0050 —
// company-wide financial view, admin-assignable, never labeled "Role").
// Checked = currently granted (from person.access_roles).
// Toggling ON → grantRole, OFF → revokeRole; calls onDone to trigger list reload.
// Self-assign guard: admin/finance/manager/supervisor disabled when person.id === viewer's person.id
// (FR-023, ADR-0050 D4 + ADR-0051).
// Revenue scope section (ADR-0051) mounts below Position, only when the person holds supervisor.
// Last-admin guard: admin checkbox disabled when person is the sole active admin (FR-041, item 5).
// ESC or Close button dismisses (no destructive consequence — normal dismiss is fine).
//
// Rework items:
//   item 4: focus trap + focus-return on close
//   item 5: last-admin guard — admin checkbox disabled with reason tooltip
//   item 6: onShowToast prop for success feedback
//   item 13: heading uses .subheading token instead of fontSize: '18px'
//   item 14: self-assign copy → plain language

import { useState, useEffect, useId, useCallback, useRef } from 'react'
import { useAuth } from '@/auth/use-auth'
import { Button } from '@/components/ui/button'
import { grantRole, revokeRole } from '@/lib/db/admin-users'
import { ASSIGNABLE_ROLES, ROLE_META, roleLabel } from '@/lib/db/admin-users.types'
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
  const auth = useAuth()
  const viewerPersonId = auth.status === 'authenticated' ? auth.viewer.person.id : ''
  const isSelf = person.id === viewerPersonId
  const lastAdmin = isLastAdmin(person, people)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const titleId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const invokerRef = useRef<HTMLElement | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  // Capture invoker for focus return
  useEffect(() => {
    if (open) {
      invokerRef.current = document.activeElement as HTMLElement | null
      // Auto-focus close button on open (first element, not destructive)
      requestAnimationFrame(() => {
        closeBtnRef.current?.focus()
      })
    } else {
      invokerRef.current?.focus?.()
    }
  }, [open])

  // Close on Esc + Tab trap
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const container = containerRef.current
      if (!container) return
      const FOCUSABLE =
        'button:not([disabled]):not([aria-disabled="true"]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    },
    [onClose],
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown])

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
      if (isGranted) {
        await revokeRole(person.id, role)
        onShowToast?.(`${roleLabel(role)} removed from ${person.full_name}.`)
      } else {
        await grantRole(person.id, role)
        onShowToast?.(`${roleLabel(role)} granted to ${person.full_name}.`)
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Role change failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'var(--scrim)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-lg"
        style={{
          background: 'var(--card)',
          boxShadow: 'var(--shadow-overlay)',
          border: '1px solid var(--input)',
          borderRadius: 'var(--radius)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — stays outside the scroll area so it's always reachable */}
        <div className="flex shrink-0 items-start justify-between gap-3 px-6 pt-6 pb-4">
          <div>
            <h2
              id={titleId}
              className="subheading text-lg font-semibold"
              style={{ color: 'var(--foreground)' }}
            >
              Access level
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {person.full_name}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="Dismiss dialog"
            className="-mr-1 -mt-1 rounded-sm p-1 hover:bg-accent/60"
            style={{ color: 'var(--muted-foreground)' }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="shrink-0" style={{ borderTop: '1px solid var(--border)' }} />

        {/* Scrollable body — Access-level rows + Position section. Constrained so the header
            ✕ and footer Close stay reachable on short viewports (WCAG 1.4.10). */}
        <div
          data-testid="role-editor-scroll-body"
          className="min-h-0 flex-1 overflow-y-auto"
        >
        {/* Role rows — grouped bordered container, label + description per row */}
        <div className="px-6 py-5">
          <fieldset disabled={busy}>
            <legend className="sr-only">Access level for {person.full_name}</legend>
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
                const meta = ROLE_META[role] ?? { label: role, description: '' }

                // Reason for disabled state (tooltip/title)
                const disabledReason = isSelfGuarded
                  ? "You can't change your own admin, finance, manager, or supervisor access" // item 14: plain language
                  : isLastAdminGuarded
                    ? "Can't remove the last admin"
                    : undefined

                // Description shows either the guard reason or the role's normal description
                const description = (isSelfGuarded || isLastAdminGuarded)
                  ? isLastAdminGuarded
                    ? 'Only admin — assign another first'
                    : "Can't change your own admin, finance, manager, or supervisor access"
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
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
