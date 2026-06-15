import PageFrame from '../shell/PageFrame'
import { useDocumentTitle } from '../shell/useDocumentTitle'
import { TasksTable } from '../components/tasks/TasksTable'

/**
 * Standalone full-page Tasks list. PR-B moved the table itself (incl. page-head
 * + count line + the .split wrapper) into the reusable `TasksTable` component,
 * shared with the split-view shell `TasksLayout`. With no drawer slot the table
 * renders full width. Kept for standalone use and as the table behavior oracle.
 */
export default function TasksPage() {
  useDocumentTitle('Tasks — Gordi MOS')
  return (
    <PageFrame>
      <TasksTable />
    </PageFrame>
  )
}
