import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { TaskSurface } from './TaskSurface'
import { useExpandPref } from './useExpandPref'
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

/**
 * The non-modal drawer host (ADR-0007 §4, design-plan §1.2). Reads the route
 * param, owns the per-user-global expand preference (AC-104/105), and renders
 * the single TaskSurface beside the persistent table. Expand toggles the same
 * surface to full width on the SAME URL (no history push). The modal/focus-trap
 * regime for narrow/mobile widths is PR-C/PR-D — PR-B is the desktop split only.
 */
export default function TaskDrawer({ mode }: TaskDrawerProps) {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const ctx = useOutletContext<TaskDrawerOutletContext | null>()
  const [expanded, setExpanded] = useExpandPref()

  return (
    <aside
      className={`drawer${expanded ? ' expanded' : ''}`}
      aria-label={mode === 'create' ? 'New task' : 'Task detail'}
    >
      {/*
        Expanded is the SAME drawer surface, just wider (mockup Screen 3): we keep
        width="drawer" (pinned header + tabs + foot) and let `expanded` drive the
        reflow. width="full" is reserved for the standalone full-page hosts
        (TaskDetail / TaskCreate), which use the historical stacked layout.
      */}
      <TaskSurface
        taskId={taskId ?? null}
        mode={mode}
        width="drawer"
        expanded={expanded}
        onExpandToggle={() => setExpanded(e => !e)}
        onClose={() => navigate('/tasks')}
        onTaskChanged={ctx?.onTaskChanged}
        onTaskCreated={ctx?.onTaskCreated}
        onTaskArchived={ctx?.onTaskArchived}
      />
    </aside>
  )
}
