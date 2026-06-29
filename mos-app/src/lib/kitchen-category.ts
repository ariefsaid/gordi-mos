// kitchen-category.ts — null-safe category grouping helper.
// Shared by KitchenPlanTable, KitchenPlanCards (plan surfaces that group by
// category).  Items with a null/empty category fall into a special fallback
// bucket so they are ALWAYS rendered — staging/prod data has no categories
// (Teable source omits the field).  Categorised data keeps its sorted groups.
// Token-only; no React, no DB imports — pure TS.

export interface CategoryGroup<T> {
  /** Sorted category label, or null for the uncategorised fallback bucket. */
  cat: string | null
  rows: T[]
}

/**
 * Group `items` by their `category` field (string | null | undefined).
 * - Items with a truthy category string are sorted into named groups (A→Z).
 * - Items with a null/empty category are collected in a single trailing group
 *   with `cat: null` — rendering may omit the header or show "Uncategorized".
 * - Returns an empty array when `items` is empty.
 */
export function groupByCategory<T extends { category?: string | null }>(
  items: T[],
): CategoryGroup<T>[] {
  const named = new Map<string, T[]>()
  const uncategorised: T[] = []

  for (const item of items) {
    const cat = item.category?.trim() || null
    if (cat) {
      const bucket = named.get(cat) ?? []
      bucket.push(item)
      named.set(cat, bucket)
    } else {
      uncategorised.push(item)
    }
  }

  const groups: CategoryGroup<T>[] = Array.from(named.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cat, rows]) => ({ cat, rows }))

  if (uncategorised.length > 0) {
    groups.push({ cat: null, rows: uncategorised })
  }

  return groups
}
