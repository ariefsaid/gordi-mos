import { useState } from 'react'

/** Lists longer than this open collapsed to what the person has, with a filter and "Show all". */
export const FILTER_THRESHOLD = 8

/**
 * Chosen items first, in an order fixed when the list mounts (see long-list.tsx). A long list
 * starts collapsed: it shows the items chosen at mount plus any checked since, until the admin
 * types a filter or asks for all of them.
 */
export function useLongList<T>(
  items: readonly T[],
  id: (item: T) => string,
  selected: (item: T) => boolean,
): { ordered: T[]; collapsed: (filter: string) => boolean; pinned: (item: T) => boolean; showAll: () => void } {
  const [first] = useState(() => new Set(items.filter(selected).map(id)))
  const [expanded, setExpanded] = useState(false)
  return {
    ordered: [...items.filter((item) => first.has(id(item))), ...items.filter((item) => !first.has(id(item)))],
    collapsed: (filter) => items.length > FILTER_THRESHOLD && !expanded && filter.trim() === '',
    pinned: (item) => first.has(id(item)),
    showAll: () => setExpanded(true),
  }
}
