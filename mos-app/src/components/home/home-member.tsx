import type { ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
import { RegionCount, RegionRows } from './region-rows'
import type { HomeRegion } from './home-regions'
import './home-layouts.css'

// HomeMember — the capture-first Home for a member (#759, AC-080/081/082).
//
// Members do NOT see tabs, tiles or an Objectives door: they came to Home for what needs THEM
// today. The work column is a small stack — the Café capture door (from #757, when affiliated),
// then a `Needs you now` band — and the Signals feed sits in the standing aside column (the
// SAME `.home-layout` two-column grid every arrangement uses; the layout collapses to a single
// column below 940px so at 390 the three stack in reading order: door → needs-you → Signals).
//
// The needs-you rendering here reuses the List band grammar — `<section>` landmark, band label
// heading, `RegionRows` (loading/error/all-clear/rows all covered) — so an empty needs-you still
// SAYS so (FR-929) and a failed read still surfaces `<alert>` + Retry (DIV-G5).
export interface HomeMemberProps {
  /** The one work region for a member: `needs-you` — the viewer's assigned steps and tasks. */
  needsYou: HomeRegion | null
  /** The Café capture door (from #757). Null when the viewer is not Café-affiliated. */
  cafeDoor: ReactNode
  /** The Signals feed — search-hidden per the composition (`signals-no-search`). */
  feed: ReactNode
}

export function HomeMember({ needsYou, cafeDoor, feed }: HomeMemberProps) {
  const t = useT()
  return (
    <div className="home-layout">
      <div className="stream-group">
        {cafeDoor}
        {needsYou && (
          <section className="stream-band" aria-label={t(needsYou.labelKey)}>
            <div className="stream-band-head">
              {/* h2 for the SAME reason the List band header does: PageFamilyFrame owns the page
                  h1 and Home has no intermediate level (detector: skipped-heading). */}
              <h2 className="stream-band-label">
                {t(needsYou.labelKey)} · <RegionCount region={needsYou} />
              </h2>
            </div>
            <RegionRows region={needsYou} />
          </section>
        )}
      </div>
      {feed}
    </div>
  )
}
