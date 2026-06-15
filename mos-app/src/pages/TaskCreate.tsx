import { useNavigate, Link } from 'react-router-dom'
import PageFrame from '../shell/PageFrame'
import { useDocumentTitle } from '../shell/useDocumentTitle'
import { TaskSurface } from '../components/tasks/TaskSurface'

// PR-A (ADR-0007): TaskCreate is now a thin full-width host over TaskSurface's
// create mode. The field set + submit live in TaskSurface; this page only owns
// the page chrome (PageFrame + breadcrumb + page head). Behavior is identical.
export default function TaskCreate() {
  useDocumentTitle('New task — Gordi MOS')
  const navigate = useNavigate()

  return (
    <PageFrame>
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="tc-breadcrumb">
        <Link to="/tasks" className="tc-breadcrumb-link">Tasks</Link>
        <span className="tc-breadcrumb-sep" aria-hidden="true"> / </span>
        <span className="tc-breadcrumb-current">New task</span>
      </nav>

      <div className="tc-page-head">
        <h1 className="tc-page-title">New task</h1>
      </div>

      <TaskSurface
        taskId={null}
        mode="create"
        width="full"
        onClose={() => navigate('/tasks')}
      />
    </PageFrame>
  )
}
