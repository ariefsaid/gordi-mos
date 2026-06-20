// Recent-tasks ring buffer for the ⌘K palette's "Recent" group (OD-P4-9/11).
// Client-only: a localStorage list of the last ~5 opened /tasks/:id, no backend/RLS.

export type RecentTask = { id: string; title: string }

export const RECENT_TASKS_KEY = 'mos.command.recentTasks'
const MAX_RECENT = 5

// Read the recent-tasks buffer, newest-first. Tolerates absent/corrupt storage.
export function readRecentTasks(): RecentTask[] {
  try {
    const raw = localStorage.getItem(RECENT_TASKS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is RecentTask =>
        typeof r === 'object' && r !== null
        && typeof (r as RecentTask).id === 'string'
        && typeof (r as RecentTask).title === 'string',
    )
  } catch {
    return []
  }
}

// Push a task to the front of the buffer (de-duped by id, capped at MAX_RECENT).
export function pushRecentTask(task: RecentTask): void {
  try {
    const next = [task, ...readRecentTasks().filter((r) => r.id !== task.id)].slice(0, MAX_RECENT)
    localStorage.setItem(RECENT_TASKS_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable (private mode / quota) — Recent is a nicety, fail quiet.
  }
}
