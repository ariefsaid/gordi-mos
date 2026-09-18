export interface CollectionDisclosureSummaryOptions<TQuery extends object> {
  query: TQuery
  neutralQuery: TQuery
  excludedKeys: readonly (keyof TQuery)[]
  base: string
  hasNonDefaultView: boolean
  filterLabel: (query: TQuery) => string | undefined
}

export function collectionDisclosureSummary<TQuery extends object>({
  query,
  neutralQuery,
  excludedKeys,
  base,
  hasNonDefaultView,
  filterLabel,
}: CollectionDisclosureSummaryOptions<TQuery>): { summary: string; hasActiveFilters: boolean } {
  const excluded = new Set(excludedKeys)
  const hasIndependentFilter = Object.keys(neutralQuery).some((key) => {
    if (excluded.has(key as keyof TQuery)) return false
    const queryValue = query[key as keyof TQuery]
    const neutralValue = neutralQuery[key as keyof TQuery]
    return queryValue !== neutralValue
  })
  const hasActiveFilters = hasNonDefaultView || hasIndependentFilter
  if (!hasIndependentFilter) return { summary: base, hasActiveFilters }

  const label = filterLabel(query)
  // A saved view that sets its own filter names it twice: the Overdue view's base label is
  // "Overdue" and its filter label is "Overdue", so the door read "Overdue · Overdue". A word
  // repeated against itself carries no second fact, and it widened the trigger enough to squeeze
  // the controls beside it.
  const redundant = label != null && label.toLowerCase() === base.toLowerCase()
  return { summary: label && !redundant ? `${base} · ${label}` : base, hasActiveFilters }
}
