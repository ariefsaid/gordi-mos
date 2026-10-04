/**
 * unread-count-bus — the seam #582 was missing. Notification mutations announce that the unread
 * total may have changed. Scoped badge consumers route that announcement through one unread-count
 * store refresh, which then publishes the result to every mounted badge.
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
