import { isProfileFeatureAvailable, isProfilePathAvailable, type ReleaseProfile } from './build-settings'
import { readNotificationEntity } from '@/lib/notifications/metadata'

/** Whether a notification's presentation belongs in the selected build profile. */
export function notificationAvailableInProfile(
  row: { metadata: unknown },
  profile: ReleaseProfile,
): boolean {
  const rawEntity = readNotificationEntity(row)
  if (rawEntity == null) return true
  if (typeof rawEntity.route === 'string' && !isProfilePathAvailable(rawEntity.route, profile)) return false
  if ((rawEntity.type === 'task' || rawEntity.type === 'signal') &&
    !isProfileFeatureAvailable('workCollections', profile)) return false
  return true
}
