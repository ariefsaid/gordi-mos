// ActionBar — the one bottom action bar (UX-STANDARD AC1/AC2/AC6). Used by every capture page, form
// and selection that has a primary action at the foot of the page.
//   Layout: [summary] ........ [disabled reason] [secondary actions] [primary]
//   Phone: the summary and reason sit on a line above; buttons share one row, primary on the right.
// On a phone page that owns the shared slot (PageFamilyFrame renders it between the scroller and the
// tab bar) the bar is portalled there, so it can never cover content. Elsewhere (desktop, panels) it
// sticks to the foot of its scroller.
import { useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePhoneActionBarSlot } from '@/shell/page-action-bar'
import './ActionBar.css'

export interface ActionBarProps {
  /** A result or error just produced by the primary action (role=alert/status), shown above the row. */
  alert?: ReactNode
  /** Left side: counts or a short state line ("3 items"). */
  summary?: ReactNode
  /** Why the primary action is unavailable. Shown next to the buttons; the host wires aria-describedby with `reasonId`. */
  reason?: ReactNode
  reasonId?: string
  /** Outline / ghost actions, left of the primary. */
  secondary?: ReactNode
  /** The one primary action: always the right-most control. */
  primary: ReactNode
  className?: string
  'aria-label'?: string
}

export function ActionBar({ alert, summary, reason, reasonId, secondary, primary, className, 'aria-label': ariaLabel }: ActionBarProps) {
  const slot = usePhoneActionBarSlot()
  const autoId = useId()
  const bar = (
    <div className={`action-bar${className ? ` ${className}` : ''}`} data-testid="action-bar" data-overlay-edge="bottom" role="group" aria-label={ariaLabel}>
      {alert ? <div className="action-bar__alert">{alert}</div> : null}
      {(summary || reason) && (
        <div className="action-bar__info">
          {summary ? <span className="action-bar__summary tabular-nums">{summary}</span> : null}
          {reason ? <span id={reasonId ?? `${autoId}-reason`} className="action-bar__reason">{reason}</span> : null}
        </div>
      )}
      <div className="action-bar__buttons">
        {secondary}
        {primary}
      </div>
    </div>
  )
  if (slot === 'pending') return null
  return slot ? createPortal(bar, slot) : bar
}
