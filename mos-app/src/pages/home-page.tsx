// HomePage — the index route (/). Home renders the SAME consequence-ranked data — needs-you
// (overdue → due today → blocked), failed checks, mentions, my work today — in whichever of the
// three Home layouts (Focused / Overview / List) the viewer has chosen from /profile (OD-V4-9).
// HomePage owns every data read + the ranking/selection logic and hands the result down as the ONE
// shared region model (`buildHomeRegions`, FR-930) — a layout composes those regions, it never
// re-derives them. The OD-18 region-order toggle that used to reorder the old single-stream layout
// was retired (OD-V4-10): List renders the same attention-first order that was already the default.
//
// This is presentation over the EXISTING data contracts: the same tasks/notifications/failed-check
// projections and lane logic (lib/home-attention + lib/home-stream selectors) — no new data path.
// Financial routine KPIs stay on /dashboard (OD-REDESIGN-17); financial *exceptions* would surface in
// the needs-you region via the attention bands.
//
// #191 port note — the Signals feed column is NOT wired here. v4's HomePage renders it through
// `SignalFeedSection`, which is built on the record-collection engine + the full Signals record
// surface (composer, category picker, mention picker, record host) — none of which exist on `dev`
// yet; that whole stack is Signals' own port, #193, not Home's. Pulling it into this PR would mean
// porting #193 inside #191, which breaks the one-surface-per-PR staging this effort runs on
// (`DD-WAY-7`). Home ships with an honest "not available yet" placeholder in the Signals column
// instead of a silently-broken feed or a deleted region — tracked as a design/scope ticket on map
// #150 (`OD-WAY-41`) before this PR merges; wiring the real feed is a follow-up once #193 lands.
import { useState, useEffect, useMemo, useCallback, useRef, useId } from 'react'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { viewerSeesCafe } from '@/shell/destinations'
import { useDocumentTitle } from '@/shell/use-document-title'
import { listTasks } from '@/lib/db/tasks'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { listNotifications } from '@/lib/db/notifications'
import type { NotificationRow } from '@/lib/db/notifications'
import { loadFailedChecksForViewer } from '@/lib/db/home-attention-data'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { unreadMentions, wibToday, type AttentionItem, type AttentionDirectory } from '@/lib/home-attention'
import {
  overdueStreamItems, dueTodayStreamItems, blockedStreamItems, failedCheckStreamItems,
  mentionStreamItems, myWorkStreamItems, openTaskCount, handledTodayCount, type StreamBand,
} from '@/lib/home-stream'
import { dayRotation } from '@/lib/home-day-state'
import { resolveHomeLayout, type HomeLayout } from '@/lib/home-layout'
import { buildHomeRegions } from '@/components/home/home-regions'
import {
  HomeHeadCounts, HomeHeadState, type HomeDayTally,
} from '@/components/home/home-day-header'
import { HomeFocused } from '@/components/home/home-focused'
import { HomeOverview } from '@/components/home/home-overview'
import { HomeList } from '@/components/home/home-list'
import { HelpTip } from '@/components/ui/help-tip'
import './home-page.css'
import '@/components/signals/signal-feed-section.css'

type FetchState = 'loading' | 'ready' | 'error'

const MY_WORK_CAP = 7

// The Signals column placeholder (#191 port note above). Same landmark shape the real
// `SignalFeedSection` uses — a chromeless `<section>` named "Signals" — so the layout arrangements
// (which treat `feed` as an opaque slot) and the surrounding chrome guards need no special case for
// "the feed isn't wired yet". States the gap rather than hiding it (never a silent empty region).
function HomeSignalsPending() {
  const t = useT()
  const titleId = useId()
  return (
    <section className="signal-feed-section" aria-labelledby={titleId}>
      <div className="signal-feed-head">
        <h2 id={titleId} className="signal-feed-label">{t('signals.feed.title')}</h2>
      </div>
      <p className="home-signals-pending">{t('home.signals.pending')}</p>
    </section>
  )
}

export function HomePage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('nav.home') }))
  const { locale } = useI18n()
  const auth = useAuth()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  // WIB day-parts per e7's greeting grammar: pagi <11, siang 11-15, sore 15+ (id conventions).
  const greetingKey = () => {
    const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Jakarta' }).format(new Date()))
    return h < 11 ? 'home.greeting.morning' as const : h < 15 ? 'home.greeting.afternoon' as const : 'home.greeting.evening' as const
  }
  const personId = viewer?.person?.id ?? null
  // SEC-1 route hygiene (FLAG-B / G2): the failed-checks band routes to /cafe/log, so surface it only
  // to cafe-affiliated / ops_lead / admin viewers — the same honest role ceiling as the Café rail entry.
  const seesCafe = useMemo(
    () => viewerSeesCafe((viewer?.roles ?? []).map(r => r.name), viewer?.accessRoles ?? []),
    [viewer])

  // Shared unmount guard for every retryable loader (never setState after unmount). Set true in the
  // effect BODY (not just useRef's initial value) so StrictMode's mount→cleanup→remount cycle doesn't
  // leave loaders believing the page is unmounted forever (a real, observed regression).
  const isMountedRef = useRef(false)
  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  // ── Tasks (everyone) — the ONE projection behind the overdue/due-today/blocked bands AND the
  // my-work band. Never two independent fetches for the same data. Retry-safe: `tasksInFlightRef`
  // makes a concurrent call a no-op; `tasksTokenRef` invalidates a stale response if the viewer
  // changes mid-fetch (a fresh load always wins).
  const [tasks, setTasks] = useState<TaskListRow[]>([])
  const [taskState, setTaskState] = useState<FetchState>('loading')
  const tasksInFlightRef = useRef(false)
  const tasksTokenRef = useRef(0)

  const loadTasks = useCallback(() => {
    if (!personId || tasksInFlightRef.current) return
    tasksInFlightRef.current = true
    const token = ++tasksTokenRef.current
    setTaskState('loading')
    listTasks({})
      .then(rows => {
        if (!isMountedRef.current || tasksTokenRef.current !== token) return
        setTasks(rows)
        setTaskState('ready')
      })
      .catch(() => {
        if (!isMountedRef.current || tasksTokenRef.current !== token) return
        setTaskState('error')
      })
      .finally(() => {
        if (tasksTokenRef.current === token) tasksInFlightRef.current = false
      })
  }, [personId])

  useEffect(() => {
    tasksTokenRef.current += 1 // a personId change (or mount) always supersedes any prior fetch
    tasksInFlightRef.current = false
    loadTasks()
  }, [loadTasks])

  // ── Notifications (mentions band) — reuses Inbox's own "what asked for me" read ──
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [notificationsState, setNotificationsState] = useState<FetchState>('loading')
  const notificationsInFlightRef = useRef(false)
  const notificationsTokenRef = useRef(0)

  const loadNotifications = useCallback(() => {
    if (!personId || notificationsInFlightRef.current) return
    notificationsInFlightRef.current = true
    const token = ++notificationsTokenRef.current
    setNotificationsState('loading')
    listNotifications()
      .then(rows => {
        if (!isMountedRef.current || notificationsTokenRef.current !== token) return
        setNotifications(rows)
        setNotificationsState('ready')
      })
      .catch(() => {
        if (!isMountedRef.current || notificationsTokenRef.current !== token) return
        setNotificationsState('error')
      })
      .finally(() => {
        if (notificationsTokenRef.current === token) notificationsInFlightRef.current = false
      })
  }, [personId])

  useEffect(() => {
    notificationsTokenRef.current += 1
    notificationsInFlightRef.current = false
    loadNotifications()
  }, [loadNotifications])

  // ── Failed checks (café rejected logs, RATIFY-3) ──────────────────────────────
  const [failedChecks, setFailedChecks] = useState<AttentionItem[]>([])
  const [failedChecksState, setFailedChecksState] = useState<FetchState>('loading')
  const failedChecksInFlightRef = useRef(false)
  const failedChecksTokenRef = useRef(0)

  const loadFailedChecks = useCallback(() => {
    if (!personId || failedChecksInFlightRef.current) return
    // Non-cafe viewers (finance/HR/…) get no failed-checks band at all — an empty ready state, never a
    // /cafe/log deep-link they cannot act on (SEC-1 route hygiene). RLS still owns row visibility.
    if (!seesCafe) { setFailedChecks([]); setFailedChecksState('ready'); return }
    failedChecksInFlightRef.current = true
    const token = ++failedChecksTokenRef.current
    setFailedChecksState('loading')
    loadFailedChecksForViewer()
      .then(items => {
        if (!isMountedRef.current || failedChecksTokenRef.current !== token) return
        setFailedChecks(items)
        setFailedChecksState('ready')
      })
      .catch(() => {
        if (!isMountedRef.current || failedChecksTokenRef.current !== token) return
        setFailedChecksState('error')
      })
      .finally(() => {
        if (failedChecksTokenRef.current === token) failedChecksInFlightRef.current = false
      })
  }, [personId, seesCafe])

  useEffect(() => {
    failedChecksTokenRef.current += 1
    failedChecksInFlightRef.current = false
    loadFailedChecks()
  }, [loadFailedChecks])

  // ── Display directory (Luna J01/J02 decision context) — the SAME shared read the app already
  // uses. Best-effort ENRICHMENT only: decorates task rows with the PIC (Responsible) + owning-BU
  // caption; its absence never blocks or errors a band (rows just render without the meta line).
  const [directory, setDirectory] = useState<AttentionDirectory>({})
  useEffect(() => {
    if (!personId) return
    let live = true
    Promise.all([getPeople(), getBusinessUnits()])
      .then(([people, bus]) => {
        if (!live || !isMountedRef.current) return
        setDirectory({
          people: new Map(people.map(p => [p.id, p.full_name])),
          businessUnits: new Map(bus.map(b => [b.id, b.name])),
        })
      })
      .catch(() => { /* enrichment is optional — a failed directory read leaves rows undecorated */ })
    return () => { live = false }
  }, [personId])

  // ── Ranked stream items (owner redirect) ────────────────────────────────────
  const today = useMemo(() => wibToday(), [])
  const ready = taskState === 'ready'

  // The three task-derived rank bands, in order. All read the SAME `loadTasks` projection, so
  // their loading/error is a single consolidated grammar, never a duplicate fetch/spinner/error.
  const overdue = useMemo(
    () => (ready && personId ? overdueStreamItems(tasks, personId, today, locale, directory) : []),
    [ready, personId, tasks, today, locale, directory])
  const dueToday = useMemo(
    () => (ready && personId ? dueTodayStreamItems(tasks, personId, today, locale, directory) : []),
    [ready, personId, tasks, today, locale, directory])
  const blocked = useMemo(
    () => (ready && personId ? blockedStreamItems(tasks, personId, today, locale, directory) : []),
    [ready, personId, tasks, today, locale, directory])

  // The my-work band = owned open work NOT already surfaced in a task attention band (overdue ∪
  // due-today ∪ blocked ids), off-track first, capped. Shares the one tasks projection.
  const myWork = useMemo(() => {
    if (!ready || !personId) return []
    const excludeIds = new Set<string>([...overdue, ...dueToday, ...blocked].map(i => i.id))
    return myWorkStreamItems(tasks, personId, today, locale, directory, excludeIds).slice(0, MY_WORK_CAP)
  }, [ready, personId, tasks, today, locale, directory, overdue, dueToday, blocked])

  // Failed-checks + mentions keep their OWN independent fetch state (separate DALs).
  const failedChecksBand: StreamBand = useMemo(() => ({
    kind: 'failed-checks', state: failedChecksState,
    items: failedChecksState === 'ready' ? failedCheckStreamItems(failedChecks) : [],
    onRetry: loadFailedChecks,
  }), [failedChecksState, failedChecks, loadFailedChecks])
  const mentionsBand: StreamBand = useMemo(() => ({
    kind: 'mentions', state: notificationsState,
    items: notificationsState === 'ready' ? mentionStreamItems(unreadMentions(notifications)) : [],
    onRetry: loadNotifications,
  }), [notificationsState, notifications, loadNotifications])

  // ONE muted meta line beside the greeting (the shared workspace-head `.ch-meta-line` grammar):
  // the viewer's role identity — which is what makes a cross-BU brief legible as the stacked union
  // of the roles they hold. This replaces the separate full-width subtitle line, whose only content
  // was that same role string; the decorative "Your week at a glance" fallback for a role-less
  // viewer is dropped rather than restyled (it stated nothing).
  const roleLabel = viewer && viewer.roles.length > 0
    ? viewer.roles[0].name + (viewer.roles.length > 1 ? ` +${viewer.roles.length - 1}` : '')
    : null

  // H10 fix (design audit, 2026-07-28): the "?" HelpTip always rides beside the role meta line
  // (never conditional on it) — it explains the attention bands regardless of whether a role
  // label happens to be present this render.
  const headMeta = (
    <>
      {roleLabel && (
        <span className="ch-meta-line home-head-meta">
          {roleLabel}
        </span>
      )}
      <HelpTip label={t('home.help')} />
    </>
  )

  // ── Home layout preference (OD-V4-9) — read on mount and on person change so a reload resolves
  // the real stored value rather than flashing the Focused default (FR-921/924).
  const [layout, setLayout] = useState<HomeLayout>('focused')
  useEffect(() => {
    if (personId) setLayout(resolveHomeLayout(personId))
  }, [personId])

  // The viewer's FULL open-task count (all owned, non-Done tasks — not just the capped my-work
  // items rendered in the region) — feeds the restored "My open tasks · N →" drill link.
  const openCount = ready && personId ? openTaskCount(tasks, personId) : 0

  // The ONE region model shared by all three arrangements (FR-930) — a layout chooses how to
  // present these regions, never which of them exist (NFR-924 parity). needs-you and my-work share
  // the ONE tasks-projection state + retry (DIV-G5); failed-checks/mentions carry their own.
  const regions = useMemo(
    () => buildHomeRegions({
      overdue, dueToday, blocked, myWork,
      failedChecks: failedChecksBand.items, mentions: mentionsBand.items,
      taskState, onRetryTasks: loadTasks,
      failedChecksState: failedChecksBand.state, onRetryFailedChecks: loadFailedChecks,
      mentionsState: mentionsBand.state, onRetryMentions: loadNotifications,
      myWorkFullCount: ready ? openCount : undefined,
    }),
    [
      overdue, dueToday, blocked, myWork, failedChecksBand, mentionsBand,
      taskState, loadTasks, loadFailedChecks, loadNotifications, ready, openCount,
    ],
  )

  // ── The day's tally behind the header (mockup home-priority-2026-07-28 `.hdr`) ───────────────
  // NO new data read: `left` is the sum of the SAME region counts rendered a few pixels below it
  // (so the number reconciles with what the viewer can see), and `done` comes off the tasks
  // projection Home already fetched.
  //
  // Null — never a partial total — the moment ANY region count is null, i.e. any read behind it
  // has not succeeded (DIV-G5). A header that adds up the reads that happened to land would state
  // a figure the viewer cannot trace, which is exactly the defect the region counts were fixed
  // for: absent, not zero.
  const tally = useMemo<HomeDayTally | null>(() => {
    if (!personId) return null
    let left = 0
    for (const region of regions) {
      if (region.count === null) return null
      left += region.count
    }
    return { done: handledTodayCount(tasks, personId, today), left }
  }, [personId, regions, tasks, today])

  return (
    <PageFamilyFrame
      family="workspace"
      surfaceWash
      title={viewer ? t(greetingKey(), { name: viewer.person.full_name.split(' ')[0] }) : t('home.title')}
      // No `jobSentence`: this head carries a `statusRow`, and PageHead renders one or the other,
      // never both. The live state line answers "what is this page for right now" better than the
      // static registry sentence, which on Home only re-asked the question. Passing a sentence
      // that is guaranteed to be discarded is a comment pretending to be code.
      meta={headMeta}
      // `N handled - N left`, right-aligned on the title row; the state line + progress track on
      // the row below it. Both live INSIDE the one shared header block, so every arrangement
      // inherits the identical header (it sits above them).
      action={<HomeHeadCounts tally={tally} />}
      statusRow={<HomeHeadState tally={tally} rotation={dayRotation(today)} />}
    >
      {/* `.home-frame` exists for ONE reason: it is the inline-size container every arrangement's
          responsive branch is measured against (FR-932 / NFR-923 / DESIGN.md § Layout → The
          Container-Query Rule). The person's chosen Home layout (OD-V4-9) — Focused (default),
          Overview or List. All three render the SAME regions + the SAME feed slot; only the
          arrangement differs (NFR-924). */}
      <div className="home-frame">{(() => {
        const feed = <HomeSignalsPending />
        if (layout === 'overview') return <HomeOverview regions={regions} feed={feed} />
        if (layout === 'list') return <HomeList regions={regions} feed={feed} />
        return <HomeFocused regions={regions} feed={feed} />
      })()}</div>
    </PageFamilyFrame>
  )
}
