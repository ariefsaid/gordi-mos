import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { StreamRow } from './stream-row'
import type { HomeRegion } from './home-regions'
import type { StreamItem } from '@/lib/home-stream'
// The shared row/band texture (`.stream-band-list`, `.stream-band-link`, `.stream-row*`) — owned
// by home-stream.css, the same stylesheet the row grammar was extracted from (Task 11). None of
// the three layout files import it, so it must be pulled in wherever this shared grammar renders.
import './home-stream.css'

// RegionRows — the ONE region-body grammar shared by all three Home layouts (FR-930). A region's
// read can be loading, errored, or ready (`HomeRegion.state`, DIV-G5): a still-loading or failed
// read must render distinguishably from a genuinely empty region, never as an indistinguishable
// empty all-clear (docs/specs/home-layout-preference.spec.md §7). Mirrors the loading/error
// grammar the retired single-stream HomeStream's IndependentBand carried per band.
export function RegionRows({ region, items, hidePic }: {
  region: HomeRegion
  /** Defaults to `region.items`; Overview passes a sliced subset while still reading `region.state`
   *  (a loading/error region shows its status regardless of how many items would otherwise show). */
  items?: StreamItem[]
  hidePic?: boolean
}) {
  const t = useT()
  if (region.state === 'loading') {
    return <LoadingShell count={2} label={t(region.labelKey)} />
  }
  if (region.state === 'error') {
    return (
      <ErrorState
        message={t('home.attention.laneError')}
        onRetry={region.onRetry}
        retryLabel={t('home.attention.retry')}
      />
    )
  }
  const rows = items ?? region.items
  return (
    <ul className="stream-band-list">
      {rows.map((i) => <StreamRow key={i.id} item={i} hidePic={hidePic} />)}
    </ul>
  )
}

/** The restored "My open tasks · N →" drill link (the FULL open-task count, not just the capped
 *  items the region renders) — my-work's own full-scope destination. Absent when the region has
 *  no `drillTo` to report (e.g. the tasks projection has not resolved yet). */
export function RegionDrillLink({ region }: { region: HomeRegion }) {
  const t = useT()
  if (!region.drillTo) return null
  return (
    <Link to={region.drillTo.route} className="stream-band-link">
      {t('home.stream.allTasks', { count: region.drillTo.count })}
    </Link>
  )
}
