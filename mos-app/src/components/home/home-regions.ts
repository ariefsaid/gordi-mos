import type { ReactNode } from 'react'
import type { StreamBandState, StreamItem } from '@/lib/home-stream'
import type { MessageKey } from '@/i18n/messages'

// The ONE region model. All three Home arrangements render these same regions — a layout chooses
// how to present them, never which of them exist (NFR-924 parity). A region with zero items is
// still returned, so an empty region is distinguishable from a hidden one (FR-929).
// needs-you is the task attention union: overdue → due today → blocked.

export type HomeRegionId = 'needs-you' | 'failed-checks' | 'my-work'

export interface HomeRegionDrillTo {
  /** Where this region's FULL scope lives in the app. */
  route: string
  /** The count at that destination — present only where the region has an honest full-scope
   *  figure to advertise (my-work's open-task count). Absent is not zero: a region with a
   *  destination but no traceable total must not invent one (DIV-G5). */
  count?: number
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
  /** This region's full-scope destination (`REGION_ROUTE`) — every region has one, because a
   *  region that names a remainder must be able to show it. `count` rides along only where the
   *  region has an honest full-scope figure (my-work's "My open tasks · N →"). */
  drillTo?: HomeRegionDrillTo
  /** Optional content rendered BEFORE the region's task rows (RegionRows). Used by needs-you to
   *  mount the Home Needs-you-now Signal rows (#773 / AC-019) — Signals are ranked into the same
   *  region as the task attention bands, sharing its heading. The row component is null-safe when
   *  it has nothing to render; `preludeHasContent` says whether it renders anything, so the
   *  region's empty state (task rows empty AND nothing in the prelude) stays correct. */
  prelude?: ReactNode
  preludeHasContent?: boolean
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
  onRetryTasks?: () => void
  /** failed-checks reads its own independent DAL. */
  failedChecksState?: StreamBandState
  onRetryFailedChecks?: () => void
  /** The viewer's FULL open-task count (all owned, non-Done tasks) — feeds my-work's drill link.
   *  Absent (no link) when the caller has no honest count to report yet. */
  myWorkFullCount?: number
  /** The pre-rendered Signal attention rows the needs-you region mounts BEFORE its task rows
   *  (#773 / AC-019). HomePage owns the ONE loader + the ack write; this input is presentational
   *  only so the region model stays framework-agnostic. */
  needsYouPrelude?: ReactNode
  /** How many Signal attention rows the prelude renders — added into the needs-you region's
   *  count so the tab/tile figure reconciles with what a viewer can see below it. Undefined
   *  while the Signal read has not succeeded (same DIV-G5 rule the task count follows); a
   *  successful empty read is `0`. */
  needsYouPreludeCount?: number
}

export function buildHomeRegions(input: HomeRegionInput): HomeRegion[] {
  const needsYouItems = [...input.overdue, ...input.dueToday, ...input.blocked]
  const taskState = input.taskState ?? 'ready'
  const needsYouState: StreamBandState = taskState
  const retryNeedsYou = input.onRetryTasks
  const drillTo = (id: HomeRegionId, count?: number): HomeRegionDrillTo =>
    count != null ? { route: REGION_ROUTE[id], count } : { route: REGION_ROUTE[id] }

  const failedChecksState = input.failedChecksState ?? 'ready'
  // A count exists only where the read behind it SUCCEEDED (DIV-G5). One helper, applied to every
  // region, so no arrangement can grow its own idea of when a number is trustworthy.
  const countOf = (items: StreamItem[], state: StreamBandState) =>
    state === 'ready' ? items.length : null

  // The needs-you region's count union — task attention items plus Signal attention rows the
  // prelude renders (#773). Both reads share the region's heading, so the count states them both.
  // When a prelude is wired in and its read has NOT succeeded (its count is undefined), the union
  // is not knowable and the count is null (DIV-G5). When no prelude is wired at all (undefined
  // node, undefined count), the region reads as before: taskCount only.
  const needsYouTaskCount = countOf(needsYouItems, needsYouState)
  const preludeMounted = input.needsYouPrelude !== undefined
  const needsYouCount =
    needsYouTaskCount === null
      ? null
      : !preludeMounted
        ? needsYouTaskCount
        : input.needsYouPreludeCount === undefined
          ? null
          : needsYouTaskCount + input.needsYouPreludeCount

  return [
    {
      id: 'needs-you', labelKey: 'home.region.needsYou', items: needsYouItems,
      count: needsYouCount,
      state: needsYouState, onRetry: retryNeedsYou,
      drillTo: drillTo('needs-you'),
      prelude: input.needsYouPrelude,
      preludeHasContent: (input.needsYouPreludeCount ?? 0) > 0,
    },
    {
      id: 'failed-checks', labelKey: 'home.stream.band.failedChecks', items: input.failedChecks,
      count: countOf(input.failedChecks, failedChecksState), state: failedChecksState,
      onRetry: input.onRetryFailedChecks,
      drillTo: drillTo('failed-checks'),
    },
    {
      id: 'my-work', labelKey: 'home.stream.band.myWork', items: input.myWork,
      count: countOf(input.myWork, taskState), state: taskState, onRetry: input.onRetryTasks,
      drillTo: drillTo('my-work', input.myWorkFullCount),
    },
  ]
}
