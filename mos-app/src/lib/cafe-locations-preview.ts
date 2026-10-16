// The one question every embedded location field asks, and the small tables they share. The answer comes from the
// SAME ship authority as the /cafe/locations route (lib/ship-gate.ts): with the preview opt-in off, every embed is absent.
import { isShipGated } from '@/lib/ship-gate'

export const LOCATIONS_PREVIEW_ROOT = '/cafe/locations'
export const CHANGE_LOCATION_PATH = '/cafe/locations/change-location'

/** Is the Locations preview on for this launch? A build-time constant, never a role, query or stored setting. */
export const useLocationsPreview = () => !isShipGated(LOCATIONS_PREVIEW_ROOT)

export type RecordLocationKey = 'production' | 'storeOutput' | 'from' | 'to' | 'storage' | 'storeIn'

/** Which location fields each kind of record carries (spec: Production location + From / To storage where relevant). */
export const RECORD_LOCATION_KEYS: Record<'made' | 'transferred' | 'wasted' | 'counted' | 'received' | 'requested', RecordLocationKey[]> = {
  made: ['production', 'storeOutput'], transferred: ['from', 'to'], wasted: ['storage'], counted: ['storage'], received: ['storeIn'], requested: [],
}
