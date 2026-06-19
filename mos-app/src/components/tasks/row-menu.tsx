// RowMenu — the hover-revealed ⋯ row-actions trigger (PR-2 AC-T02).
//
// Kit "quiet at rest" craft: the ⋯ is visually hidden until the row is hovered,
// selected, or keyboard-focused (:focus-within). Reveal is owned by `.row-menu`
// CSS in TasksWorkspace.css. This PR ships ONE action — "Open" → /tasks/:id
// (the canonical record surface, ADR-0013 D3). Archive stays in the surface.
//
// a11y: aria-haspopup="menu" + aria-expanded; the popover is role="menu" with
// role="menuitem" children. (A full roving-tabindex menu controller is out of
// scope for this stub; the single item is directly reachable.)
import { useState } from 'react'
import { Link } from 'react-router-dom'

export interface RowMenuProps {
  taskId: string
}

export function RowMenu({ taskId }: RowMenuProps) {
  const [open, setOpen] = useState(false)
  return (
    <span className="row-menu-wrap">
      <button
        type="button"
        className="row-menu"
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {open && (
        <span role="menu" className="row-menu-pop" aria-label={`Row actions for task ${taskId}`}>
          <Link to={`/tasks/${taskId}`} role="menuitem" className="row-menu-item" onClick={() => setOpen(false)}>
            Open
          </Link>
        </span>
      )}
    </span>
  )
}
