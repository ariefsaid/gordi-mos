import { useEffect, useState } from 'react'
import { useLocation, useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { TaskSurface } from './task-surface'
import { useExpandPref } from './use-expand-pref'
import { useIsSplitWidth } from '@/shell/use-is-split-width'
import { useSetBreadcrumbTitle } from '@/shell/breadcrumb-title'
import { RecordPanelHost } from '@/shell/record-panel-host'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { useT } from '@/i18n/use-t'

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
}

/** Task-specific content used by the shell-owned OverlayHostSlot. */
export function TaskOverlayContent({
  taskId, onClose, onOpenPage, onTaskChanged, onTaskCreated, onTaskArchived,
}: TaskOverlayContentProps) {
  return (
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
      showPanelUtility={false}
    />
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
 * param, owns the per-user-global expand preference (AC-104/105), and mounts the
 * single TaskSurface as the CONTENT of the shared RecordPanelHost.
 *
 * The host owns the overlay grammar (spec record-panel-host.spec.md, FR-1/FR-2):
 * the dual modal regime (≥1100px non-modal <aside> split / <1100px role=dialog
 * aria-modal sheet), the .drawer shell, the focus contract, Esc, and return-focus.
 * This drawer keeps only the task-specific plumbing (param, expand pref, breadcrumb
 * title, close target) and passes the TaskSurface through — the Task keeps its own
 * rich header (TaskDrawerHeader) inside the content, so extraction is behaviour-
 * neutral (FR-2: every existing task-drawer test passes unmodified).
 */
export function TaskDrawer({ mode }: TaskDrawerProps) {
  const { taskId } = useParams<{ taskId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const ctx = useOutletContext<TaskDrawerOutletContext | null>()
  const [expanded, setExpanded] = useExpandPref()
  const isSplit = useIsSplitWidth()
  const t = useT()

  // ADR-0013 D1 / OD-P4-9: track the resolved task title so BreadcrumbTitleSync can
  // push it to the shell Breadcrumb. Resets on taskId change (new record opens).
  const [resolvedTitle, setResolvedTitle] = useState<string | null>(null)
  useEffect(() => { setResolvedTitle(null) }, [taskId])

  const close = () => navigate({ pathname: '/work/tasks', search: location.search })
  const label = mode === 'create' ? t('tasks.create.new') : t('tasks.detail.title')

  // ADR-0013 D3 / AC-R06: the expand control PROMOTES the surface to the full-width
  // two-column record page — but only where there's room for two columns (the split
  // regime, ≥1100px). Below split (modal sheet / mobile full-screen) "expanded" keeps
  // the compact stacked drawer; there isn't horizontal room for the side-by-side grid.
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

  return (
    <RecordPanelHost
      label={label}
      onClose={close}
      expanded={expanded}
      focusKey={`${taskId ?? mode}-${mode}`}
    >
      {surface}
    </RecordPanelHost>
  )
}
