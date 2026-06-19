import { useCallback, useState } from 'react'
import { Outlet, useParams, useMatch } from 'react-router-dom'
import { PageFrame } from '@/shell/PageFrame'
import { useDocumentTitle } from '@/shell/useDocumentTitle'
import { TasksWorkspace } from '@/components/tasks/TasksWorkspace'
import { useExpandPref } from '@/components/tasks/useExpandPref'
import { useIsSplitWidth } from '@/shell/useIsSplitWidth'
import type { TaskListRow, TaskStatus } from '@/lib/db/tasks.types'
import type { TaskDrawerOutletContext } from '@/components/tasks/TaskDrawer'

/**
 * Split-view shell for /tasks (ADR-0007, PR-B). The table persists while the
 * detail/create surface mounts beside it via <Outlet> (push/squash, no scrim):
 *   /tasks         → table full width (.split.nodrawer), no drawer
 *   /tasks/:id     → table + that task's drawer open
 *   /tasks/new     → table + drawer in create mode
 * Expand is a per-user-global view toggle on the SAME URL (read here so the
 * grid can collapse to full width when the surface is expanded).
 */
export function TasksLayout() {
  useDocumentTitle('Tasks — Gordi MOS')
  const { taskId } = useParams()
  const isNew = useMatch('/tasks/new')
  const drawerOpen = Boolean(taskId) || Boolean(isNew)
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

  return (
    <PageFrame variant="data">
      <TasksWorkspace
        selectedId={taskId ?? null}
        drawerOpen={drawerOpen}
        splitLayout={isSplit}
        expanded={expanded}
        statusOverrides={statusOverrides}
        refreshKey={refreshKey}
        onToggleExpand={() => setExpanded(e => !e)}
        drawerSlot={<Outlet context={outletContext} />}
      />
    </PageFrame>
  )
}
