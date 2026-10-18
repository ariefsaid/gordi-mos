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
import { useModuleAvailability } from '@/lib/module-availability'
import type { ModuleId } from '@/lib/db/module-settings'

/** The 104px whole-word global rail remains visible; below 1280px contextual pages move into flyouts. */
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
  isOn: (moduleId: ModuleId) => boolean
  /** One page-bearing destination → labelled sidebar; Work plus an admitted module → rail with contextual panel. */
  mode: NavMode
  /** The 104px labelled rail with flyouts: viewport under 1280px or the viewer folded the contextual panel away. */
  compact: boolean
  /** The viewer's own fold-away choice can change something right now. */
  collapsible: boolean
  /** The expanded contextual destination's pages; null when the rail is folded or the route has no panel. */
  panelArea: Destination | null
  /** The destination that owns the current route. */
  area: Destination | null
  /** Width of the nav column: 240px sidebar, 104px rail, or rail plus the clamped contextual panel. */
  columnWidth: string
  /** The top bar's brand cell spans the 104px rail or the whole 240px sidebar. */
  brandWide: boolean
}

/**
 * The ONE place that decides which shell the desktop viewer gets, so the grid column, the top bar's brand
 * cell and the nav itself cannot disagree: admitted Work plus module destinations pick the rail + panel,
 * while the viewport (and the viewer's own choice) picks full panel or the 104px rail.
 */
export function useNavLayout(): NavLayout {
  const auth = useAuth()
  const { pathname } = useLocation()
  const isNarrow = useIsNarrow()
  const fullWidth = useIsFullNavWidth()
  const { collapsed } = useRailCollapsePref()
  const { isOn } = useModuleAvailability()
  const roles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const mode = navModeFor(roles, isOn)
  const compact = !isNarrow && (!fullWidth || collapsed)
  const area = destinationForPath(pathname)
  const panelCandidate = area && (area.id === 'work' || area.zone === 'modules' || area.id === 'admin') ? area : null
  const panelArea = !compact && mode === 'panel' && panelCandidate && pageCount(pageGroupsFor(panelCandidate, roles, isOn)) >= 2 ? panelCandidate : null
  const columnWidth = compact ? 'var(--mos-rail-collapsed)'
    : mode === 'sidebar' ? 'var(--mos-rail-width)'
      : panelArea ? 'calc(var(--mos-rail-collapsed) + clamp(12rem, var(--mos-context-width), 16rem))' : 'var(--mos-rail-collapsed)'
  return {
    isNarrow, roles, isOn, mode, compact, collapsible: !isNarrow && fullWidth, panelArea, area, columnWidth,
    brandWide: !compact && mode === 'sidebar',
  }
}

export interface NavBadge { count: number; bounded?: boolean; unavailable?: boolean; label: string; displayText?: string }

/**
 * The counts a nav row can carry, by page path: the viewer's own open Tasks, and the actionable total across the
 * Review queues they may open (one shared read — see CafeWaitingProvider). An unknown count shows no badge, never zero.
 */
export function useNavBadges(): { forPath: (path: string) => NavBadge | undefined; forDestination: (id: string) => NavBadge | undefined } {
  const t = useT()
  const openTasks = useMyOpenTaskCount()
  const waiting = useCafeWaiting()
  const review = reviewBadgeCount(waiting)
  const tasks: NavBadge | undefined = openTasks ? {
    count: openTasks,
    label: t('rail.badge.openTasks', { count: openTasks }),
    displayText: t('rail.badge.openTasksShort', { count: openTasks }),
  } : undefined
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
  const { isOn } = useModuleAvailability()
  const owner = destinationForPath(pathname)
  const admitted = owner?.zone === 'modules' && admittedModules(roles, isOn).some((m) => m.id === owner.id)
  useEffect(() => { if (owner && admitted) rememberModule(owner.id) }, [admitted, owner])
}
