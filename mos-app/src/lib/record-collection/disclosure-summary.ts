export interface CollectionDisclosureSummaryOptions<TQuery extends object> {
  query: TQuery
  neutralQuery: TQuery
  excludedKeys: readonly string[]
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
    if (excluded.has(key)) return false
    const queryValue = query[key as keyof TQuery]
    const neutralValue = neutralQuery[key as keyof TQuery]
    return queryValue !== neutralValue
  })
  const hasActiveFilters = hasNonDefaultView || hasIndependentFilter
  if (!hasIndependentFilter) return { summary: base, hasActiveFilters }

  const label = filterLabel(query)
  return { summary: label ? `${base} · ${label}` : base, hasActiveFilters }
}
