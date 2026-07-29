// RevenueScopePicker — "Revenue scope" section mounted inside RoleEditor's dialog (ADR-0051,
// FR-323, AC-323), rendered only when the person holds `supervisor`. Mirrors PositionPicker's
// checkbox-row structure/tokens/a11y, but for reporting.supervisor_revenue_scope assignment.
// Never labeled "Role" — this is per-branch revenue visibility, not an access role.
// Grouped by channel (POS then B2B); each group has a "Whole {channel}" row (branch_code null)
// plus one row per branch (label branch_name ?? branch_code).
// Checked = person.revenue_scope.some(s => s.channel === row.channel && s.branch_code === row.branch_code).
// Toggle ON → assignRevenueScope, OFF → removeRevenueScope; then onDone() (list reload) + onShowToast().
// Empty options → muted "No revenue branches available yet" line (no crash).
// Errors surface inline via role="alert" (mirror PositionPicker's error block).

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { assignRevenueScope, removeRevenueScope } from '@/lib/db/admin-users'
import type { AdminPersonRow, RevenueScopeOption } from '@/lib/db/admin-users.types'

export interface RevenueScopePickerProps {
  person: AdminPersonRow
  /** Distinct live (channel, branch) options, from listRevenueScopeOptions(). */
  options: RevenueScopeOption[]
  /** Called after a successful assign/remove so the page can reload the list. */
  onDone: () => void
  /** Called with a success message after assign/remove succeeds. */
  onShowToast?: (message: string) => void
}

// One toggleable row: either "Whole {channel}" (branch_code null) or a specific branch.
interface ScopeRow {
  channel: string
  branch_code: string | null
  label: string
}

const CHANNEL_ORDER = ['POS', 'B2B']

/** Groups options by channel (POS then B2B); each group gets a leading "Whole {channel}" row. */
function buildRows(options: RevenueScopeOption[]): ScopeRow[] {
  const channels = CHANNEL_ORDER.filter((c) => options.some((o) => o.channel === c)).concat(
    Array.from(new Set(options.map((o) => o.channel))).filter((c) => !CHANNEL_ORDER.includes(c)),
  )
  const rows: ScopeRow[] = []
  for (const channel of channels) {
    rows.push({ channel, branch_code: null, label: `Whole ${channel}` })
    for (const opt of options.filter((o) => o.channel === channel)) {
      rows.push({ channel, branch_code: opt.branch_code, label: opt.branch_name ?? opt.branch_code ?? '' })
    }
  }
  return rows
}

export function RevenueScopePicker({ person, options, onDone, onShowToast }: RevenueScopePickerProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const rows = buildRows(options)

  async function handleToggle(row: ScopeRow) {
    const isAssigned = person.revenue_scope.some(
      (s) => s.channel === row.channel && s.branch_code === row.branch_code,
    )
    setBusy(true)
    setError('')
    try {
      if (isAssigned) {
        await removeRevenueScope(person.id, row.channel, row.branch_code)
      } else {
        await assignRevenueScope(person.id, row.channel, row.branch_code)
      }
      onShowToast?.(`Revenue scope updated for ${person.full_name}.`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revenue scope change failed. Try again.')
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
        Revenue scope
      </h3>
      <p className="mb-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
        Which branches&apos; revenue this person can see
      </p>
      <fieldset disabled={busy}>
        <legend className="sr-only">Revenue scope for {person.full_name}</legend>

        {rows.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            No revenue branches available yet
          </p>
        ) : (
          <div
            className="overflow-hidden rounded-md"
            style={{ border: '1px solid var(--input)' }}
          >
            {rows.map((row, i) => {
              const isAssigned = person.revenue_scope.some(
                (s) => s.channel === row.channel && s.branch_code === row.branch_code,
              )
              return (
                <label
                  key={`${row.channel}-${row.branch_code ?? 'whole'}`}
                  className={`flex items-start gap-3 px-3 py-2.5 select-none ${
                    busy ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-accent/60'
                  }`}
                  style={i > 0 ? { borderTop: '1px solid var(--input)' } : undefined}
                  // Defect 3 (mirrored from PositionPicker): the whole row toggles, not just the
                  // checkbox glyph — the glyph stops propagation so this fires exactly once per click.
                  onClick={() => {
                    if (!busy) handleToggle(row)
                  }}
                >
                  <span className="mt-0.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isAssigned}
                      disabled={busy}
                      onChange={() => !busy && handleToggle(row)}
                      aria-label={row.label}
                    />
                  </span>
                  <span
                    className="text-sm font-medium leading-tight"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {row.label}
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </fieldset>

      {/* Inline error — mirrors PositionPicker's error block */}
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
