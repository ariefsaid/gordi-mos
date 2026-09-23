/**
 * unread-count-bus — the seam #582 was missing. Three independent `useUnreadCount()` mounts (bell,
 * rail, phone tab) each fetch once on mount; none of them knew when `useNotifications` mutated a
 * row's read/handled stamp, so a mark-read only updated the row list until a full reload re-mounted
 * every badge. A tiny module-level pub/sub — no store, no context, no new dependency — lets the
 * mutating side announce "the unread count may have changed" and every mounted badge re-fetch.
 */
const listeners = new Set<() => void>()

/** Call after any mutation that can change the unread total (mark read, mark handled, revert). */
export function announceUnreadCountChanged(): void {
  // Iterate a snapshot: a listener's own unsubscribe (unmount mid-announce) must not mutate the
  // Set this loop is walking.
  for (const listen of [...listeners]) listen()
}

/** Subscribe a badge consumer; returns the unsubscribe function for a `useEffect` cleanup. */
export function onUnreadCountChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
