// The one open-task rule: not Done and not archived. The Tasks head uses it; the rail badge and
// Home share one server-side count that applies the same rule (lib/db/open-task-count.ts).
export function isOpenTask(task: { status: string; archived_at?: string | null }): boolean {
  return task.status !== 'Done' && task.archived_at == null
}
