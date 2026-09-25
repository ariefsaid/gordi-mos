/**
 * True when every whitespace-separated token of `query` appears in at least one of `fields`,
 * case-insensitively and in any order — "barista bayu" finds "Bayu Barista". An empty query
 * matches everything.
 */
export function matchesTokens(query: string, fields: readonly (string | null | undefined)[]): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const haystacks = fields.map((field) => (field ?? '').toLowerCase())
  return tokens.every((token) => haystacks.some((haystack) => haystack.includes(token)))
}
