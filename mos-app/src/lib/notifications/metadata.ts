/** Raw producer fields shared by profile filtering and target resolution. */
export type NotificationEntityEnvelope = {
  type?: unknown
  id?: unknown
  route?: unknown
}

export function readNotificationEntity(row: { metadata: unknown }): NotificationEntityEnvelope | null {
  const metadata = row.metadata as { entity?: unknown } | null | undefined
  const entity = metadata?.entity
  return entity != null && typeof entity === 'object' ? entity as NotificationEntityEnvelope : null
}
