import { useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import PageFrame from '../shell/PageFrame'
import { useDocumentTitle } from '../shell/useDocumentTitle'
import { TaskSurface } from '../components/tasks/TaskSurface'

// PR-A (ADR-0007): TaskDetail is now a thin full-width host over TaskSurface.
// All actionable behavior lives in TaskSurface; this page only owns the page
// chrome (PageFrame + breadcrumb). Behavior is identical to the old page.
export default function TaskDetail() {
  useDocumentTitle('Task — Gordi MOS')
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const onTitleResolved = useCallback((t: string) => setTitle(t), [])

  return (
    <PageFrame>
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/tasks" className="breadcrumb-link">Tasks</Link>
        {title && (
          <>
            <span className="breadcrumb-sep" aria-hidden="true"> / </span>
            <span className="breadcrumb-current">{title}</span>
          </>
        )}
      </nav>

      <TaskSurface
        taskId={taskId ?? null}
        mode="view"
        width="full"
        onClose={() => navigate('/tasks')}
        onTitleResolved={onTitleResolved}
      />
    </PageFrame>
  )
}
