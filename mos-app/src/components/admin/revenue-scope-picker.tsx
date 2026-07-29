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
import { CheckboxRow, PickerError } from './checkbox-row'
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

interface ChannelGroup {
  channel: string
  rows: ScopeRow[]
}

/** Groups options by channel (POS then B2B); each group's first row is "Whole {channel}",
 *  followed by that channel's branch rows — never a flat cross-channel list (design-review). */
function buildChannelGroups(options: RevenueScopeOption[]): ChannelGroup[] {
  const channels = CHANNEL_ORDER.filter((c) => options.some((o) => o.channel === c)).concat(
    Array.from(new Set(options.map((o) => o.channel))).filter((c) => !CHANNEL_ORDER.includes(c)),
  )
  return channels.map((channel) => ({
    channel,
    rows: [
      { channel, branch_code: null, label: `Whole ${channel}` },
      ...options
        .filter((o) => o.channel === channel)
        .map((opt) => ({
          channel,
          branch_code: opt.branch_code,
          label: opt.branch_name ?? opt.branch_code ?? '',
        })),
    ],
  }))
}

export function RevenueScopePicker({ person, options, onDone, onShowToast }: RevenueScopePickerProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const groups = buildChannelGroups(options)

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
      {groups.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          No revenue branches available yet
        </p>
      ) : (
        groups.map((group) => (
          // One fieldset per channel — a screen reader announces the channel (via its own
          // legend) when entering that channel's rows, instead of one flat legend spanning
          // every channel (design-review: channel grouping wasn't expressed before).
          <fieldset key={group.channel} disabled={busy} className="mb-4 last:mb-0">
            <legend className="sr-only">
              Revenue scope — {group.channel} for {person.full_name}
            </legend>
            <div
              aria-hidden="true"
              className="mb-1.5 px-0.5 text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--muted-foreground)' }}
            >
              {group.channel}
            </div>
            <div
              className="overflow-hidden rounded-md"
              style={{ border: '1px solid var(--input)' }}
            >
              {group.rows.map((row, i) => {
                const isWholeChannel = row.branch_code === null
                return (
                  <CheckboxRow
                    key={`${row.channel}-${row.branch_code ?? 'whole'}`}
                    label={row.label}
                    checked={person.revenue_scope.some(
                      (s) => s.channel === row.channel && s.branch_code === row.branch_code,
                    )}
                    disabled={busy}
                    divider={i > 0}
                    indent={!isWholeChannel}
                    emphasis={isWholeChannel}
                    onToggle={() => handleToggle(row)}
                  />
                )
              })}
            </div>
          </fieldset>
        ))
      )}

      <PickerError message={error} />
    </div>
  )
}
