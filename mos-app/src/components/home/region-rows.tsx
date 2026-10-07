import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import type { HomeRegion } from './home-regions'

/** A region's count — the ONE place any arrangement turns HomeRegion.count into pixels.
 * `null` means the read behind the region has not succeeded, so the UI must not claim zero. */
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

/** The canonical destination for a region, with visible and open counts plus any remainder. */
export function RegionDrillLink({ region, shown = region.items.length, more }: {
  region: HomeRegion
  shown?: number
  more?: number
}) {
  const t = useT()
  if (!region.drillTo) return null
  const label = more != null
    ? region.drillTo.count != null
      ? t('home.stream.allTasksMore', { shown, count: region.drillTo.count, more })
      : t('home.region.moreTarget', { shown, count: more, label: t(region.labelKey) })
    : region.drillTo.count != null
      ? t('home.stream.allTasks', { shown, count: region.drillTo.count })
      : region.id === 'failed-checks'
        ? t('home.brief.reviewChecks')
        : t('home.brief.viewTasks')
  return (
    <Link to={region.drillTo.route} className="stream-band-link tap-floor">
      {label}
    </Link>
  )
}
