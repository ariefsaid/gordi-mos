import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { TaskSurface } from './task-surface'
import { useSetBreadcrumbTitle } from '@/shell/breadcrumb-title'
import { RecordPanelHost } from '@/shell/record-panel-host'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { useT } from '@/i18n/use-t'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { OverlayLeaveDecision, OverlayLeaveGuard, OverlayLeaveIntent } from '@/shell/overlay-navigation'
import { CloseIcon } from '@/shell/icons'
import { AskDeputyAction } from '@/components/records/ask-deputy-action'

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

export type TaskOverlayContentProps = {
  taskId: string
  onClose: () => void
  onOpenPage: () => void
  onTaskChanged?: (task: TaskListRow) => void
  onTaskCreated?: (id: string) => void
  onTaskArchived?: (id: string) => void
  onLeaveGuardChange?: (guard: OverlayLeaveGuard | undefined) => void
}

/** Task-specific content used by the shell-owned OverlayHostSlot. */
export function TaskOverlayContent({
  taskId, onClose, onOpenPage, onTaskChanged, onTaskCreated, onTaskArchived, onLeaveGuardChange,
}: TaskOverlayContentProps) {
  const t = useT()
  const dirtyRef = useRef(false)
  const guardRef = useRef<OverlayLeaveGuard | null>(null)
  const resolverRef = useRef<((decision: OverlayLeaveDecision) => void) | null>(null)
  const [pendingIntent, setPendingIntent] = useState<OverlayLeaveIntent | null>(null)

  useEffect(() => {
    guardRef.current = async (intent) => {
      if (!dirtyRef.current) return { decision: 'allow' }
      return await new Promise<OverlayLeaveDecision>((resolve) => {
        resolverRef.current = resolve
        setPendingIntent(intent)
      })
    }
    return () => {
      onLeaveGuardChange?.(undefined)
      guardRef.current = null
      resolverRef.current = null
    }
  }, [onLeaveGuardChange])

  const onDirtyChange = useCallback((dirty: boolean) => {
    // Keep the ref synchronous: an immediate Esc/Back after a field edit must still veto leave.
    dirtyRef.current = dirty
    onLeaveGuardChange?.(dirty ? guardRef.current ?? undefined : undefined)
  }, [onLeaveGuardChange])

  const cancelLeave = useCallback(() => {
    resolverRef.current?.({ decision: 'deny' })
    resolverRef.current = null
    setPendingIntent(null)
  }, [])

  const discardAndLeave = useCallback(async () => {
    dirtyRef.current = false
    resolverRef.current?.({ decision: 'allow' })
    resolverRef.current = null
    setPendingIntent(null)
  }, [])

  return (
    <>
      <TaskSurface
        taskId={taskId}
        mode="view"
        presentation="panel"
        width="drawer"
        onClose={onClose}
        onOpenPage={onOpenPage}
        onTaskChanged={onTaskChanged}
        onTaskCreated={onTaskCreated}
        onTaskArchived={onTaskArchived}
        onDirtyChange={onDirtyChange}
        showPanelUtility={false}
        // D1 fix: freeze field commits for the SAME render in which the confirm dialog opens.
        // React applies this prop to every RecordField before ModalShell's own focus-stealing
        // effect can run (render-then-effects ordering), so the dialog's auto-focus can never
        // race a still-editing field's blur into a stray commit (see record-field.tsx header).
        fieldCommitsFrozen={pendingIntent !== null}
      />
      <ConfirmDialog
        open={pendingIntent !== null}
        title={t('tasks.unsaved.title')}
        body={t('tasks.unsaved.copy')}
        confirmLabel={t('tasks.unsaved.discard')}
        cancelLabel={t('tasks.cancel')}
        tone="destructive"
        onConfirm={discardAndLeave}
        onCancel={cancelLeave}
      />
    </>
  )
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

/**
 * The task record drawer (ADR-0007 §4, design-plan §1.2 / §5.1). Reads the route
 * param and mounts the single TaskSurface as the CONTENT of the shared RecordPanelHost.
 *
 * The host owns the overlay grammar (spec record-panel-host.spec.md, FR-1/FR-2):
 * the dual modal regime (≥1100px non-modal <aside> split / <1100px role=dialog
 * aria-modal sheet), the .drawer shell, the focus contract, Esc, and return-focus.
 * This drawer keeps only the task-specific plumbing (param, breadcrumb title, close
 * target) and passes the chrome-free TaskSurface through. The shared host owns the
 * title, Open-full-page, Close, Esc, and focus grammar; the RecordViewer owns the
 * Task identity, metadata, content, and actions.
 *
 * GAP-2 (OD-REDESIGN-91 #7): expand-in-place is RETIRED — "Open full page" is the one
 * escalation verb, so the drawer holds a fixed width and no expand toggle/preference.
 */
export function TaskDrawer({ mode }: TaskDrawerProps) {
  const { taskId } = useParams<{ taskId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const ctx = useOutletContext<TaskDrawerOutletContext | null>()
  const t = useT()

  // ADR-0013 D1 / OD-P4-9: track the resolved task title so BreadcrumbTitleSync can
  // push it to the shell Breadcrumb. Resets on taskId change (new record opens).
  const [resolvedTitle, setResolvedTitle] = useState<string | null>(null)
  useEffect(() => { setResolvedTitle(null) }, [taskId])

  // D-B1 (OD-REDESIGN-22): the route drawer mounts RecordPanelHost directly (no OverlayHost
  // requestLeave), so it owns the SAME dirty leave-guard the in-list overlay path has. A dirty
  // create draft (bubbled up via CreateSurface's onDirtyChange) or a dirty view-mode RecordField
  // edit must prompt "Discard unsaved changes?" before any Escape/close leaves. dirtyRef is read
  // synchronously so an immediate Escape right after a keystroke still vetoes the leave.
  const dirtyRef = useRef(false)
  const pendingLeaveRef = useRef<(() => void) | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const onDirtyChange = useCallback((dirty: boolean) => { dirtyRef.current = dirty }, [])
  // guardedClose interposes the confirm ONLY when there is unsaved work; a clean drawer closes
  // immediately (AC-306/307/308/309 unchanged). `proceed` is the concrete navigation to run.
  const guardedClose = useCallback((proceed: () => void) => {
    if (dirtyRef.current) {
      pendingLeaveRef.current = proceed
      setConfirmOpen(true)
      return
    }
    proceed()
  }, [])
  const cancelLeave = useCallback(() => {
    pendingLeaveRef.current = null
    setConfirmOpen(false)
  }, [])
  const discardAndLeave = useCallback(async () => {
    dirtyRef.current = false
    setConfirmOpen(false)
    const proceed = pendingLeaveRef.current
    pendingLeaveRef.current = null
    proceed?.()
  }, [])

  const leaveToList = useCallback(
    () => navigate({ pathname: '/work/tasks', search: location.search }),
    [navigate, location.search],
  )
  const close = () => guardedClose(leaveToList)
  const label = mode === 'create' ? t('tasks.create.new') : t('tasks.detail.title')
  const openPage = mode === 'view' && taskId
    ? () => navigate({ pathname: `/work/tasks/${taskId}`, search: location.search }, { state: { taskSurface: 'page' } })
    : undefined
  // AC-306/AC-309: the host's own ✕ (record.close, no Esc hint) stays generic across every
  // tenant. Task-specific hostActions add a labelled "Close (Esc)" affordance (extension point,
  // not a host fork — mirrors the create-mode chrome bar's existing tasks.close button) so a
  // keyboard/SR user gets an explicit close control that names the Esc shortcut this host already
  // wires up (both the split and modal regimes close on Escape).
  const hostActions = mode === 'view' ? (
    <>
      {/* Record-scoped "Ask Deputy": opens the Deputy panel pre-seeded with a compact reference to
          this task. Gated on the resolved title so the seed is meaningful ("About Task: <title>"),
          never a bare stub. The user still edits and sends — it never auto-sends. */}
      {resolvedTitle && (
        <AskDeputyAction draft={t('assistant.askAbout.task', { title: resolvedTitle })} />
      )}
      <button
        type="button"
        className="record-panel-btn"
        aria-label={t('tasks.close')}
        title={t('tasks.close')}
        onClick={close}
      >
        <CloseIcon />
      </button>
    </>
  ) : (
    // DO-4: create mode — the host bar is the ONE chrome (CreateSurface suppresses its own via
    // showPanelUtility=false below). One title, one ✕ (the host's own); no expand toggle (GAP-2).
    undefined
  )

  // GAP-2 (OD-91 #7): expand-in-place is retired, so the drawer is a fixed-width panel — the only
  // escalation is "Open full page". ADR-0013 D1 / OD-P4-9: BreadcrumbTitleSync mounts when the title is resolved and
  // calls useSetBreadcrumbTitle so the shell Breadcrumb shows "Tasks › <task name>".
  // It unmounts (clearing the crumb) when the drawer closes or taskId changes.
  const surface = (
    <>
      {resolvedTitle && <BreadcrumbTitleSync title={resolvedTitle} />}
      <TaskSurface
        taskId={taskId ?? null}
        mode={mode}
        width="drawer"
        onClose={close}
        onTaskChanged={ctx?.onTaskChanged}
        onTaskCreated={ctx?.onTaskCreated}
        onTaskArchived={ctx?.onTaskArchived}
        onTitleResolved={setResolvedTitle}
        showPanelUtility={false}
        // D-B1: view-mode RecordField draft state and create-mode form leave both feed the guard.
        onDirtyChange={onDirtyChange}
        onRequestLeave={guardedClose}
        // Freeze RecordField commits for the render in which the confirm opens, so the dialog's
        // auto-focus can't race a still-editing field's blur into a stray commit (record-field.tsx).
        fieldCommitsFrozen={confirmOpen}
      />
    </>
  )

  return (
    <>
      <RecordPanelHost
        label={label}
        onClose={close}
        focusKey={`${taskId ?? mode}-${mode}`}
        title={label}
        actions={hostActions}
        onOpenPage={openPage}
        transitionPending={confirmOpen}
      >
        {surface}
      </RecordPanelHost>
      <ConfirmDialog
        open={confirmOpen}
        title={t('tasks.unsaved.title')}
        body={t('tasks.unsaved.copy')}
        confirmLabel={t('tasks.unsaved.discard')}
        cancelLabel={t('tasks.cancel')}
        tone="destructive"
        onConfirm={discardAndLeave}
        onCancel={cancelLeave}
      />
    </>
  )
}
