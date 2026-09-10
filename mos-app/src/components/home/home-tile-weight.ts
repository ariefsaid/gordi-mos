import type { HomeRegionId } from './home-regions'

// The lead has the most room; the remaining two regions pair beneath it in the desktop bento.
export const HOME_TILE_WEIGHT: Record<HomeRegionId, 'full' | 'wide' | 'narrow'> = {
  'needs-you': 'full',
  'failed-checks': 'narrow',
  'my-work': 'wide',
}

/** Overview stays a summary, while RegionRows keeps the full count and canonical drill door honest. */
export const OVERVIEW_TILE_ROWS = 5
