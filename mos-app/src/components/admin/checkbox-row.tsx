// The native checkbox row shared by the person panel's Teams, Position, Access, and Revenue lists.
// Each list owns its own section shell and data shaping.

import type { ReactNode } from 'react'
import { Checkbox } from '@/components/ui/checkbox'

export interface CheckboxRowProps {
  label: string
  ariaLabel?: string
  checked: boolean
  /** A save is in flight; keep focus and ignore changes until it settles. */
  busy?: boolean
  /** Truly unavailable, such as a permission guard. */
  disabled?: boolean
  onToggle: () => void
  /** Draw a top border — pass `index > 0` so rows within a bordered group are separated. */
  divider?: boolean
  /** Indent + lighter weight for a child row (a branch under its "Whole channel" parent). */
  indent?: boolean
  /** Stronger weight for a group-parent / select-all row. */
  emphasis?: boolean
  /** Optional description sub-line under the label (Access role descriptions, stream labels). */
  description?: string
  /** Optional tooltip for disabled rows (shows why the row is disabled). */
  title?: string
  /** Row-level controls and status beside the label. Rendered OUTSIDE the <label>, so a button
   *  here is never a second click target for the checkbox. */
  trailing?: ReactNode
}

/**
 * One checkbox row whose visible label and native control share one activation surface. The native
 * input owns checked and keyboard behavior; busy rows stay focusable while true guards use disabled.
 */
export function CheckboxRow({
  label,
  ariaLabel,
  checked,
  busy = false,
  disabled = false,
  onToggle,
  divider = false,
  indent = false,
  emphasis = false,
  description,
  title,
  trailing,
}: CheckboxRowProps) {
  const labelClass = ['admin-check-row__label', indent && 'admin-check-row__label--indent', (disabled || busy) && 'admin-check-row__label--locked'].filter(Boolean).join(' ')
  return (
    <div className={divider ? 'admin-check-row admin-check-row--divided' : 'admin-check-row'}>
      <label className={labelClass} title={title}>
        <span className="admin-check-row__box">
          <Checkbox
            checked={checked}
            disabled={disabled}
            aria-disabled={busy || undefined}
            aria-busy={busy || undefined}
            onChange={() => !disabled && !busy && onToggle()}
            aria-label={ariaLabel ?? label}
          />
        </span>
        <span className="admin-check-row__text">
          <span className={emphasis ? 'admin-check-row__name admin-check-row__name--emphasis' : 'admin-check-row__name'}>{label}</span>
          {description && <span className="admin-check-row__description">{description}</span>}
        </span>
      </label>
      {trailing && <div className="admin-check-row__trailing">{trailing}</div>}
    </div>
  )
}
