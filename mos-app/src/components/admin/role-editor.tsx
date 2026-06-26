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

import { useState, useEffect, useId, useCallback, useRef } from 'react'
import { useAuth } from '@/auth/use-auth'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { grantRole, revokeRole } from '@/lib/db/admin-users'
import { ASSIGNABLE_ROLES } from '@/lib/db/admin-users.types'
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
        onShowToast?.(`${role} removed from ${person.full_name}.`)
      } else {
        await grantRole(person.id, role)
        onShowToast?.(`${role} granted to ${person.full_name}.`)
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
        className="relative w-full max-w-sm rounded-lg p-6"
        style={{ background: 'var(--card)', boxShadow: 'var(--shadow-overlay)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2
              id={titleId}
              className="subheading font-jakarta font-semibold"
              style={{ color: 'var(--foreground)' }}
            >
              Manage roles
            </h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              {person.full_name}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="Dismiss dialog"
            className="rounded-sm p-1"
            style={{ color: 'var(--muted-foreground)' }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Role checkboxes */}
        <fieldset className="mb-4" disabled={busy}>
          <legend className="sr-only">Access roles for {person.full_name}</legend>
          <div className="flex flex-col gap-3">
            {(ASSIGNABLE_ROLES as readonly string[]).map((role) => {
              const isGranted = person.access_roles.includes(role)
              const isSelfGuarded = isSelf && SELF_GUARDED_ROLES.has(role)
              // Last-admin guard: disable the admin checkbox for the last active admin (item 5)
              const isLastAdminGuarded = role === 'admin' && lastAdmin
              const isDisabled = isSelfGuarded || isLastAdminGuarded || busy

              // Reason for disabled state (tooltip/title)
              const disabledReason = isSelfGuarded
                ? "You can't change your own admin/finance role" // item 14: plain language
                : isLastAdminGuarded
                  ? "Can't remove the last admin"
                  : undefined

              return (
                <label
                  key={role}
                  className={`flex items-center gap-2.5 text-sm select-none ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  title={isDisabled ? disabledReason : undefined}
                >
                  <Checkbox
                    checked={isGranted}
                    disabled={isDisabled}
                    onChange={() => !isDisabled && handleToggle(role)}
                    aria-label={role}
                  />
                  <span style={{ color: 'var(--foreground)' }}>{role}</span>
                  {(isSelfGuarded || isLastAdminGuarded) && (
                    <span className="text-xs ml-auto" style={{ color: 'var(--muted-foreground)' }}>
                      {isLastAdminGuarded
                        ? 'Only admin — assign another first'
                        : "Can't change your own admin/finance role"}
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        </fieldset>

        {/* Inline error */}
        {error && (
          <div
            role="alert"
            className="mb-3 rounded-md px-3 py-2 text-sm"
            style={{
              background: 'color-mix(in srgb, var(--destructive) 10%, var(--card))',
              color: 'var(--destructive)',
              border: '1px solid color-mix(in srgb, var(--destructive) 30%, transparent)',
            }}
          >
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
