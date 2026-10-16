// Location path and record-field labels shared by Café navigation, records, and capture.
export const LOCATIONS_PATH = '/cafe/locations'
export const CHANGE_LOCATION_PATH = '/cafe/locations/change-location'

export type RecordLocationKey = 'production' | 'storeOutput' | 'from' | 'to' | 'storage' | 'storeIn'

/** Which location fields each kind of record carries (spec: Production location + From / To storage where relevant). */
export const RECORD_LOCATION_KEYS: Record<'made' | 'transferred' | 'wasted' | 'counted' | 'received' | 'requested', RecordLocationKey[]> = {
  made: ['production', 'storeOutput'], transferred: ['from', 'to'], wasted: ['storage'], counted: ['storage'], received: ['storeIn'], requested: [],
}
