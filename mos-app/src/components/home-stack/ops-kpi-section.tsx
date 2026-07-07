// OpsKpiSection — the owner-DEFERRED ops-KPI empty-state for a Home cockpit section
// (Issue E, docs/specs/home-stacked-union.spec.md §2.6). The ops-KPI metric set is owner-decided and
// NOT built this slice, so this is a documented empty-state placeholder: NO fake numbers, NO dead-end.
// It drills to /ops (the current floor-visibility surface) as the interim next action.
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'

export function OpsKpiSection() {
  const t = useT()
  return (
    <div className="home-stack-subsection" aria-label={t('home.stack.opskpi.title')}>
      <h3 className="home-stack-subsection-title">{t('home.stack.opskpi.title')}</h3>
      <div className="home-stack-slot home-stack-slot--placeholder">
        <span className="home-stack-slot-label">{t('home.stack.opskpi.coming')}</span>
        <Link
          to="/ops"
          className="home-stack-slot-link"
          aria-label={t('home.stack.opskpi.drill')}
        >
          {t('home.stack.opskpi.drill')} →
        </Link>
      </div>
    </div>
  )
}
