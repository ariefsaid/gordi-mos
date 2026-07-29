// PositionPicker — "Position" (Jabatan) section mounted inside RoleEditor's dialog (ADR-0050 D5,
// FR-201/202/206, AC-125). Mirrors RoleEditor's checkbox-row structure/tokens/a11y, but for
// shared.person_roles assignment. Never labeled "Role" — the org-chart position is "Position".
// Checked = person.jabatan.some(j => j.role_id === role.id).
// Toggle ON → assignJabatan, OFF → removeJabatan; then onDone() (list reload) + onShowToast().
// Empty roles → muted "No positions defined yet" line (no crash).
// Errors surface inline via role="alert" (mirror RoleEditor's error block).

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { assignJabatan, removeJabatan } from '@/lib/db/admin-users'
import type { AdminPersonRow, RoleOption } from '@/lib/db/admin-users.types'

export interface PositionPickerProps {
  person: AdminPersonRow
  /** All org roles (Positions), from listRoles(). */
  roles: RoleOption[]
  /** Called after a successful assign/remove so the page can reload the list. */
  onDone: () => void
  /** Called with a success message after assign/remove succeeds. */
  onShowToast?: (message: string) => void
}

export function PositionPicker({ person, roles, onDone, onShowToast }: PositionPickerProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleToggle(role: RoleOption) {
    const isAssigned = person.jabatan.some((j) => j.role_id === role.id)
    setBusy(true)
    setError('')
    try {
      if (isAssigned) {
        await removeJabatan(person.id, role.id)
        onShowToast?.(`${role.name} removed from ${person.full_name}.`)
      } else {
        await assignJabatan(person.id, role.id)
        onShowToast?.(`${role.name} assigned to ${person.full_name}.`)
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Position change failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-6 py-5" style={{ borderTop: '1px solid var(--border)' }}>
      <h3
        className="mb-2 text-sm font-semibold"
        style={{ color: 'var(--foreground)' }}
      >
        Position
      </h3>
      <fieldset disabled={busy}>
        <legend className="sr-only">Position for {person.full_name}</legend>

        {roles.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            No positions defined yet
          </p>
        ) : (
          <div
            className="overflow-hidden rounded-md"
            style={{ border: '1px solid var(--input)' }}
          >
            {roles.map((role, i) => {
              const isAssigned = person.jabatan.some((j) => j.role_id === role.id)
              return (
                <label
                  key={role.id}
                  className={`flex items-start gap-3 px-3 py-2.5 select-none ${
                    busy ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-accent/60'
                  }`}
                  style={i > 0 ? { borderTop: '1px solid var(--input)' } : undefined}
                  // Defect 3: the whole row toggles, not just the 16px checkbox glyph — the
                  // checkbox glyph stops propagation (below) so this fires exactly once per click.
                  onClick={() => {
                    if (!busy) handleToggle(role)
                  }}
                >
                  <span className="mt-0.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isAssigned}
                      disabled={busy}
                      onChange={() => !busy && handleToggle(role)}
                      aria-label={role.name}
                    />
                  </span>
                  <span
                    className="text-sm font-medium leading-tight"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {role.name}
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </fieldset>

      {/* Inline error — mirrors RoleEditor's error block */}
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
  )
}
