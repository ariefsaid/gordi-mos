import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { StreamRow } from './stream-row'
import type { ReasonStyle } from './stream-reason'
import type { HomeRegion, HomeRegionId } from './home-regions'
import type { StreamItem } from '@/lib/home-stream'
import type { MessageKey } from '@/i18n/messages'
// The shared row/band texture (`.stream-band-list`, `.stream-band-link`, `.stream-row*`) — owned
// by home-stream.css, the same stylesheet the row grammar was extracted from (Task 11). None of
// the three layout files import it, so it must be pulled in wherever this shared grammar renders.
import './home-stream.css'

/** How each region renders its rows' reason mark.
 *
 *  `failed-checks` and `mentions` carry ONE tone for every row at rest, and its label restates the
 *  region's own name verbatim ("Check failed" under "Failed checks", "Mentions you" under
 *  "Mentions") — DESIGN.md Don't: "Don't repeat a value under a control that the row or card
 *  already renders as its own column/field."
 *
 *  `needs-you` keeps the reason — the overdue AGE ("Overdue · 8d") is information the region name
 *  cannot carry — but as toned TEXT, not a filled pill (DESIGN.md § Row status as text, v4; the
 *  same call the retired single-stream already made for its overdue band). Measured on the
 *  rendered band: a filled amber chip on every row marks everything and therefore marks nothing,
 *  and it out-shouts the 15px/600 row titles it exists to rank.
 *
 *  `my-work` keeps the chip: there the mark is genuinely sparse — the odd Blocked row among
 *  otherwise unremarkable open work — which is exactly where DESIGN.md says a pill stays correct. */
const REASON_STYLE: Record<HomeRegionId, ReasonStyle> = {
  'needs-you': 'text',
  'failed-checks': 'none',
  mentions: 'none',
  'my-work': 'chip',
}

/** What a region says when its read succeeded and there is genuinely nothing in it. `my-work` has
 *  its own line because "all caught up" would be wrong there — attention work may still be ranked
 *  above it. */
const EMPTY_KEY: Record<HomeRegionId, MessageKey> = {
  'needs-you': 'home.attention.allClear',
  'failed-checks': 'home.attention.allClear',
  mentions: 'home.attention.allClear',
  'my-work': 'home.stream.myWorkEmpty',
}

// RegionRows — the ONE region-body grammar shared by all three Home layouts (FR-930). A region's
// read can be loading, errored, ready-with-rows, or ready-and-empty (`HomeRegion.state`, DIV-G5):
// each must render distinguishably from the others, never as an indistinguishable blank
// (docs/specs/home-layout-preference.spec.md §7). Mirrors the loading/error grammar the retired
// single-stream HomeStream's IndependentBand carried per band.
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
  // A ready region with nothing in it must SAY so. Rendering an empty <ul> left a blank tab body
  // (Focused), a hollow card (Overview) and a dangling band heading (List) — none of which
  // distinguishes "clear" from "broken", which is the whole point of keeping the region (FR-929).
  if (rows.length === 0) {
    // The state-kit EmptyState in its compact `stream-all-clear` treatment — the SAME primitive the
    // attention group already uses for an all-clear, rather than a plain muted <p> that reads as
    // leftover text. `nested`: the band around it is already the labelled landmark, so this must
    // not add a second region inside it.
    return (
      <EmptyState
        title={t(EMPTY_KEY[region.id])}
        variant="quiet"
        nested
        className="stream-all-clear"
      />
    )
  }
  // Overview renders a region's top rows only. Stating the remainder keeps the tile honest at the
  // volume OD-V4-7 exists for (product principle: numbers traceable or visibly absent). It is a
  // fact, not an affordance — the region's own drill link, where one exists, is the way through.
  const hidden = region.items.length - rows.length
  return (
    <>
      <ul className="stream-band-list">
        {rows.map((i) => (
          <StreamRow key={i.id} item={i} hidePic={hidePic} reasonStyle={REASON_STYLE[region.id]} />
        ))}
      </ul>
      {hidden > 0 && <p className="stream-band-more">{t('home.region.more', { count: hidden })}</p>}
    </>
  )
}

/** A region's count — the ONE place any arrangement turns `HomeRegion.count` into pixels.
 *
 *  `null` means the read behind the region has not succeeded, and the number is therefore not
 *  knowable (DIV-G5). It renders as an em-dash rather than a `0`: a `0` beside a spinner or an
 *  error states a falsehood with full confidence, and the viewer has no way to trace it. The glyph
 *  is decorative, so the fact is also said in words for a screen reader — an em-dash alone is
 *  announced as punctuation or not at all. */
export function RegionCount({ region, className }: { region: HomeRegion; className?: string }) {
  const t = useT()
  if (region.count !== null) return <span className={className}>{region.count}</span>
  return (
    <span className={className}>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{t('home.region.countPending')}</span>
    </span>
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
