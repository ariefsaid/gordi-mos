import { getMyOpenTaskCount } from '@/lib/db/open-task-count'

// One shared result for every consumer (rail badge, Home), refreshed after a task write.
type Snapshot = { personId: string; count: number | null } | null

let snapshot: Snapshot = null
let watched: string | undefined
let pending: string | undefined
let latest = 0
const listeners = new Set<() => void>()

function load(personId: string): void {
  const mine = ++latest
  pending = personId
  getMyOpenTaskCount(personId)
    .catch(() => null)
    .then((count) => {
      if (mine !== latest) return
      pending = undefined
      snapshot = { personId, count }
      for (const listen of [...listeners]) listen()
    })
}

/** Start watching the viewer's count; fetches only when it is neither held nor in flight. */
export function watchOpenTaskCount(personId: string): void {
  watched = personId
  if (snapshot?.personId !== personId && pending !== personId) load(personId)
}

/** Call after any task write; refetches the watched viewer's count. */
export function announceOpenTaskCountChanged(): void {
  if (watched) load(watched)
}

export function subscribeOpenTaskCount(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export const getOpenTaskCountSnapshot = (): Snapshot => snapshot

export function __resetOpenTaskCountForTests(): void {
  snapshot = null
  watched = undefined
  pending = undefined
  latest++
  listeners.clear()
}
