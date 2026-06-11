import PageFrame from '../shell/PageFrame'
import PageHead from '../shell/PageHead'
import { useDocumentTitle } from '../shell/useDocumentTitle'

export default function TasksPage() {
  useDocumentTitle('Tasks — Gordi MOS')

  return (
    <PageFrame>
      <PageHead title="Tasks" />
      <div className="bg-card border border-border rounded-md p-8">
        <p className="font-semibold text-foreground" style={{ fontSize: 14 }}>
          No tasks yet.
        </p>
        <p className="text-muted-foreground mt-2" style={{ fontSize: 14 }}>
          Tasks you're Responsible or Accountable for will show up here.
        </p>
      </div>
    </PageFrame>
  )
}
