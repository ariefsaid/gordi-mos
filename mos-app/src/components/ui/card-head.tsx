// CardHead — the ONE in-card section header (IA-3, PR-2). Title 18/600 + optional
// meta on the baseline + trailing action slot. Distinct from PageHead (page title).
// Replaces MyWeek's "My tasks" inline head + the weekly panes' inline h2 head rows.
import type { ReactNode } from 'react'
import './CardHead.css'

export interface CardHeadProps {
  title: ReactNode
  /** Inline meta/caption on the title baseline ("Where you're R or A · off track first"). */
  meta?: ReactNode
  /** Right-aligned trailing action (link, pill+nav cluster, button). */
  action?: ReactNode
  className?: string
}

export function CardHead({ title, meta, action, className }: CardHeadProps) {
  return (
    <div className={`card-head${className ? ` ${className}` : ''}`}>
      <h2 className="card-head-title">{title}</h2>
      {meta && <span className="card-head-meta">{meta}</span>}
      {action && <div className="card-head-action">{action}</div>}
    </div>
  )
}
