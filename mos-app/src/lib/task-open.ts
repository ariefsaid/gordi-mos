// The one open-task rule: not Done and not archived. Home's count and the Tasks head use it; the
// rail badge applies the same rule as a server-side count (lib/db/rail-counts.ts).
export function isOpenTask(task: { status: string; archived_at?: string | null }): boolean {
  return task.status !== 'Done' && task.archived_at == null
}
