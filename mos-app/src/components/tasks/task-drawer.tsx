import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { TaskSurface } from './task-surface'
import { useExpandPref } from './use-expand-pref'
import { useIsSplitWidth } from '@/shell/use-is-split-width'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useSetBreadcrumbTitle } from '@/shell/breadcrumb-title'
import type { TaskListRow } from '@/lib/db/tasks.types'

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

/**
 * Mounts only when the task title has been resolved. Calls useSetBreadcrumbTitle
 * so the shell Breadcrumb shows "Tasks › <title>" (ADR-0013 D1 / OD-P4-9, AC-S04b).
 * Unmounts (and thus clears the title) when the drawer closes or the title is unknown.
 */
function BreadcrumbTitleSync({ title }: { title: string }) {
  useSetBreadcrumbTitle(title)
  return null
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
export function TaskDrawer({ mode }: TaskDrawerProps) {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const ctx = useOutletContext<TaskDrawerOutletContext | null>()
  const [expanded, setExpanded] = useExpandPref()
  const isSplit = useIsSplitWidth()
  const isDesktop = useIsDesktop()

  // ADR-0013 D1 / OD-P4-9: track the resolved task title so BreadcrumbTitleSync can
  // push it to the shell Breadcrumb. Resets on taskId change (new record opens).
  const [resolvedTitle, setResolvedTitle] = useState<string | null>(null)
  useEffect(() => { setResolvedTitle(null) }, [taskId])

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

  // Modal-only: focus trap (on the panel) + Esc (on the document, since the modal
  // owns the whole screen and focus may rest on the body/scrim).
  useEffect(() => {
    if (!isModal) return
    const panel = panelRef.current
    if (!panel) return

    function onTrapKeyDown(e: KeyboardEvent) {
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
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); close() }
    }
    panel.addEventListener('keydown', onTrapKeyDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      panel.removeEventListener('keydown', onTrapKeyDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [isModal, taskId, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const label = mode === 'create' ? 'New task' : 'Task detail'

  // ADR-0013 D3 / AC-R06: the expand control PROMOTES the surface to the full-width
  // two-column record page — but only where there's room for two columns (the split
  // regime, ≥1100px). Below split (modal sheet / mobile full-screen) "expanded" keeps
  // the compact stacked drawer; there isn't horizontal room for the side-by-side grid.
  // (Pre-fix bug: width was hardcoded "drawer", so .record-2col never mounted live.)
  const fullWidth = expanded && isSplit
  const width = fullWidth ? 'full' : 'drawer'

  // ADR-0013 D1 / OD-P4-9: BreadcrumbTitleSync mounts when the title is resolved and
  // calls useSetBreadcrumbTitle so the shell Breadcrumb shows "Tasks › <task name>".
  // It unmounts (clearing the crumb) when the drawer closes or taskId changes.
  const surface = (
    <>
      {resolvedTitle && <BreadcrumbTitleSync title={resolvedTitle} />}
      <TaskSurface
        taskId={taskId ?? null}
        mode={mode}
        width={width}
        expanded={expanded}
        onExpandToggle={() => setExpanded(e => !e)}
        onClose={close}
        onTaskChanged={ctx?.onTaskChanged}
        onTaskCreated={ctx?.onTaskCreated}
        onTaskArchived={ctx?.onTaskArchived}
        onTitleResolved={setResolvedTitle}
      />
    </>
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
