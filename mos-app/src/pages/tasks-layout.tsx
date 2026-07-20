import { useCallback, useState } from 'react'
import { Outlet, useParams, useMatch, useLocation, useNavigationType } from 'react-router-dom'
import { useTasksSavedView } from '@/components/tasks/use-tasks-saved-view'
import { PageFrame } from '@/shell/page-frame'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { TasksWorkspace } from '@/components/tasks/tasks-workspace'
import { useExpandPref } from '@/components/tasks/use-expand-pref'
import { useIsSplitWidth } from '@/shell/use-is-split-width'
import { isTaskPageMode } from '@/components/tasks/task-page-mode'
import { TaskSurface } from '@/components/tasks/task-surface'
import { useSetBreadcrumbTitle } from '@/shell/breadcrumb-title'
import type { TaskListRow, TaskStatus } from '@/lib/db/tasks.types'
import type { TaskDrawerOutletContext } from '@/components/tasks/task-drawer'

/**
 * Split-view shell for /work/tasks (ADR-0007, PR-B). The table persists while the
 * detail/create surface mounts beside it via <Outlet> (push/squash, no scrim):
 *   /work/tasks         → table full width (.split.nodrawer), no drawer
 *   /work/tasks/:id     → table + that task's drawer open
 *   /work/tasks/new     → table + drawer in create mode
 * Expand is a per-user-global view toggle on the SAME URL (read here so the
 * grid can collapse to full width when the surface is expanded).
 */
export function TasksLayout() {
  useDocumentTitle('Tasks — Gordi MOS')
  const { taskId } = useParams()
  const isNew = useMatch('/work/tasks/new')
  const location = useLocation()
  const navigationType = useNavigationType()
  const { savedView, setSavedView } = useTasksSavedView()
  const [expanded, setExpanded] = useExpandPref()
  // ≥1100px is the live push/squash split; below it the drawer floats as a modal
  // overlay over a full-width (un-squashed) table, so the table must NOT condense.
  const isSplit = useIsSplitWidth()

  // Optimistic status overrides fed by the open drawer (AC-103) so the table row
  // reflects an inline status change without a full reload.
  const [statusOverrides, setStatusOverrides] = useState<Map<string, TaskStatus>>(new Map())
  const onTaskChanged = useCallback((task: TaskListRow) => {
    setStatusOverrides(prev => {
      const next = new Map(prev)
      next.set(task.id, task.status)
      return next
    })
  }, [])

  // C2/I3: create + archive have no optimistic-row channel, so bump a refresh key
  // the table watches — it refetches the list so a just-created row appears (and
  // becomes the selected row) and an archived row leaves the default list + the
  // count updates, both WITHOUT a reload.
  const [refreshKey, setRefreshKey] = useState(0)
  const onTaskCreated = useCallback(() => setRefreshKey(k => k + 1), [])
  const onTaskArchived = useCallback(() => setRefreshKey(k => k + 1), [])
  const outletContext: TaskDrawerOutletContext = { onTaskChanged, onTaskCreated, onTaskArchived }

  // OD-63 / Rule 4: a direct/new-tab/refresh (or the explicit "Open full page"
  // escalation) renders the SAME record as a standalone full canonical page — NOT
  // inside the table+drawer shell. An in-list click (in-app SPA navigation) keeps
  // the split drawer for fast triage. Detection lives in task-page-mode (jsdom has
  // no PerformanceNavigationTiming, so direct-render unit tests stay in panel mode;
  // the e2e proves the real-browser direct-open branch). All hooks run above so this
  // branch is a plain conditional return, not a conditional hook.
  if (isTaskPageMode({ taskId, isNew: Boolean(isNew), state: location.state, navigationType }) && taskId) {
    return <TaskRecordPage taskId={taskId} />
  }

  const drawerOpen = Boolean(taskId) || Boolean(isNew)

  return (
    <PageFrame variant="data">
      <TasksWorkspace
        selectedId={taskId ?? null}
        drawerOpen={drawerOpen}
        splitLayout={isSplit}
        expanded={expanded}
        statusOverrides={statusOverrides}
        refreshKey={refreshKey}
        savedView={savedView}
        onSavedViewChange={setSavedView}
        onToggleExpand={() => setExpanded(e => !e)}
        drawerSlot={<Outlet context={outletContext} />}
      />
    </PageFrame>
  )
}

/**
 * Standalone full canonical record page (OD-63). Reuses the ONE TaskSurface
 * renderer at width="full" / presentation="page" — no table shell, no drawer
 * chrome (expand/close belong to the split drawer). The shell breadcrumb reads
 * the resolved title so it shows "Work · Tasks · <title>" (mirrors TaskDrawer's
 * BreadcrumbTitleSync). Reachable only by a direct/new-tab/refresh of
 * `/work/tasks/:id` or the drawer's "Open full page" escalation.
 */
function TaskRecordPage({ taskId }: { taskId: string }) {
  const [title, setTitle] = useState<string | null>(null)
  // Empty string before the title resolves keeps the crumb at "Work · Tasks";
  // once resolved it pushes the task title; on unmount the hook clears it.
  useSetBreadcrumbTitle(title ?? '')
  // V3 focused-record family: the PageFamilyFrame owns the shell <main> + h1
  // (the resolved title, or "Task" while unresolved → loading state). The typed
  // TaskSurface body renders the record identity as an h2 beneath it.
  return (
    <PageFamilyFrame
      family="focused-record"
      title={title ?? 'Task'}
      jobSentence="Review and update this task."
      state={title ? 'default' : 'loading'}
    >
      <TaskSurface
        taskId={taskId}
        mode="view"
        width="full"
        presentation="page"
        onTitleResolved={setTitle}
        identityHeadingLevel={2}
      />
    </PageFamilyFrame>
  )
}
