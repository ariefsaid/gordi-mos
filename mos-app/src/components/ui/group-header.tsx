// GroupHeader — the one header for a grouped list: a chevron button (collapse), the group name, and
// the count as a muted "(n)". Café, Work, Admin and Money groups all render this. Optional trailing slot.
import type { ReactNode } from 'react'
import { Chevron } from '@/shell/icons'
import './GroupHeader.css'

export interface GroupHeaderProps {
  label: ReactNode
  count?: number | string
  /** Collapsible: pass both. `open` true = expanded. */
  open?: boolean
  onToggle?: () => void
  controlsId?: string
  /** Heading level the host list uses (default 2). */
  level?: 2 | 3 | 4
  trailing?: ReactNode
  className?: string
  /** Anchor id, so another control can scroll to and focus this group. */
  id?: string
}

export function GroupHeader({ label, count, open, onToggle, controlsId, level = 2, trailing, className, id }: GroupHeaderProps) {
  const Heading = `h${level}` as const
  const body = (
    <>
      {onToggle ? <Chevron className={`group-header__chevron${open ? '' : ' group-header__chevron--closed'}`} /> : null}
      <span className="group-header__name">{label}</span>
      {count != null ? <span className="group-header__count tabular-nums">({count})</span> : null}
    </>
  )
  return (
    <div id={id} className={`group-header${className ? ` ${className}` : ''}`}>
      <Heading className="group-header__title">
        {onToggle ? (
          <button type="button" className="group-header__toggle" aria-expanded={open} aria-controls={controlsId} onClick={onToggle}>{body}</button>
        ) : <span className="group-header__toggle group-header__toggle--static">{body}</span>}
      </Heading>
      {trailing ? <div className="group-header__trailing">{trailing}</div> : null}
    </div>
  )
}
