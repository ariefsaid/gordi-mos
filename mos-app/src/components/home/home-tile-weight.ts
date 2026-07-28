import type { HomeRegionId } from './home-regions'

// The Overview bento's tile weights (OD-V4-7). Its own module so the map is importable by the
// guard that packs it against the authored CSS spans without breaking fast-refresh in the
// component file.
//
// The weights are chosen so consecutive tiles pack to EXACTLY the bento's column count at every
// desktop band — a lone tile with a hole beside it is the raggedness the owner rejected ("the
// boxes dont align … feels untidy nor professional"). 6 columns: 4+2 then 2+4. 4 columns:
// 4 | 2+2 | 4. The phone band is a single column, so it stacks regardless.
//
// `wide` is the consequence tier: the regions carrying the viewer's own work, which hold task rows
// and need the room. `narrow` is the notice tier. needs-you keeps the lead — it is first, top-left,
// and in the wide tier, and nothing outranks it.
//
// Guarded by guard-bento-rows.css.test.ts.
export const HOME_TILE_WEIGHT: Record<HomeRegionId, 'wide' | 'narrow'> = {
  'needs-you': 'wide',
  'failed-checks': 'narrow',
  mentions: 'narrow',
  'my-work': 'wide',
}
