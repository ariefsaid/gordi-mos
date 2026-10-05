export interface CollectionDisclosureSummaryOptions<TQuery extends object> {
  query: TQuery
  neutralQuery: TQuery
  excludedKeys: readonly (keyof TQuery)[]
  base: string
  hasNonDefaultView: boolean
  filterLabel: (query: TQuery) => string | readonly string[] | undefined
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

  const value = filterLabel(query)
  const labels = typeof value === 'string' ? [value] : value ?? []
  const unique = [...new Set(labels)].filter((label) => label.toLowerCase() !== base.toLowerCase())
  return { summary: [base, ...unique].join(' · '), hasActiveFilters }
}
