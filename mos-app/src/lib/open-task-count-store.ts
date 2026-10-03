import { getMyOpenTaskCount } from '@/lib/db/open-task-count'

// One shared result for every consumer (rail badge, Home), refreshed after task writes and on focus.
type Snapshot = { personId: string; count: number | null } | null

let snapshot: Snapshot = null
let watched: string | undefined
let pending: string | undefined
let latest = 0
const listeners = new Set<() => void>()
let listeningForFocus = false

function onWindowFocus(): void {
  if (watched) load(watched)
}

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

/** Start watching the viewer's count; fetches when absent, failed, or not already in flight. */
export function watchOpenTaskCount(personId: string): void {
  watched = personId
  if (snapshot?.personId !== personId || (snapshot.count === null && pending !== personId)) load(personId)
}

/** Call after any task write; refetches the watched viewer's count. */
export function announceOpenTaskCountChanged(): void {
  if (watched) load(watched)
}

export function subscribeOpenTaskCount(listener: () => void): () => void {
  listeners.add(listener)
  if (!listeningForFocus && typeof window !== 'undefined') {
    window.addEventListener('focus', onWindowFocus)
    listeningForFocus = true
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && listeningForFocus && typeof window !== 'undefined') {
      window.removeEventListener('focus', onWindowFocus)
      listeningForFocus = false
    }
  }
}

export const getOpenTaskCountSnapshot = (): Snapshot => snapshot

export function __resetOpenTaskCountForTests(): void {
  snapshot = null
  watched = undefined
  pending = undefined
  latest++
  if (listeningForFocus && typeof window !== 'undefined') window.removeEventListener('focus', onWindowFocus)
  listeningForFocus = false
  listeners.clear()
}
