export const TASK_EVENTS_PAGE_SIZE = 50
const DONE_RECENT_DAYS = 30

export function taskDoneRecentCutoff(now = new Date()): string {
  // Minute precision keeps equivalent default reads coalescible without changing the 30-day window.
  const minute = Math.floor(now.getTime() / 60_000) * 60_000
  return new Date(minute - DONE_RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString()
}
