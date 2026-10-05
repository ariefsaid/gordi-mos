import { isProfileFeatureAvailable, isProfilePathAvailable, type ReleaseProfile } from './build-settings'

/** Whether a notification's presentation belongs in the selected build profile. */
export function notificationAvailableInProfile(
  row: { metadata: unknown },
  profile: ReleaseProfile,
): boolean {
  const metadata = row.metadata as { entity?: unknown } | null | undefined
  const entity = metadata?.entity
  if (entity == null || typeof entity !== 'object') return true

  const rawEntity = entity as { type?: unknown; route?: unknown }
  if (typeof rawEntity.route === 'string' && !isProfilePathAvailable(rawEntity.route, profile)) return false
  if ((rawEntity.type === 'task' || rawEntity.type === 'signal') &&
    !isProfileFeatureAvailable('workCollections', profile)) return false
  return true
}
