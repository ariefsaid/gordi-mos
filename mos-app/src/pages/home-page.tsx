// HomePage — the index route (/) replacement for MyWeek (ADR-0019 D2/D3, Task 4.4).
// Home v1 — the default composition behind SHOW_HOME_STACKED=false.
//
// Step 5 (docs/specs/home-proper.spec.md, OD-REDESIGN-18/59/64) recomposed Home into TWO top-level
// regions, rendered in the user's chosen order (default attention-first):
//   - Attention  — <AttentionBrief lanes={lanes}/>: overdue/due-today/failed-checks/mentions, built
//     from the pure selectors in lib/home-attention.ts over the existing tasks/notifications reads
//     + the new loadFailedChecksForViewer adapter. Non-removable (OD-18) — only its position moves.
//   - Personal canvas — the tasks tile, MyWeekPanel, and the Step-4 SignalFeedSection
//     (all reused, none rebuilt — Rule 11).
// The order is per-user (resolveRegionOrder/setRegionOrder, v1 localStorage — RATIFY-1) and is
// ALWAYS emitted via DOM order, never CSS `order` (Rule 9/AC-515). When personal-first, PageHead
// carries a "Needs attention · N" summary linking to #attention-brief so the brief is never lost.
//
// OD-REDESIGN-17 (owner critique "why dashboard AND home"): Home no longer duplicates the Money
// dashboard's revenue/margin KPI tiles. Financial *exceptions* surface via the attention brief;
// routine finance KPIs live on /dashboard, which owns them. The tasks tile is a drill-target
// <Link> — KPITile itself stays presentation-only.
//
// When SHOW_HOME_STACKED is flipped on, `/` renders StackedUnionHome instead; this v1 stays the
// documented default (docs/specs/home-v1.spec.md).
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
import { MyWeekPanel } from '@/components/weekly/my-week-panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { useIsPhone } from '@/shell/use-is-phone'
import { ViewOptionsDisclosure } from '@/shell/view-options-disclosure'
import {
  overdueTasks, dueTodayTasks, unreadMentions, attentionCount, wibToday,
  type AttentionItem, type AttentionLane, type AttentionDirectory,
} from '@/lib/home-attention'
import { resolveRegionOrder, setRegionOrder, type HomeRegionOrder } from '@/lib/home-region-order'
import { AttentionBrief } from '@/components/home/attention-brief'
import { SignalFeedSection } from '@/components/signals/signal-feed-section'
import './home-page.css'

type FetchState = 'loading' | 'ready' | 'error'

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

  // RI-2 (Q2/Rule 8, ratified Option B) — at ≤390px the order toggle folds behind a single
  // compact disclosure so it's never the lead, full-width element ahead of the attention
  // brief; desktop/tablet keep the inline radiogroup unchanged.
  const isPhone = useIsPhone()
  const [orderPanelOpen, setOrderPanelOpen] = useState(false)

  // isMountedRef — shared unmount guard for every retryable loader below (never
  // setState after unmount). The flag is set true in the EFFECT BODY itself, not just
  // at useRef's initial value — StrictMode's dev-only mount→cleanup→remount cycle runs
  // the cleanup (setting it false) and then the setup again, and a setup that doesn't
  // restore `true` leaves every retryable loader believing the page is unmounted
  // forever after that first synthetic cycle (a real, observed regression: every
  // attention lane stuck on its loading skeleton — caught by rendered inspection).
  const isMountedRef = useRef(false)
  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  // ── Tasks (everyone) — the tasks-count tile AND the overdue/due-today attention lanes ──
  // Home retry/projection convergence (convergence-audit 2026-07-21): this ONE fetch is
  // the single projection behind BOTH the overdue and due-today attention lanes — never
  // two independent fetches for the same data. `loadTasks` is retry-safe: `tasksInFlightRef`
  // makes a concurrent call while one is already in flight an idempotent no-op, and
  // `tasksTokenRef` invalidates a stale in-flight response if the viewer identity changes
  // mid-fetch (a fresh load always wins, never a stale write).
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
        // Only the CURRENT request clears the flight flag — a stale/superseded
        // request resolving late must not falsely mark the latest one as idle.
        if (tasksTokenRef.current === token) tasksInFlightRef.current = false
      })
  }, [personId])

  useEffect(() => {
    tasksTokenRef.current += 1 // a personId change (or mount) always supersedes any prior fetch
    tasksInFlightRef.current = false
    loadTasks()
  }, [loadTasks])



  // ── Notifications (mentions lane) — reuses Inbox's own "what asked for me" read (Step 5) ──
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

  // ── Failed checks (café rejected logs, RATIFY-3, Step 5) ──────────────────────
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

  // ── Display directory (Luna J01/J02 decision context) — the SAME shared read the personal
  // canvas already uses (my-tasks-card loads getPeople/getBusinessUnits). Best-effort ENRICHMENT
  // only: it decorates the overdue/due-today rows with the PIC (Responsible) + owning-BU caption,
  // and its absence never blocks or errors a lane (the rows just render without the meta line).
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

  // ── Attention brief lanes (Step 5, spec §2/§4) ─────────────────────────────────
  const today = useMemo(() => wibToday(), [])
  const lanes: AttentionLane[] = useMemo(() => {
    if (!personId) return []
    return [
      // Overdue + due-today share the SAME `loadTasks` reference (the one tasks
      // projection) — retrying either lane refreshes both, never a duplicate fetch.
      { kind: 'overdue', state: taskState, items: taskState === 'ready' ? overdueTasks(tasks, personId, today, locale, directory) : [], onRetry: loadTasks },
      { kind: 'due-today', state: taskState, items: taskState === 'ready' ? dueTodayTasks(tasks, personId, today, locale, directory) : [], onRetry: loadTasks },
      { kind: 'failed-checks', state: failedChecksState, items: failedChecksState === 'ready' ? failedChecks : [], onRetry: loadFailedChecks },
      { kind: 'mentions', state: notificationsState, items: notificationsState === 'ready' ? unreadMentions(notifications) : [], onRetry: loadNotifications },
    ]
  }, [personId, taskState, tasks, today, locale, directory, failedChecksState, failedChecks, notificationsState, notifications, loadTasks, loadFailedChecks, loadNotifications])

  // ── Region order (OD-REDESIGN-18, Step 5) — per-user, default attention-first ──
  const [order, setOrder] = useState<HomeRegionOrder>('attention-first')
  useEffect(() => {
    if (personId) setOrder(resolveRegionOrder(personId))
  }, [personId])

  function handleOrderChange(next: HomeRegionOrder) {
    setOrder(next)
    if (personId) setRegionOrder(personId, next)
  }

  const attentionRegion = <AttentionBrief key="attention" lanes={lanes} />
  const personalCanvasRegion = (
    <section key="personal-canvas" data-testid="personal-canvas" className="home-personal-canvas">
      {/* OD-REDESIGN-17 ("why dashboard AND home"): Home no longer duplicates the Money
          dashboard's revenue/margin KPI tiles. Financial *exceptions* surface via the
          attention brief; routine finance KPIs live on /dashboard, which owns them. */}



      {/* Legacy Weekly Update/Daily Log cards are hidden on Home until their
          successors are real; the MyWeekPanel component itself survives (ADR-0019 D2). */}
      <MyWeekPanel hideLegacyCadenceCards />

      {/* Signal ambient feed (Step 4, Q1/OD-59 — provisional, RATIFY-7): the ambient region
          inside the personal canvas, purely additive (FR-414). */}
      <SignalFeedSection />
    </section>
  )

  const n = attentionCount(lanes)

  const orderLabel = order === 'attention-first' ? t('home.order.attentionFirst') : t('home.order.personalFirst')
  const orderToggle = (
    <ViewTabs
      mode="radiogroup"
      ariaLabel={t('home.order.toggle')}
      tabs={[
        { id: 'attention-first', label: t('home.order.attentionFirst') },
        { id: 'personal-first', label: t('home.order.personalFirst') },
      ]}
      active={order}
      onChange={id => handleOrderChange(id as HomeRegionOrder)}
    />
  )

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
          <a href="#attention-brief" className="home-attention-jump">{t('home.attention.summary', { n })}</a>
        ) : undefined
      }
    >
      {/* e7 TRANSPLANT (e7-views.js:143, ported not re-interpreted): head = personal greeting,
          subtitle = role identity — the warmth the build lost (parity finding R1). Only
          adaptation: a live clock picks the greeting (WIB); e7's static mock froze "morning".
          Falls back to the generic head when unauthenticated (e7 has no such state). */}
      {/* Home order toggle (OD-REDESIGN-18, RATIFY-2) — user-only; not rendered until a viewer
          is resolved (FR-508). Never removes the attention region, only reorders it. At ≤390px
          (RI-2, Q2/Rule 8, ratified Option B) it folds behind a single compact "View options"
          disclosure so it's never the lead, full-width element ahead of the attention brief;
          desktop/tablet keep the inline radiogroup exactly as before. */}
      {personId && (
        isPhone ? (
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
        ) : orderToggle
      )}

      {/* Two top-level regions (Attention · Personal canvas), emitted in DOM in the chosen
          order — never via CSS `order` (FR-511/Rule 9, AC-515). */}
      <div className="home-regions" data-region-order={order}>
        {order === 'attention-first' ? [attentionRegion, personalCanvasRegion] : [personalCanvasRegion, attentionRegion]}
      </div>
    </PageFamilyFrame>
  )
}
