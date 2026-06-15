import { useEffect, useRef } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { TaskSurface } from './TaskSurface'
import { useExpandPref } from './useExpandPref'
import { useIsSplitWidth } from '../../shell/useIsSplitWidth'
import { useIsDesktop } from '../../shell/useIsDesktop'
import type { TaskListRow } from '../../lib/db/tasks.types'

export type TaskDrawerOutletContext = {
  /** Lets the open surface sync optimistic row changes back into the table. */
  onTaskChanged?: (task: TaskListRow) => void
  /** C2: lets the surface tell the table to refetch after a create. */
  onTaskCreated?: (id: string) => void
  /** I3: lets the surface tell the table to refetch after an archive. */
  onTaskArchived?: (id: string) => void
}

export type TaskDrawerProps = {
  mode: 'view' | 'create'
}

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * The task drawer host (ADR-0007 §4, design-plan §1.2 / §5.1). Reads the route
 * param, owns the per-user-global expand preference (AC-104/105), and renders
 * the single TaskSurface beside (or over) the persistent table.
 *
 * Two focus regimes, one component (AC-110):
 *  • ≥1100px split → NON-MODAL <aside> (no trap, no scrim): Tab flows table↔drawer
 *    so triage continues; opening moves focus to the surface, closing returns it
 *    to the invoking row.
 *  • <1100px (overlay 920–1100 + mobile <768) → MODAL dialog: role="dialog" +
 *    aria-modal, a scrim, focus-trap, Esc-to-close, and return-focus on close —
 *    because the table underneath is covered/inert.
 */
export default function TaskDrawer({ mode }: TaskDrawerProps) {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const ctx = useOutletContext<TaskDrawerOutletContext | null>()
  const [expanded, setExpanded] = useExpandPref()
  const isSplit = useIsSplitWidth()
  const isDesktop = useIsDesktop()

  const isModal = !isSplit
  const isFullScreen = !isDesktop // <768px: full-screen modal (design-plan §1.5)

  const panelRef = useRef<HTMLElement>(null)
  // Remember the element that had focus before the drawer opened, to restore on close.
  const invokerRef = useRef<HTMLElement | null>(null)

  const close = () => navigate('/tasks')

  // ── Focus management ────────────────────────────────────────────────────────
  useEffect(() => {
    invokerRef.current = (document.activeElement as HTMLElement) ?? null
    const panel = panelRef.current
    if (!panel) return

    // Move focus into the surface on open (both regimes land keyboard/SR users
    // on the new content; only the modal regime traps).
    const first = panel.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    return () => {
      // Return focus to the invoking row/control on close.
      invokerRef.current?.focus?.()
    }
    // Re-run when the task or regime changes (a fresh surface mounts).
  }, [taskId, mode, isModal])

  // Modal-only: focus trap + Esc.
  useEffect(() => {
    if (!isModal) return
    const panel = panelRef.current
    if (!panel) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return }
      if (e.key !== 'Tab') return
      const focusable = Array.from(panel!.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => el.offsetParent !== null || el === document.activeElement)
      if (focusable.length === 0) return
      const firstEl = focusable[0]
      const lastEl = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault(); lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault(); firstEl.focus()
      }
    }
    panel.addEventListener('keydown', onKeyDown)
    return () => panel.removeEventListener('keydown', onKeyDown)
  }, [isModal, taskId, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const label = mode === 'create' ? 'New task' : 'Task detail'

  const surface = (
    <TaskSurface
      taskId={taskId ?? null}
      mode={mode}
      width="drawer"
      expanded={expanded}
      onExpandToggle={() => setExpanded(e => !e)}
      onClose={close}
      onTaskChanged={ctx?.onTaskChanged}
      onTaskCreated={ctx?.onTaskCreated}
      onTaskArchived={ctx?.onTaskArchived}
    />
  )

  // ── Non-modal split (≥1100px): plain <aside>, no scrim, no trap ─────────────
  if (!isModal) {
    return (
      <aside
        ref={panelRef}
        className={`drawer${expanded ? ' expanded' : ''}`}
        aria-label={label}
      >
        {surface}
      </aside>
    )
  }

  // ── Modal (overlay 920–1100 + mobile <768): dialog + scrim + trap ────────────
  const sheetClass = [
    'drawer', 'drawer-modal',
    isFullScreen ? 'drawer-fullscreen' : 'drawer-sheet',
    expanded ? 'expanded' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="drawer-modal-root">
      <div className="drawer-scrim" onClick={close} aria-hidden="true" />
      <aside
        ref={panelRef}
        className={sheetClass}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {surface}
      </aside>
    </div>
  )
}
