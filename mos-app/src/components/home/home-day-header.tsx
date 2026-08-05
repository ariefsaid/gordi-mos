import { useT } from '@/i18n/use-t'
import { dayProgressPct, dayStateLine } from '@/lib/home-day-state'
import '@/pages/home-page.css'

/**
 * The day's tally behind Home's header. `null` — never a partial object — whenever ANY read
 * behind it has not succeeded: a total assembled from some-ready-some-not counts is a number the
 * viewer cannot trace, which is exactly the defect the region counts were fixed for (DIV-G5).
 */
export interface HomeDayTally {
  /** Things the viewer handled today. */
  done: number
  /** Things still in front of them — the sum of the regions' own counts, so it reconciles with
   *  the numbers rendered a few pixels below it. */
  left: number
}

/**
 * `N handled · N left` — the right-aligned half of the header (mockup `.hdr-counts`).
 *
 * Unknowable → an em-dash, the SAME grammar a region count uses in place of a number it cannot
 * yet know. The glyph is decorative here because `HomeHeadState` states the fact in words on the
 * row below; saying it twice to a screen reader would be noise, not access.
 */
export function HomeHeadCounts({ tally }: { tally: HomeDayTally | null }) {
  const t = useT()
  return (
    <span className="home-head-counts tabular-nums">
      {tally
        ? t('home.day.counts', { done: tally.done, left: tally.left })
        : <span aria-hidden="true">—</span>}
    </span>
  )
}

/**
 * The state line + progress track (mockup `.hdr-state`) — the motivational half of the header:
 * "even when there's lots to do, it still seems manageable."
 *
 * The sentence is chosen by the RULE in `lib/home-day-state` (a band from the counts, a phrasing
 * rotated within that band), never authored per-day. Unknowable tally → the row says so in words
 * and draws NO track: an empty track is a visual claim of 0%, and a 0% claim over an unresolved
 * read is the same falsehood the em-dash exists to avoid. The row itself always renders, so the
 * header keeps its height across the pending → resolved transition.
 */
export function HomeHeadState({ tally, rotation }: { tally: HomeDayTally | null; rotation: number }) {
  const t = useT()
  if (!tally) {
    return (
      <div className="home-head-state">
        <span className="home-head-msg home-head-msg--pending">{t('home.day.tallyPending')}</span>
      </div>
    )
  }
  const line = dayStateLine(tally.done, tally.left, rotation)
  const pct = dayProgressPct(tally.done, tally.left)
  return (
    <div className="home-head-state">
      <span className="home-head-msg">
        {t(line.key, line.count != null ? { count: line.count } : undefined)}
      </span>
      {/* The fill's width is the datum itself, so it is an inline style by necessity — every
          other value here (track height, colours, radius) is a token. */}
      <span
        className="home-head-track"
        role="progressbar"
        aria-label={t('home.day.progressLabel')}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className="home-head-fill" style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}
