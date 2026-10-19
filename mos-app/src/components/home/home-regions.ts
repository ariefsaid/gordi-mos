import type { StreamBandState, StreamItem } from '@/lib/home-stream'
import type { MessageKey } from '@/i18n/messages'

// The ONE region model. The Home daily brief renders these same regions without recomputing their
// scopes. A region with zero items is still returned, so an empty region is distinguishable from a
// hidden one (FR-929).
// needs-you is the task attention union: overdue → due today → blocked.

export type HomeRegionId = 'needs-you' | 'failed-checks' | 'my-work'

interface HomeRegionDrillTo {
  /** Where this region's full scope lives in the app. */
  route: string
}

/**
 * Each region's canonical destination — the app surface that already owns its full scope.
 *
 * Before this map only `my-work` had one, so a `needs-you` region holding 9 items rendered
 * "5 more" on Overview and offered no way to reach them from Home at all (Nielsen #3: the app
 * named something and then refused to show it).
 *
 * `needs-you` shares my-work's destination on purpose: no saved view expresses
 * overdue ∪ due-today ∪ blocked, and `?view=my-work` is the ONE view that holds every item the
 * region ranks — due-date ascending by default, so they arrive at the top. Inventing a new
 * server-side view for the union is out of scope here and would be a data change, not a link.
 *
 */
const REGION_ROUTE: Record<HomeRegionId, string> = {
  'needs-you': '/work/tasks?view=my-work',
  // A rejected café log is re-entered on the log itself (the same route its rows link to).
  'failed-checks': '/cafe/log',
  'my-work': '/work/tasks?view=my-work',
}

export interface HomeRegion {
  id: HomeRegionId
  labelKey: MessageKey
  items: StreamItem[]
  /** Total available rows before a deliberate Home display cap (e.g. My Work's seven-row slice). */
  totalItemCount?: number
  /** Count of this region's full candidate scope, null until its own source succeeds (DIV-G5). */
  count: number | null
  /** State of the read(s) behind this region (DIV-G5, `docs/specs/home-layout-preference.spec.md`
   *  §7): a still-loading or failed read must render distinguishably from a genuinely empty
   *  region, never as an indistinguishable empty all-clear. Defaults to 'ready' when the caller
   *  reports no async state (e.g. a test building regions directly from static data). */
  state: StreamBandState
  /** Retries the read(s) behind this region. Set whenever `state` can become 'error'. */
  onRetry?: () => void
  /** The region's destination; its link never carries a count from a different scope. */
  drillTo?: HomeRegionDrillTo
}

export interface HomeRegionInput {
  overdue: StreamItem[]
  dueToday: StreamItem[]
  blocked: StreamItem[]
  myWork: StreamItem[]
  failedChecks: StreamItem[]
  /** State of the ONE shared tasks projection behind needs-you (overdue/due-today/blocked) AND
   *  my-work — the same fetch, so they share one state and one retry (never a duplicate error). */
  taskState?: StreamBandState
  /** Failed checks are a real region only when the caller has explicitly admitted the viewer. */
  failedChecksAdmitted: boolean
  onRetryTasks?: () => void
  /** failed-checks reads its own independent DAL. */
  failedChecksState?: StreamBandState
  onRetryFailedChecks?: () => void
  /** My Work rows available before its deliberate seven-row display cap. */
  myWorkTotalItemCount?: number
}

export function buildHomeRegions(input: HomeRegionInput): HomeRegion[] {
  const needsYouItems = [...input.overdue, ...input.dueToday, ...input.blocked]
  const taskState = input.taskState ?? 'ready'
  const needsYouState: StreamBandState = taskState
  const retryNeedsYou = input.onRetryTasks
  const drillTo = (id: HomeRegionId): HomeRegionDrillTo => ({ route: REGION_ROUTE[id] })

  const failedChecksState = input.failedChecksState ?? 'ready'
  // A count exists only where the read behind it SUCCEEDED (DIV-G5). One helper, applied to every
  // region, so no arrangement can grow its own idea of when a number is trustworthy.
  const countOf = (items: StreamItem[], state: StreamBandState) =>
    state === 'ready' ? items.length : null

  return [
    {
      id: 'needs-you', labelKey: 'home.region.needsYou', items: needsYouItems,
      totalItemCount: needsYouState === 'ready' ? needsYouItems.length : undefined,
      count: countOf(needsYouItems, needsYouState),
      state: needsYouState, onRetry: retryNeedsYou,
      drillTo: drillTo('needs-you'),
    },
    ...(input.failedChecksAdmitted ? [{
      id: 'failed-checks' as const, labelKey: 'home.stream.band.failedChecks' as MessageKey,
      items: input.failedChecks,
      count: countOf(input.failedChecks, failedChecksState), state: failedChecksState,
      onRetry: input.onRetryFailedChecks,
      drillTo: drillTo('failed-checks'),
    }] : []),
    {
      id: 'my-work', labelKey: 'workbench.home.otherOpen', items: input.myWork,
      totalItemCount: taskState === 'ready' ? input.myWorkTotalItemCount ?? input.myWork.length : undefined,
      // This count belongs to the Other open tasks projection, not the separate shared My-open
      // count shown in Home's head.
      count: taskState === 'ready' ? input.myWorkTotalItemCount ?? input.myWork.length : null,
      state: taskState, onRetry: input.onRetryTasks,
      drillTo: drillTo('my-work'),
    },
  ]
}
