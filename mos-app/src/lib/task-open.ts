/** The ONE definition of an open task: not Done and not archived. Home's open count and the Tasks
 * page head both count through it; the rail badge is the same rule as a server-side count
 * (lib/db/rail-counts.ts). Only the scope differs: mine, the viewer's default view, the current view. */
export function isOpenTask(task: { status: string; archived_at?: string | null }): boolean {
  return task.status !== 'Done' && task.archived_at == null
}
