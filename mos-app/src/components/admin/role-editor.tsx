// RoleEditor — manage access roles for a person (FR-050, AC-050).
// Opens as a dialog; one checkbox per ASSIGNABLE_ROLES role (never 'manager').
// Checked = currently granted (from person.access_roles).
// Toggling ON → grantRole, OFF → revokeRole; calls onDone to trigger list reload.
// Self-assign guard: admin/finance disabled when person.id === viewer's person.id (FR-023).
// ESC or Close button dismisses (no destructive consequence — normal dismiss is fine).

import { useState, useEffect, useId, useCallback } from 'react'
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
  open: boolean
  onClose: () => void
  /** Called after a successful grant/revoke so the page can reload the list. */
  onDone: () => void
}

export function RoleEditor({ person, open, onClose, onDone }: RoleEditorProps) {
  const auth = useAuth()
  const viewerPersonId = auth.status === 'authenticated' ? auth.viewer.person.id : ''
  const isSelf = person.id === viewerPersonId

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const titleId = useId()

  // Close on Esc
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
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
      } else {
        await grantRole(person.id, role)
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
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-sm rounded-lg p-6 shadow-lg"
        style={{ background: 'var(--card)', boxShadow: 'var(--shadow-overlay)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2
              id={titleId}
              className="font-jakarta font-semibold"
              style={{ fontSize: '18px', color: 'var(--foreground)' }}
            >
              Manage roles
            </h2>
            <p
              className="text-sm mt-0.5"
              style={{ color: 'var(--muted-foreground)' }}
            >
              {person.full_name}
            </p>
          </div>
          <button
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
              const isDisabled = isSelfGuarded || busy

              return (
                <label
                  key={role}
                  className={`flex items-center gap-2.5 text-sm select-none ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <Checkbox
                    checked={isGranted}
                    disabled={isDisabled}
                    onChange={() => !isDisabled && handleToggle(role)}
                    aria-label={role}
                  />
                  <span style={{ color: 'var(--foreground)' }}>{role}</span>
                  {isSelfGuarded && (
                    <span
                      className="text-xs ml-auto"
                      style={{ color: 'var(--muted-foreground)' }}
                    >
                      self-assign protected
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
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
