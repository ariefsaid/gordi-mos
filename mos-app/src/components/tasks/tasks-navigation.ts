import { type MutableRefObject } from 'react'

// The Tasks search box publishes its live text here for ancestors that navigate on its behalf.
export type LiveTasksQueryRef = MutableRefObject<string | null>

// The one builder for internal Tasks navigations. The search box's own URL write can still be
// pending, so the URL's `q` may be older than the typed text: every PUSH takes the live query.
// `drop` removes params the destination must not carry.
export function tasksSearchWithLiveQuery(
  base: URLSearchParams | string,
  liveQuery: string | null,
  drop: readonly string[] = [],
): URLSearchParams {
  const next = new URLSearchParams(base)
  if (liveQuery !== null) {
    if (liveQuery) next.set('q', liveQuery)
    else next.delete('q')
  }
  for (const key of drop) next.delete(key)
  return next
}

export function searchString(params: URLSearchParams): string {
  const text = params.toString()
  return text ? `?${text}` : ''
}

// `location.search` with the live query applied; `location.search` as-is when no ref is supplied.
export function liveTasksSearch(locationSearch: string, liveQueryRef?: LiveTasksQueryRef): string {
  return searchString(tasksSearchWithLiveQuery(locationSearch, liveQueryRef?.current ?? null))
}
