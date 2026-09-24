// RevenueScopePicker — the Revenue scope section of the person panel (ADR-0051, FR-323, AC-323),
// rendered only when the person holds `supervisor`. Same row grammar as PositionPicker, for
// reporting.supervisor_revenue_scope assignment.
// Never labeled "Role" — this is per-branch revenue visibility, not an access role.
// Grouped by channel (POS then B2B); each group has a "Whole {channel}" row (branch_code null)
// plus one row per branch (label branch_name ?? branch_code).
// Checked = person.revenue_scope.some(s => s.channel === row.channel && s.branch_code === row.branch_code).
// Toggle ON → assignRevenueScope, OFF → removeRevenueScope; each row reports its own save.

import { useT } from '@/i18n/use-t'
import { assignRevenueScope, removeRevenueScope } from '@/lib/db/admin-users'
import type { AdminPersonRow, RevenueScopeOption } from '@/lib/db/admin-users.types'
import { CheckboxRow } from './checkbox-row'
import { RowStatus } from './row-status'
import type { RowCommits } from './use-row-commits'

export interface RevenueScopePickerProps {
  person: AdminPersonRow
  /** Distinct live (channel, branch) options, from listRevenueScopeOptions(). */
  options: RevenueScopeOption[]
  /** The panel's shared row-commit state; keys here start with `scope:`. */
  commits: RowCommits<boolean>
  refresh: () => Promise<void>
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
function buildChannelGroups(options: RevenueScopeOption[], wholeLabel: (channel: string) => string): ChannelGroup[] {
  const channels = CHANNEL_ORDER.filter((c) => options.some((o) => o.channel === c)).concat(
    Array.from(new Set(options.map((o) => o.channel))).filter((c) => !CHANNEL_ORDER.includes(c)),
  )
  return channels.map((channel) => ({
    channel,
    rows: [
      { channel, branch_code: null, label: wholeLabel(channel) },
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

export function RevenueScopePicker({ person, options, commits, refresh }: RevenueScopePickerProps) {
  const t = useT()
  const busy = commits.busy('scope:')
  const groups = buildChannelGroups(options, (channel) => t('admin.scope.whole', { channel }))
  const isAssigned = (row: ScopeRow) =>
    person.revenue_scope.some((s) => s.channel === row.channel && s.branch_code === row.branch_code)

  function toggle(row: ScopeRow, checked: boolean) {
    const wanted = !checked
    const write = wanted
      ? () => assignRevenueScope(person.id, row.channel, row.branch_code)
      : () => removeRevenueScope(person.id, row.channel, row.branch_code)
    void commits.commit(rowKey(row), wanted, isAssigned(row), write, refresh)
  }

  return (
    <div className="admin-person-section__body">
      <p className="admin-person-section__helper">{t('admin.scope.helper')}</p>
      {groups.length === 0 ? (
        <p className="admin-person-section__empty">{t('admin.scope.none')}</p>
      ) : (
        groups.map((group) => (
          // One fieldset per channel — a screen reader announces the channel when entering its rows.
          <fieldset key={group.channel} className="mb-4 last:mb-0">
            <legend className="sr-only">
              {t('admin.scope.legend', { channel: group.channel, name: person.full_name })}
            </legend>
            <div aria-hidden="true" className="admin-person-section__group">
              {group.channel}
            </div>
            <div className="admin-choice-list">
              {group.rows.map((row, i) => {
                const key = rowKey(row)
                const checked = commits.display(key, isAssigned(row))
                const isWholeChannel = row.branch_code === null
                return (
                  <CheckboxRow
                    key={key}
                    label={row.label}
                    checked={checked}
                    disabled={busy}
                    divider={i > 0}
                    indent={!isWholeChannel}
                    emphasis={isWholeChannel}
                    onToggle={() => toggle(row, checked)}
                    trailing={
                      <RowStatus
                        status={commits.status(key)}
                        error={commits.error(key)}
                        item={row.label}
                        onRetry={() => void commits.retry(key)}
                      />
                    }
                  />
                )
              })}
            </div>
          </fieldset>
        ))
      )}
    </div>
  )
}

function rowKey(row: ScopeRow): string {
  return `scope:${row.channel}:${row.branch_code ?? '*'}`
}
