import { Chevron } from '@/shell/icons'
import { Tag } from '@/components/ui/tag'

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
}

/**
 * Work-line type label tag (FR-233 / WCAG 1.4.1 compliance).
 * Uses the existing Tag component (--ds-tag-background/text-{color} tokens).
 * Text label is ALWAYS present — never color-only.
 * project → blue categorical tag; process → gray calm tag.
 */
function WorkLineTypeTag({ type }: { type: 'project' | 'process' }) {
  if (type === 'project') {
    return (
      <Tag color="blue" weight="medium" className="wl-type-tag">
        Project
      </Tag>
    )
  }
  return (
    <Tag color="gray" weight="medium" className="wl-type-tag">
      Daily / ongoing
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
  onToggle, onAddTask, onOverdueFilter, prefill, workLineType,
}: GroupHeaderRowProps) {
  return (
    <tr className="grp">
      <td colSpan={colSpan}>
        <div className="gbar">
          <button
            type="button"
            className="caret"
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Expand ${label} group` : `Collapse ${label} group`}
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
          <span className="gcount tabular-nums">{count}</span>
          {overdue > 0 && (
            <button
              type="button"
              className="gsub"
              aria-label={`Filter to ${overdue} overdue tasks`}
              onClick={onOverdueFilter}
            >
              · {overdue} overdue
            </button>
          )}
          <button
            type="button"
            className="gadd"
            aria-label={`Add task to ${label}`}
            data-prefill={prefill}
            onClick={onAddTask}
          >
            + Add task
          </button>
        </div>
      </td>
    </tr>
  )
}
