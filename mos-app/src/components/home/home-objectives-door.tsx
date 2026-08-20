import { useId } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
// The band grammar this door is built from (`.stream-band` / `-head` / `-label` / `-link`) lives
// in home-stream.css — the same shared texture Home's List bands and the Signals feed head render
// through. Pulled in here because no arrangement imports it on this section's behalf.
import './home-stream.css'
import './home-objectives-door.css'

/**
 * AC-204 (4): Home's Objectives roll-up door.
 *
 * #179 cut the cascade route and took Home's progress drill with it. What was left on the
 * owner-cockpit read as a surface with something removed. This is the successor door on the
 * SHIPPED Home, and it is deliberately shaped like a finished section rather than like a drop
 * point: a real headed band with the same hairline + display-face label every other Home group
 * carries, a caption that states what rolls up, and a live drill link. No dashed placeholder, no
 * "coming" language — that is what a removed surface leaves behind.
 *
 * Presentational and read-free: `/work/objectives` owns the roll-up itself and is ungated
 * (OD-V4-1), so the door states no figure it has not fetched (DIV-G5 — a count Home cannot trace
 * is worse than no count). HomePage decides WHO sees it; this component decides how it reads.
 */
export function HomeObjectivesDoor() {
  const t = useT()
  const titleId = useId()
  return (
    <section className="stream-band" aria-labelledby={titleId}>
      <div className="stream-band-head">
        {/* h2, matching its peer sections in this column: PageFamilyFrame owns Home's only h1 and
            there is no intermediate level, so an h3 would skip one (detector: skipped-heading). */}
        <h2 id={titleId} className="stream-band-label">{t('home.objectives.title')}</h2>
        {/* The band's own drill door, in the shared `.stream-band-link` treatment. Its label does
            not repeat the heading above it (DESIGN.md Don't — "don't repeat a value under a
            control that the row or card already renders"); the section's accessible name carries
            the subject. */}
        <Link to="/work/objectives" className="stream-band-link">{t('home.objectives.drill')}</Link>
      </div>
      <p className="home-objectives-rollup">{t('home.objectives.rollup')}</p>
    </section>
  )
}
