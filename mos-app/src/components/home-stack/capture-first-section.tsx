// CaptureFirstSection — the contributor/member section of the stacked-union Home
// (Issue E, docs/specs/home-stacked-union.spec.md §2.3/FR-HS30). A pure contributor (no owner/BU-head/
// manager scope) lands on a capture-first surface: a fast-capture call to action (→ /cafe/log, the
// Activity log/add form) + their assigned R/A task table (reused MyTasksCard — "assigned steps"). NO
// finance row, NO cockpit. Reuses existing kit — not a tile rewrite.
import { useT } from '@/i18n/use-t'
import { Link } from 'react-router-dom'
import { MyTasksCard } from '@/components/weekly/my-tasks-card'

interface CaptureFirstSectionProps {
  viewerId: string
  now: Date
}

export function CaptureFirstSection({ viewerId, now }: CaptureFirstSectionProps) {
  const t = useT()
  return (
    <section className="home-stack-section" aria-labelledby="home-stack-capture-heading">
      <div className="home-stack-section-head">
        <h2 id="home-stack-capture-heading" className="home-stack-section-title">
          {t('home.stack.capture.title')}
        </h2>
        <p className="home-stack-section-subtitle">{t('home.stack.capture.subtitle')}</p>
      </div>

      {/* Fast-capture CTA — one tap from Home to the floor capture (dominant, first). */}
      <Link to="/cafe/log" className="home-stack-capture-cta">
        <span aria-hidden="true">＋</span> {t('home.stack.capture.cta')}
      </Link>

      {/* Assigned steps — the viewer's R/A task table (reused). */}
      <MyTasksCard viewerId={viewerId} now={now} />
    </section>
  )
}
