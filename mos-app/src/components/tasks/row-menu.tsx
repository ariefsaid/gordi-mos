// RowMenu — the hover-revealed ⋯ row-actions trigger (PR-2 AC-T02).
//
// Kit "quiet at rest" craft: the ⋯ is visually hidden until the row is hovered,
// selected, or keyboard-focused (:focus-within). Reveal is owned by `.row-menu`
// CSS in TasksWorkspace.css. This PR ships ONE action — "Open" → /work/tasks/:id
// (the canonical record surface, ADR-0013 D3). Archive stays in the surface.
//
// a11y: aria-haspopup="menu" + aria-expanded; the popover is role="menu" with
// role="menuitem" children, backed by the shared useMenuPopover contract
// (outside-click + Esc + menu keys — convention audit 2026-07-18).
import { useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { useMenuPopover } from '@/lib/use-menu-popover'

export type RowMenuProps = {
  taskId: string
  recordSearch?: string
}

export function RowMenu({ taskId, recordSearch = '' }: RowMenuProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])
  useMenuPopover(open, close, menuRef, triggerRef)
  return (
    <span className="row-menu-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="row-menu"
        aria-label={t('tasks.rowActions')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {open && (
        <span ref={menuRef} role="menu" className="row-menu-pop" aria-label={t('tasks.rowActionsFor', { id: taskId })}>
          <Link
            to={{ pathname: `/work/tasks/${taskId}`, search: recordSearch }}
            state={{ taskSurface: 'panel' }}
            role="menuitem"
            className="row-menu-item"
            onClick={(e) => { e.stopPropagation(); setOpen(false) }}
          >
            {t('tasks.rowOpen')}
          </Link>
        </span>
      )}
    </span>
  )
}
