import { Chevron } from '@/shell/icons'
import { Tag } from '@/components/ui/tag'
import { useT } from '@/i18n/use-t'

type GroupHeaderRowProps = {
  /** The group label (status name, person name, BU name, or work-line name). */
  label: string
  /** Number of leaf rows in this group. */
  count: number
  /** Number of overdue leaf rows in this group (subtotal). */
  overdue: number
  /** Whether the group is collapsed (leaf rows hidden). */
  collapsed: boolean
  /** colSpan for the full-width header cell (matches the table column count). */
  colSpan: number
  /** Toggle collapse/expand of this group. */
  onToggle: () => void
  /** Open the create surface pre-filled for this group's dimension. */
  onAddTask: () => void
  /** Apply the transient overdue-only filter (AC-128). */
  onOverdueFilter: () => void
  /** Pre-fill descriptor surfaced for tests/e2e (e.g. "r=<personId>"). */
  prefill?: string
  /** Read-only render for reuse outside the task editor surface. */
  readOnly?: boolean
  /**
   * Work-line type tag (only when groupBy==='workline').
   * 'project' → blue tag "Project"; 'process' → gray tag "Daily / ongoing".
   * null = "No work-line" group; omit for all other groupBy dimensions.
   * Text label is always present (never color-only) — WCAG 1.4.1 compliance.
   */
  workLineType?: 'project' | 'process' | null
  /**
   * @deprecated Not used — the table uses a single shared <tbody> (virtualization
   * requirement) so no element can carry a per-group id. Kept in the type for
   * backward-compatibility; the caret carries aria-expanded only (sufficient for
   * screen readers). Pass nothing or omit.
   */
  controlsId?: string
  /**
   * Step 6 (B8, AC-622 render / OD-P3-6): when this group is an occurrence group, its derived
   * `mos.process_run_rollup` counts. Presence supersedes the generic plain `count`/overdue-subtotal
   * display with the occurrence summary grammar ("${done}/${total} done · N overdue · N to
   * assign") — reuses this SAME header row, never a second/divergent header component. `label`
   * carries the run's caption (never the internal-only string "Process Run", FR-611).
   */
  occurrenceRollup?: { total: number; done: number; overdue: number; pendingUnresolved: number }
  /**
   * Step 6 (C2, spec §5): opens the pending-PIC resolution surface (PendingResolution, B7) for
   * this occurrence. When present AND `occurrenceRollup.pendingUnresolved > 0`, a separate
   * "N to assign" affordance renders (distinct from the plain roll-up summary text above — that
   * text stays a single unsplit string so it keeps reporting the count even while this button is
   * the actionable entry point). Omitted entirely at zero-pending or when no handler is given.
   */
  onAssignPending?: () => void
}

/**
 * Work-line type label tag (FR-233 / WCAG 1.4.1 compliance).
 * Uses the existing Tag component (--ds-tag-background/text-{color} tokens).
 * Text label is ALWAYS present — never color-only.
 * project → blue categorical tag; process → gray calm tag.
 */
function WorkLineTypeTag({ type }: { type: 'project' | 'process' }) {
  const t = useT()
  if (type === 'project') {
    return (
      <Tag color="blue" weight="medium" className="wl-type-tag">
        {t('tasks.type.project')}
      </Tag>
    )
  }
  return (
    <Tag color="gray" weight="medium" className="wl-type-tag">
      {t('tasks.type.daily')}
    </Tag>
  )
}

/**
 * Group header row (OD-P3-6, design-plan §2.6). A full-width <tr class="grp">
 * rendered as a clean hairline-separated row: caret toggle + label + [work-line
 * type tag] + count + overdue subtotal (click-to-filter, only when >0) + "+ Add task".
 * Groups are always shown (incl. empty) for layout stability.
 *
 * aria-controls is intentionally omitted: the table body is a single shared
 * <tbody> (required for @tanstack/react-virtual windowing), so no single element
 * can carry the per-group id that aria-controls would reference. The caret's
 * aria-expanded is sufficient to communicate the collapsed/expanded state to
 * assistive technology.
 */
export function GroupHeaderRow({
  label, count, overdue, collapsed, colSpan,
  onToggle, onAddTask, onOverdueFilter, prefill, workLineType, readOnly, occurrenceRollup,
  onAssignPending,
}: GroupHeaderRowProps) {
  const t = useT()
  return (
    <tr className="grp">
      <td colSpan={colSpan}>
        <div className="gbar">
          <button
            type="button"
            className="caret"
            aria-expanded={!collapsed}
            aria-label={collapsed ? t('tasks.group.expand', { label }) : t('tasks.group.collapse', { label })}
            onClick={onToggle}
          >
            {/* IXD-1: ONE shared Chevron, rotated −90° when collapsed (down = expanded). */}
            <Chevron className={`grp-chev${collapsed ? ' grp-chev-collapsed' : ''}`} />
          </button>
          <span className="glabel">{label}</span>
          {/* FR-233: work-line type label — text always present, never color-only (WCAG 1.4.1) */}
          {workLineType != null && (
            <WorkLineTypeTag type={workLineType} />
          )}
          {occurrenceRollup ? (
            <span className="gcount tabular-nums">
              {t('processes.rollup.summary', {
                done: occurrenceRollup.done, total: occurrenceRollup.total,
                overdue: occurrenceRollup.overdue, pending: occurrenceRollup.pendingUnresolved,
              })}
            </span>
          ) : (
            <span className="gcount tabular-nums">{count}</span>
          )}
          {occurrenceRollup && occurrenceRollup.pendingUnresolved > 0 && onAssignPending && (
            <button
              type="button"
              className="gsub gsub-pending"
              onClick={onAssignPending}
            >
              {t('processes.pending.assignCount', { count: occurrenceRollup.pendingUnresolved })}
            </button>
          )}
          {!occurrenceRollup && overdue > 0 && (
            readOnly
              ? <span>· {t('tasks.filter.overdueCount', { count: overdue })}</span>
              : (
                  <button
                    type="button"
                    className="gsub"
                    aria-label={t('tasks.filter.overdueAria', { count: overdue })}
                    onClick={onOverdueFilter}
                  >
                    · {t('tasks.filter.overdueCount', { count: overdue })}
                  </button>
                )
          )}
          {!readOnly && (
            <button
              type="button"
              className="gadd"
              aria-label={t('tasks.group.add', { label })}
              data-prefill={prefill}
              onClick={onAddTask}
            >
              {t('tasks.add')}
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
