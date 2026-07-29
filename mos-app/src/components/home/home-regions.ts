import type { StreamBandState, StreamItem } from '@/lib/home-stream'
import type { MessageKey } from '@/i18n/messages'

// The ONE region model. All three Home arrangements render these same regions — a layout chooses
// how to present them, never which of them exist (NFR-924 parity). A region with zero items is
// still returned, so an empty region is distinguishable from a hidden one (FR-929).

export type HomeRegionId = 'needs-you' | 'failed-checks' | 'mentions' | 'my-work'

export interface HomeRegionDrillTo {
  route: string
  count: number
}

export interface HomeRegion {
  id: HomeRegionId
  labelKey: MessageKey
  items: StreamItem[]
  /** How many items this region holds — `null` whenever the read behind it has NOT succeeded
   *  (DIV-G5, spec §7 + NFR-924). It used to be `items.length` with no reference to `state`, so a
   *  failed tasks read rendered `Needs you now 0` on every arrangement while the region itself
   *  showed the error, and a never-resolving skeleton read `0` too. A count the viewer cannot
   *  trace is worse than no count: the page stated a falsehood with full confidence. Absent, not
   *  zero — the arrangements render it as an em-dash. */
  count: number | null
  /** State of the read(s) behind this region (DIV-G5, `docs/specs/home-layout-preference.spec.md`
   *  §7): a still-loading or failed read must render distinguishably from a genuinely empty
   *  region, never as an indistinguishable empty all-clear. Defaults to 'ready' when the caller
   *  reports no async state (e.g. a test building regions directly from static data). */
  state: StreamBandState
  /** Retries the read(s) behind this region. Set whenever `state` can become 'error'. */
  onRetry?: () => void
  /** A region-level drill link to its full-scope destination, present only where the rendered
   *  `items` are a subset of a larger collection (my-work is capped; the historical "My open
   *  tasks · N →" link carried the viewer's FULL open-task count, not just the capped items
   *  rendered in the region itself). */
  drillTo?: HomeRegionDrillTo
}

export interface HomeRegionInput {
  overdue: StreamItem[]
  dueToday: StreamItem[]
  blocked: StreamItem[]
  myWork: StreamItem[]
  failedChecks: StreamItem[]
  mentions: StreamItem[]
  /** State of the ONE shared tasks projection behind needs-you (overdue/due-today/blocked) AND
   *  my-work — the same fetch, so they share one state and one retry (never a duplicate error). */
  taskState?: StreamBandState
  onRetryTasks?: () => void
  /** failed-checks and mentions each read their own independent DAL. */
  failedChecksState?: StreamBandState
  onRetryFailedChecks?: () => void
  mentionsState?: StreamBandState
  onRetryMentions?: () => void
  /** The viewer's FULL open-task count (all owned, non-Done tasks) — feeds my-work's drill link.
   *  Absent (no link) when the caller has no honest count to report yet. */
  myWorkFullCount?: number
}

export function buildHomeRegions(input: HomeRegionInput): HomeRegion[] {
  const needsYou = [...input.overdue, ...input.dueToday, ...input.blocked]
  const taskState = input.taskState ?? 'ready'
  const myWorkDrillTo: HomeRegionDrillTo | undefined = input.myWorkFullCount != null
    ? { route: '/work/tasks?view=my-work', count: input.myWorkFullCount }
    : undefined

  const failedChecksState = input.failedChecksState ?? 'ready'
  const mentionsState = input.mentionsState ?? 'ready'
  // A count exists only where the read behind it SUCCEEDED (DIV-G5). One helper, applied to every
  // region, so no arrangement can grow its own idea of when a number is trustworthy.
  const countOf = (items: StreamItem[], state: StreamBandState) =>
    state === 'ready' ? items.length : null

  return [
    {
      id: 'needs-you', labelKey: 'home.region.needsYou', items: needsYou,
      count: countOf(needsYou, taskState),
      state: taskState, onRetry: input.onRetryTasks,
    },
    {
      id: 'failed-checks', labelKey: 'home.stream.band.failedChecks', items: input.failedChecks,
      count: countOf(input.failedChecks, failedChecksState), state: failedChecksState,
      onRetry: input.onRetryFailedChecks,
    },
    {
      id: 'mentions', labelKey: 'home.stream.band.mentions', items: input.mentions,
      count: countOf(input.mentions, mentionsState), state: mentionsState,
      onRetry: input.onRetryMentions,
    },
    {
      id: 'my-work', labelKey: 'home.stream.band.myWork', items: input.myWork,
      count: countOf(input.myWork, taskState), state: taskState, onRetry: input.onRetryTasks,
      drillTo: myWorkDrillTo,
    },
  ]
}
