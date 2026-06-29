// KitchenGroupHeader — thin kitchen group header (plan §4.1 N4, §8).
// variant="table": a <tr><td colSpan> (desktop); variant="cards": a <div> (phone).
// Caret (aria-expanded) + label (structural navy) + count (tabular). No "+ Add task".
// Reuses the OD-P3-6 hairline style. Token-only (DESIGN.md).

import { Chevron } from '@/shell/icons'
import './kitchen-group-header.css'

interface KitchenGroupHeaderProps {
  label: string
  count: number
  /** optional tabular subtotal ("180 planned" / "log as produced") */
  sub?: string
  collapsed: boolean
  onToggle: () => void
  variant: 'table' | 'cards'
  /** table variant only — colSpan for the full-width header cell */
  colSpan?: number
}

export function KitchenGroupHeader({
  label, count, sub, collapsed, onToggle, variant, colSpan,
}: KitchenGroupHeaderProps) {
  const inner = (
    <>
      <button
        type="button"
        className={`kgh-caret${variant === 'cards' ? ' kgh-caret-cards' : ''}`}
        aria-expanded={!collapsed}
        aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        onClick={onToggle}
      >
        <Chevron className={`kgh-chev${collapsed ? ' kgh-chev-collapsed' : ''}`} />
      </button>
      <span className="kgh-label">{label}</span>
      <span className="kgh-count tabular-nums">{count}</span>
      {sub && <span className="kgh-sub tabular-nums">{sub}</span>}
    </>
  )

  if (variant === 'cards') {
    return <div className="kgh-cards">{inner}</div>
  }
  return (
    <tr className="kgh">
      <td colSpan={colSpan}>
        <div className="kgh-bar">{inner}</div>
      </td>
    </tr>
  )
}
