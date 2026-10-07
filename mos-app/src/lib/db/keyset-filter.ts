export type KeysetTimestampColumn = 'created_at' | 'occurred_at'

export function keysetBeforeFilter(column: KeysetTimestampColumn, timestamp: string, id: string): string {
  return `${column}.lt.${timestamp},and(${column}.eq.${timestamp},id.lt.${id})`
}
