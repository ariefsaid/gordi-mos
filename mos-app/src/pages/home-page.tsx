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
  mentionStreamItems, myWorkStreamItems, openTaskCount, signalStreamItems, isAttentionSignal,
  type StreamBand, type StreamBandState,
} from '@/lib/home-stream'
import { resolveRegionOrder, type HomeRegionOrder } from '@/lib/home-region-order'
import { HomeStream } from '@/components/home/home-stream'
import { SignalFeedSection } from '@/components/signals/signal-feed-section'
import { useRecordCollection } from '@/lib/record-collection/use-record-collection'
import { HelpTip } from '@/components/ui/help-tip'
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

  // ── The "Needs attention · N" head summary (OD-REDESIGN-18) ────────────────────────────────
  // PRODUCT.md principle 4 — a figure is traceable or visibly absent:
  //  (1) N counts the REAL attention-worthy Signal total, not `signalsBand.items` — that array is
  //      sliced to SIGNAL_BAND_CAP for display, so a viewer with 9 urgent Signals was being told
  //      "6". A count derived from a display cap is the same defect class as Café Log's band
  //      deriving "made so far" from unsaved form state (DD-7).
  //  (2) It renders only once EVERY contributing read is ready. A partial sum is a confident wrong
  //      number, which is worse than no number, so mid-load the summary is absent rather than low.
  const attentionSignalCount = useMemo(
    () => allSignals.filter(isAttentionSignal).length, [allSignals])
  const attentionCountTraceable =
    taskState === 'ready' && toBandState(signalController.state.status) === 'ready' &&
    failedChecksState === 'ready' && notificationsState === 'ready'
  const attentionCountN = attentionSignalCount + overdue.length + dueToday.length + blocked.length +
    failedChecksBand.items.length + mentionsBand.items.length

  // ── Order preference (OD-18) — per-user, default attention-first. The control that SETS this
  // now lives in Personal Profile (OD-18 completion, 2026-07-27); Home only reads it (on mount/
  // personId change, which covers both navigation back from Profile and a full reload) and owes
  // the required "Needs attention · N" summary + jump target below when personal-first leads. ──
  const [order, setOrder] = useState<HomeRegionOrder>('attention-first')
  useEffect(() => {
    if (personId) setOrder(resolveRegionOrder(personId))
  }, [personId])

  // ONE muted meta line beside the greeting (the shared workspace-head `.ch-meta-line` grammar):
  // the viewer's role identity — which is what makes a cross-BU brief legible as the stacked union
  // of the roles they hold — plus, when the personal canvas leads, the required "Needs attention · N"
  // summary + jump target (OD-REDESIGN-18). This replaces the separate full-width subtitle line,
  // whose only content was that same role string; the decorative "Your week at a glance" fallback
  // for a role-less viewer is dropped rather than restyled (it stated nothing).
  const roleLabel = viewer && viewer.roles.length > 0
    ? viewer.roles[0].name + (viewer.roles.length > 1 ? ` +${viewer.roles.length - 1}` : '')
    : null
  const showAttentionSummary = order === 'personal-first' && personId != null && attentionCountTraceable

  // g-home audit P3: the "Needs attention · N" figure is live — N can change after the initial
  // settle (e.g. sharing a Signal from Home retriggers the shared Signals read via the
  // signalPostCount effect above, which can move attentionSignalCount and so N; a band's own
  // "Retry" can do the same for the other four contributors). A sighted viewer sees the digit
  // move; a screen-reader viewer got nothing (0 live regions measured on Home). This mirrors the
  // sr-only aria-live="polite" role="status" pattern already used on Task detail / Objectives.
  // Effect-driven (not a raw render bind) so it announces once per SETTLED value — never the
  // mid-load partial states attentionCountTraceable already suppresses visually.
  const [attentionAnnouncement, setAttentionAnnouncement] = useState('')
  useEffect(() => {
    if (showAttentionSummary) setAttentionAnnouncement(t('home.attention.summary', { n: attentionCountN }))
  }, [showAttentionSummary, attentionCountN, t])

  // H10 fix (design audit, 2026-07-28): the "?" HelpTip always rides beside the role/attention
  // meta line (never conditional on it) — it explains the attention bands + ordering regardless
  // of whether a role label or the personal-first summary happens to be present this render.
  const headMeta = (
    <>
      {(roleLabel || showAttentionSummary) && (
        <span className="ch-meta-line home-head-meta">
          {roleLabel}
          {roleLabel && showAttentionSummary && <span aria-hidden="true"> · </span>}
          {showAttentionSummary && (
            <a href="#attention-brief" className="home-attention-jump">{t('home.attention.summary', { n: attentionCountN })}</a>
          )}
        </span>
      )}
      <HelpTip label={t('home.help')} />
    </>
  )

  return (
    <PageFamilyFrame
      family="workspace"
      surfaceWash
      title={viewer ? t(greetingKey(), { name: viewer.person.full_name.split(' ')[0] }) : t('home.title')}
      jobSentence={t('job.home')}
      meta={headMeta}
    >
      <div className="home-visually-hidden" aria-live="polite" role="status">{attentionAnnouncement}</div>

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
