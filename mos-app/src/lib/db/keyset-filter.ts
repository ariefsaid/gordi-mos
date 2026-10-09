export type KeysetTimestampColumn = 'created_at' | 'occurred_at'

export function keysetBeforeFilter(column: KeysetTimestampColumn, timestamp: string, id: string): string {
  return `${column}.lt.${timestamp},and(${column}.eq.${timestamp},id.lt.${id})`
}

export function keysetPageFromProbe<Row, Cursor>(
  fetched: Row[], pageSize: number, cursorFor: (row: Row) => Cursor,
): { rows: Row[]; nextCursor: Cursor | null; hasMore: boolean } {
  const rows = fetched.slice(0, pageSize)
  const hasMore = fetched.length > pageSize
  return {
    rows,
    nextCursor: hasMore && rows.length ? cursorFor(rows.at(-1)!) : null,
    hasMore,
  }
}
