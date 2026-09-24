import { useState } from 'react'

/** Lists longer than this get a filter field. */
export const FILTER_THRESHOLD = 8

/** Chosen items first, in an order fixed when the list mounts (see long-list.tsx). */
export function useSelectedFirst<T>(items: readonly T[], id: (item: T) => string, selected: (item: T) => boolean): T[] {
  const [first] = useState(() => new Set(items.filter(selected).map(id)))
  return [...items.filter((item) => first.has(id(item))), ...items.filter((item) => !first.has(id(item)))]
}
