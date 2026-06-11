// Placeholder for the Create Task page (P2-1c — form internals are out of scope for P2-1b).
// The "+ New task" affordance in TasksPage routes here; the full form ships in P2-1c.
import { Link } from 'react-router-dom'
import PageFrame from '../shell/PageFrame'
import { useDocumentTitle } from '../shell/useDocumentTitle'

export default function TaskNewPlaceholder() {
  useDocumentTitle('New Task — Gordi MOS')
  return (
    <PageFrame>
      <div className="bg-card border border-border rounded-md p-8">
        <h1
          className="font-bold text-foreground mb-2"
          style={{ fontSize: 20, letterSpacing: '-0.01em' }}
        >
          Create task
        </h1>
        <p className="text-muted-foreground mb-4" style={{ fontSize: 14 }}>
          Task creation form coming in P2-1c.
        </p>
        <Link
          to="/tasks"
          className="text-primary font-semibold no-underline"
          style={{ fontSize: 13 }}
        >
          ← Back to Tasks
        </Link>
      </div>
    </PageFrame>
  )
}
