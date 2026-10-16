import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { useMyOpenTaskCount } from '@/hooks/useMyOpenTaskCount'
import { reviewBadgeCount, useCafeWaiting } from '@/lib/use-cafe-waiting'
import {
  admittedModules, destinationForPath, navModeFor, pageCount, pageGroupsFor, rememberModule,
  type Destination, type NavMode,
} from './module-registry'
import { useIsNarrow } from './use-is-narrow'
import { useRailCollapsePref } from './use-rail-collapse-pref'

/** The full labelled nav needs 240px (or 64 + 240) beside a usable page; below this it is the 64px rail with flyouts. */
const FULL_NAV_QUERY = '(min-width: 1280px)'

function useIsFullNavWidth(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(FULL_NAV_QUERY).matches)
  useEffect(() => {
    const mql = window.matchMedia(FULL_NAV_QUERY)
    const handler = (event: MediaQueryListEvent) => setWide(event.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return wide
}

export interface NavLayout {
  /** Below 768px there is no desktop nav at all: tabs and the More drawer are the nav. */
  isNarrow: boolean
  roles: string[]
  /** One module → the single labelled sidebar; two or more → the module rail with a pages panel. */
  mode: NavMode
  /** The 64px rail with flyouts: either the viewport is under 1280px or the viewer folded the nav away. */
  compact: boolean
  /** The viewer's own fold-away choice can change something right now. */
  collapsible: boolean
  /** The destination whose pages the panel lists (module mode, expanded, two or more pages); null = no panel. */
  panelArea: Destination | null
  /** The destination that owns the current route. */
  area: Destination | null
  /** Width of the nav column: 240 sidebar, 64 rail, 64 + 240 rail with panel. */
  columnWidth: string
  /** The top bar's brand cell sits over the rail (64) or the whole sidebar (240). */
  brandWide: boolean
}

/**
 * The ONE place that decides which shell the desktop viewer gets, so the grid column, the top bar's brand
 * cell and the nav itself cannot disagree: the module count picks sidebar or rail + panel, the viewport
 * (and the viewer's own choice) picks full or 64px rail.
 */
export function useNavLayout(): NavLayout {
  const auth = useAuth()
  const { pathname } = useLocation()
  const isNarrow = useIsNarrow()
  const fullWidth = useIsFullNavWidth()
  const { collapsed } = useRailCollapsePref()
  const roles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const mode = navModeFor(roles)
  const compact = !isNarrow && (!fullWidth || collapsed)
  const area = destinationForPath(pathname)
  const panelCandidate = area && (area.id === 'work' || area.zone === 'modules' || area.id === 'admin') ? area : null
  const panelArea = !compact && mode === 'panel' && panelCandidate && pageCount(pageGroupsFor(panelCandidate, roles)) >= 2 ? panelCandidate : null
  const columnWidth = compact ? 'var(--mos-rail-collapsed)'
    : mode === 'sidebar' ? 'var(--mos-rail-width)'
      : panelArea ? 'calc(var(--mos-rail-collapsed) + var(--mos-rail-width))' : 'var(--mos-rail-collapsed)'
  return {
    isNarrow, roles, mode, compact, collapsible: !isNarrow && fullWidth, panelArea, area, columnWidth,
    brandWide: !compact && mode === 'sidebar',
  }
}

export interface NavBadge { count: number; bounded?: boolean; unavailable?: boolean; label: string }

/**
 * The counts a nav row can carry, by page path: the viewer's own open Tasks, and the actionable total across the
 * Review queues they may open (one shared read — see CafeWaitingProvider). An unknown count shows no badge, never zero.
 */
export function useNavBadges(): { forPath: (path: string) => NavBadge | undefined; forDestination: (id: string) => NavBadge | undefined } {
  const t = useT()
  const openTasks = useMyOpenTaskCount()
  const waiting = useCafeWaiting()
  const review = reviewBadgeCount(waiting)
  const tasks: NavBadge | undefined = openTasks ? { count: openTasks, label: t('rail.badge.openTasks', { count: openTasks }) } : undefined
  // Unknown is "—", never zero: a failed read says the count is unavailable; a read still in flight says nothing yet.
  const unknown = waiting.admitted && waiting.keys.some((key) => key !== 'issues' && waiting.queues[key].status === 'error')
  const reviewBadge: NavBadge | undefined = unknown
    ? { count: 0, unavailable: true, label: t('rail.badge.reviewUnavailable') }
    : review && review.count > 0
      ? { count: review.count, bounded: review.bounded, label: t('rail.badge.review', { count: review.bounded ? `${review.count}+` : review.count }) }
      : undefined
  return {
    forPath: (path) => path === '/work/tasks' ? tasks : path === '/cafe/review' ? reviewBadge : undefined,
    // A rail item shows its module's badge as a small marker; the number lives in the accessible name.
    forDestination: (id) => id === 'cafe' ? reviewBadge : undefined,
  }
}

/** Remembers the module whose page is open, for the phone's module tab on pages that belong to no module. */
export function useRememberModule(): void {
  const auth = useAuth()
  const { pathname } = useLocation()
  const roles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const owner = destinationForPath(pathname)
  const admitted = owner?.zone === 'modules' && admittedModules(roles).some((m) => m.id === owner.id)
  useEffect(() => { if (owner && admitted) rememberModule(owner.id) }, [admitted, owner])
}
