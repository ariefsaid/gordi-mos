import type { StreamBandState, StreamItem } from '@/lib/home-stream'
import type { MessageKey } from '@/i18n/messages'

// The ONE region model. All three Home arrangements render these same regions — a layout chooses
// how to present them, never which of them exist (NFR-924 parity). A region with zero items is
// still returned, so an empty region is distinguishable from a hidden one (FR-929).
// needs-you is cross-domain: Daily Log needs-attention flags (#302, AC-091) lead, then overdue
// → due today → blocked.

export type HomeRegionId = 'needs-you' | 'failed-checks' | 'mentions' | 'my-work'

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
 * The Daily Log needs-attention rows (#302) are the one content this destination does NOT hold —
 * no surface unions log entries with tasks. They are therefore `pinnedCount`-exempt from any
 * arrangement's visible cut: every flagged row renders (each linking to /ops itself), so the
 * remainder behind this drill is always tasks, which is exactly what the destination shows.
 */
const REGION_ROUTE: Record<HomeRegionId, string> = {
  'needs-you': '/work/tasks?view=my-work',
  // A rejected café log is re-entered on the log itself (the same route its rows link to).
  'failed-checks': '/cafe/log',
  // Inbox is the app's mentions/asks surface ("Triage what was directed to you").
  mentions: '/inbox',
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
  /** Leading rows NO arrangement may cut behind its "N more →" remainder (Overview's tile cap).
   *  needs-you's Daily Log flags (#302): their rows link to /ops while the region's drill goes to
   *  the tasks view — cut, a flagged entry would be reachable only through a destination that
   *  cannot show it. They lead the region by construction, so pinning them keeps every hidden row
   *  a task, which IS what the drill destination holds. Absent means 0 (nothing pinned). */
  pinnedCount?: number
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
  // Open needs-attention Daily Log entries (AC-091 propagation, #302) — they LEAD needs-you: an
  // explicitly flagged open entry is the region's strongest claim, and leading keeps the signal
  // inside Overview's 5-row tile cap, where trailing rows would become count-only.
  opsNeedsAttention?: StreamItem[]
  // State of the ops needs-attention read — needs-you's SECOND projection.
  opsState?: StreamBandState
  onRetryOps?: () => void
  /** The viewer's FULL open-task count (all owned, non-Done tasks) — feeds my-work's drill link.
   *  Absent (no link) when the caller has no honest count to report yet. */
  myWorkFullCount?: number
}

export function buildHomeRegions(input: HomeRegionInput): HomeRegion[] {
  const opsNeedsAttention = input.opsNeedsAttention ?? []
  const opsState = input.opsState ?? 'ready'
  const needsYouItems = [...opsNeedsAttention, ...input.overdue, ...input.dueToday, ...input.blocked]
  const taskState = input.taskState ?? 'ready'
  // needs-you reads TWO projections (the shared tasks fetch + the ops flag read). Combined per
  // DIV-G5: the region may claim 'ready' — and a count — only when BOTH succeeded. 'error' wins
  // over 'loading' so a read that has already failed offers its retry rather than a spinner.
  const needsYouState: StreamBandState =
    taskState === 'error' || opsState === 'error' ? 'error'
      : taskState === 'loading' || opsState === 'loading' ? 'loading' : 'ready'
  // The region's retry re-fires EVERY read behind it — a region-level button that retried only
  // one of two projections would "succeed" and still show the other's error. With one read
  // reported, that read's retry is the region's (the shared-tasks shape the parity suite pins).
  const retryNeedsYou = input.onRetryTasks && input.onRetryOps
    ? () => { input.onRetryTasks?.(); input.onRetryOps?.() }
    : input.onRetryTasks ?? input.onRetryOps
  const drillTo = (id: HomeRegionId, count?: number): HomeRegionDrillTo =>
    count != null ? { route: REGION_ROUTE[id], count } : { route: REGION_ROUTE[id] }

  const failedChecksState = input.failedChecksState ?? 'ready'
  const mentionsState = input.mentionsState ?? 'ready'
  // A count exists only where the read behind it SUCCEEDED (DIV-G5). One helper, applied to every
  // region, so no arrangement can grow its own idea of when a number is trustworthy.
  const countOf = (items: StreamItem[], state: StreamBandState) =>
    state === 'ready' ? items.length : null

  return [
    {
      id: 'needs-you', labelKey: 'home.region.needsYou', items: needsYouItems,
      count: countOf(needsYouItems, needsYouState),
      state: needsYouState, onRetry: retryNeedsYou,
      drillTo: drillTo('needs-you'),
      // The flags lead needsYouItems, so pinning exactly their count keeps each of them visible.
      pinnedCount: opsNeedsAttention.length,
    },
    {
      id: 'failed-checks', labelKey: 'home.stream.band.failedChecks', items: input.failedChecks,
      count: countOf(input.failedChecks, failedChecksState), state: failedChecksState,
      onRetry: input.onRetryFailedChecks,
      drillTo: drillTo('failed-checks'),
    },
    {
      id: 'mentions', labelKey: 'home.stream.band.mentions', items: input.mentions,
      count: countOf(input.mentions, mentionsState), state: mentionsState,
      onRetry: input.onRetryMentions,
      drillTo: drillTo('mentions'),
    },
    {
      id: 'my-work', labelKey: 'home.stream.band.myWork', items: input.myWork,
      count: countOf(input.myWork, taskState), state: taskState, onRetry: input.onRetryTasks,
      drillTo: drillTo('my-work', input.myWorkFullCount),
    },
  ]
}
