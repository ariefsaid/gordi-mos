/** `%query%` for an ilike, with the wildcards % _ * escaped so the query matches literally (PostgREST reads `*` as an ilike alias for %). */
export function containsPattern(query: string): string {
  return `%${query.replace(/[%_*]/g, '\\$&')}%`
}
