// HomePage — the index route (/). Owner redirect 2026-07-22 ("Home = ONE consequence-ranked
// stream, be braver than E7"): Home is a SINGLE prioritised flow ranked ACROSS record types —
// overdue → due today → blocked → failed-checks → mentions → today's open work — rendered as one
// column of uniform record rows with reason chips and quiet band dividers (components/home/HomeStream).
// E7 is the FLOOR (chromeless rows, calm rhythm); this beats it on one-glance "what do I do next".
//
// The stream has two ordered GROUPS (attention bands + the my-work band). The OD-18 order preference
// reorders those two groups (attention-first / my-work-first) — never removing a band.
//
// A12 RE-EXPRESSED (OD-REDESIGN-84.1 / Luna P0-1 — RATIFY-BEFORE-MERGE): the attention-vs-ambient
// boundary runs THROUGH Signals by attention level, not around the record type. Attention-worthy
// Signals (Urgent / Needs attention) ARE attention, so they LEAD the stream as band 0 (E7 puts the
// exception first); only FYI Signals are ambient — the explicitly-labelled SignalFeedSection tail
// below the stream. HomePage owns the ONE shared signal read and splits it (no second loader).
//
// This is presentation over the EXISTING data contracts: the same tasks/notifications/failed-check
// projections and lane logic (lib/home-attention + lib/home-stream selectors) — no new data path.
// Financial routine KPIs stay on /dashboard (OD-REDESIGN-17); financial *exceptions* would surface in
// the stream via the attention bands.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { listTasks } from '@/lib/db/tasks'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { listNotifications } from '@/lib/db/notifications'
import type { NotificationRow } from '@/lib/db/notifications'
import { loadFailedChecksForViewer } from '@/lib/db/home-attention-data'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { useIsPhone } from '@/shell/use-is-phone'
import { ViewOptionsDisclosure } from '@/shell/view-options-disclosure'
import { unreadMentions, wibToday, type AttentionItem, type AttentionDirectory } from '@/lib/home-attention'
import {
  overdueStreamItems, dueTodayStreamItems, blockedStreamItems, failedCheckStreamItems,
  mentionStreamItems, myWorkStreamItems, openTaskCount, signalStreamItems, isAttentionSignal,
  type StreamBand, type StreamBandState,
} from '@/lib/home-stream'
import { resolveRegionOrder, setRegionOrder, type HomeRegionOrder } from '@/lib/home-region-order'
import { HomeStream } from '@/components/home/home-stream'
import { SignalFeedSection } from '@/components/signals/signal-feed-section'
import { useRecordCollection } from '@/lib/record-collection/use-record-collection'
import { useSignalComposer } from '@/shell/signal-composer-host'
import {
  signalCollectionDescriptor, SIGNAL_COLLECTION_NEUTRAL_QUERY, type SignalCollectionQuery,
} from '@/components/signals/signal-collection-adapter'
import './home-page.css'

type FetchState = 'loading' | 'ready' | 'error'

// The ONE Home signal read (FR-V3-013 — no second Signal loader): the shared collection descriptor
// in fixed mode with a non-retracted Feed query. HomePage splits the result — attention-worthy
// (Urgent / Needs attention) lead the stream as band 0; FYI stay the ambient SignalFeedSection tail.
const HOME_FEED_QUERY: SignalCollectionQuery = {
  ...SIGNAL_COLLECTION_NEUTRAL_QUERY,
  layout: 'feed',
  showRetracted: false,
  savedViewId: null,
}

// CollectionStatus → the stream band's 3-state grammar (empty/filtered/permission all "resolved").
function toBandState(status: string): StreamBandState {
  if (status === 'loading') return 'loading'
  if (status === 'error') return 'error'
  return 'ready'
}

const SIGNAL_BAND_CAP = 6

const MY_WORK_CAP = 7

// Compact, right-aligned order preference (OD-18) — the sticky ViewTabs strip has left Home. It
// stays a radiogroup (RI-1) so the a11y contract is unchanged; it reorders the stream's two groups.
function OrderToggle({ order, onChange, label }: {
  order: HomeRegionOrder; onChange: (next: HomeRegionOrder) => void; label: string
}) {
  const t = useT()
  const options: { id: HomeRegionOrder; label: string }[] = [
    { id: 'attention-first', label: t('home.order.attentionFirst') },
    { id: 'personal-first', label: t('home.order.personalFirst') },
  ]
  return (
    <div role="radiogroup" aria-label={label} className="home-order-seg">
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          role="radio"
          aria-checked={order === opt.id}
          className={`home-order-seg-opt${order === opt.id ? ' is-active' : ''}`}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function HomePage() {
  useDocumentTitle('Home — Gordi MOS')
  const t = useT()
  const { locale } = useI18n()
  const auth = useAuth()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  // WIB day-parts per e7's greeting grammar: pagi <11, siang 11-15, sore 15+ (id conventions).
  const greetingKey = () => {
    const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Jakarta' }).format(new Date()))
    return h < 11 ? 'home.greeting.morning' as const : h < 15 ? 'home.greeting.afternoon' as const : 'home.greeting.evening' as const
  }
  const personId = viewer?.person?.id ?? null

  // At ≤390px the order toggle folds behind a single compact disclosure so it's never the lead,
  // full-width element ahead of the stream; desktop/tablet keep the inline radiogroup (RI-2).
  const isPhone = useIsPhone()
  const [orderPanelOpen, setOrderPanelOpen] = useState(false)

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
  }, [personId])

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

  // The three task-derived rank bands, in order. All read the SAME `loadTasks` projection — so their
  // loading/error is one consolidated grammar in HomeStream, never a duplicate fetch/spinner/error.
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

  // ── Signals (the ONE shared read) — split attention-worthy → band 0, FYI → ambient tail ──
  const signalController = useRecordCollection({
    descriptor: signalCollectionDescriptor,
    urlMode: 'fixed',
    fixedQuery: HOME_FEED_QUERY,
    viewerId: null,
    accessRoles: [],
  })
  const { postCount: signalPostCount } = useSignalComposer()
  const signalRetry = signalController.retry
  // Reload after every successful Share so a freshly posted Signal appears without a manual refresh
  // (AC-430 / FR-414) — the effect the ambient section used to own now lives with the lifted loader.
  useEffect(() => {
    if (signalPostCount > 0) signalRetry()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalPostCount])

  const signalData = signalController.state.data
  const signalProjection = signalController.state.projection
  const allSignals = useMemo(
    () => (signalProjection ? [...signalProjection.visibleRecords] : []),
    [signalProjection])
  const ambientSignals = useMemo(() => allSignals.filter(s => !isAttentionSignal(s)), [allSignals])
  const signalsBand: StreamBand = useMemo(() => ({
    kind: 'signals',
    state: toBandState(signalController.state.status),
    items: signalStreamItems(allSignals, {
      authors: signalData?.context.authorNamesById ?? new Map(),
      teams: signalData?.context.teamNamesById ?? new Map(),
    }).slice(0, SIGNAL_BAND_CAP),
    onRetry: signalRetry,
  }), [signalController.state.status, allSignals, signalData, signalRetry])

  const openCount = ready && personId ? openTaskCount(tasks, personId) : 0
  const attentionCountN = signalsBand.items.length + overdue.length + dueToday.length + blocked.length +
    failedChecksBand.items.length + mentionsBand.items.length

  // ── Order preference (OD-18) — per-user, default attention-first ──
  const [order, setOrder] = useState<HomeRegionOrder>('attention-first')
  useEffect(() => {
    if (personId) setOrder(resolveRegionOrder(personId))
  }, [personId])

  function handleOrderChange(next: HomeRegionOrder) {
    setOrder(next)
    if (personId) setRegionOrder(personId, next)
  }

  const orderLabel = order === 'attention-first' ? t('home.order.attentionFirst') : t('home.order.personalFirst')
  const orderToggle = <OrderToggle order={order} onChange={handleOrderChange} label={t('home.order.toggle')} />

  return (
    <PageFamilyFrame
      family="workspace"
      surfaceWash
      title={viewer ? t(greetingKey(), { name: viewer.person.full_name.split(' ')[0] }) : t('home.title')}
      subtitle={viewer && viewer.roles.length > 0
        ? viewer.roles[0].name + (viewer.roles.length > 1 ? ` +${viewer.roles.length - 1}` : '')
        : t('home.subtitle')}
      jobSentence={t('job.home')}
      meta={
        order === 'personal-first' && personId ? (
          <a href="#attention-brief" className="home-attention-jump">{t('home.attention.summary', { n: attentionCountN })}</a>
        ) : undefined
      }
    >
      {/* e7 head transplant: greeting + role identity (the warmth the build had lost). The order
          preference (OD-18) is a compact right-aligned control — never rendered until a viewer is
          resolved. At ≤390px it folds behind a compact "View options" disclosure so it's never the
          lead, full-width element ahead of the stream. */}
      {personId && (
        <div className="home-stream-toolbar">
          {isPhone ? (
            <ViewOptionsDisclosure
              open={orderPanelOpen}
              onToggle={() => setOrderPanelOpen(open => !open)}
              label={t('home.order.viewOptions')}
              summary={orderLabel}
              panelId="home-order-panel"
              className="home-order-disclosure"
              triggerClassName="home-order-trigger"
              summaryClassName="home-order-summary"
              chevronClassName="home-order-chevron"
              panelClassName="home-order-panel"
            >
              {orderToggle}
            </ViewOptionsDisclosure>
          ) : orderToggle}
        </div>
      )}

      {/* THE STREAM — one consequence-ranked flow; the two groups reorder per `order`. */}
      <HomeStream
        taskState={taskState}
        onRetryTasks={loadTasks}
        overdue={overdue}
        dueToday={dueToday}
        blocked={blocked}
        myWork={myWork}
        openCount={openCount}
        signals={signalsBand}
        failedChecks={failedChecksBand}
        mentions={mentionsBand}
        order={order}
        attentionAnchorId="attention-brief"
      />

      {/* Ambient tail (A12 RE-EXPRESSED, OD-84.1 / Luna P0-1): only FYI Signals are ambient here —
          the attention-worthy ones lead the stream as band 0 above. Same row grammar, composer + link.
          Presentational: HomePage owns the ONE shared signal read and passes the FYI split down. */}
      <SignalFeedSection
        signals={ambientSignals}
        authorNamesById={signalData?.context.authorNamesById ?? new Map()}
        teamNamesById={signalData?.context.teamNamesById ?? new Map()}
        loading={signalController.state.status === 'loading'}
        error={signalController.state.status === 'error'}
        onReload={signalRetry}
      />
    </PageFamilyFrame>
  )
}
