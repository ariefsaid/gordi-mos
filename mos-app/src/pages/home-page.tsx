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
import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { listTasks } from '@/lib/db/tasks'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { listNotifications } from '@/lib/db/notifications'
import type { NotificationRow } from '@/lib/db/notifications'
import { loadFailedChecksForViewer } from '@/lib/db/home-attention-data'
import { KPITile } from '@/components/dashboard/kpi-tile'
import { MyWeekPanel } from '@/components/weekly/my-week-panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { useIsPhone } from '@/shell/use-is-phone'
import { ViewOptionsDisclosure } from '@/shell/view-options-disclosure'
import { openTaskCount } from '@/lib/home-kpis'
import {
  overdueTasks, dueTodayTasks, unreadMentions, attentionCount, wibToday,
  type AttentionItem, type AttentionLane,
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

  // ── Tasks (everyone) — the tasks-count tile AND the overdue/due-today attention lanes ──
  const [tasks, setTasks] = useState<TaskListRow[]>([])
  const [taskState, setTaskState] = useState<FetchState>('loading')

  useEffect(() => {
    if (!personId) return
    let cancelled = false
    setTaskState('loading')
    listTasks({})
      .then(rows => {
        if (cancelled) return
        setTasks(rows)
        setTaskState('ready')
      })
      .catch(() => {
        if (!cancelled) setTaskState('error')
      })
    return () => { cancelled = true }
  }, [personId])

  const taskCount = personId ? openTaskCount(tasks, personId) : 0

  // ── Notifications (mentions lane) — reuses Inbox's own "what asked for me" read (Step 5) ──
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [notificationsState, setNotificationsState] = useState<FetchState>('loading')

  useEffect(() => {
    if (!personId) return
    let cancelled = false
    setNotificationsState('loading')
    listNotifications()
      .then(rows => {
        if (cancelled) return
        setNotifications(rows)
        setNotificationsState('ready')
      })
      .catch(() => {
        if (!cancelled) setNotificationsState('error')
      })
    return () => { cancelled = true }
  }, [personId])

  // ── Failed checks (café rejected logs, RATIFY-3, Step 5) ──────────────────────
  const [failedChecks, setFailedChecks] = useState<AttentionItem[]>([])
  const [failedChecksState, setFailedChecksState] = useState<FetchState>('loading')

  useEffect(() => {
    if (!personId) return
    let cancelled = false
    setFailedChecksState('loading')
    loadFailedChecksForViewer()
      .then(items => {
        if (cancelled) return
        setFailedChecks(items)
        setFailedChecksState('ready')
      })
      .catch(() => {
        if (!cancelled) setFailedChecksState('error')
      })
    return () => { cancelled = true }
  }, [personId])

  // ── Attention brief lanes (Step 5, spec §2/§4) ─────────────────────────────────
  const today = useMemo(() => wibToday(), [])
  const lanes: AttentionLane[] = useMemo(() => {
    if (!personId) return []
    return [
      { kind: 'overdue', state: taskState, items: taskState === 'ready' ? overdueTasks(tasks, personId, today, locale) : [] },
      { kind: 'due-today', state: taskState, items: taskState === 'ready' ? dueTodayTasks(tasks, personId, today, locale) : [] },
      { kind: 'failed-checks', state: failedChecksState, items: failedChecksState === 'ready' ? failedChecks : [] },
      { kind: 'mentions', state: notificationsState, items: notificationsState === 'ready' ? unreadMentions(notifications) : [] },
    ]
  }, [personId, taskState, tasks, today, locale, failedChecksState, failedChecks, notificationsState, notifications])

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

      {/* Everyone row — tasks (always). */}
      <div className="home-kpi-grid">
        <Link to="/tasks" className="home-kpi-link">
          <KPITile
            label={t('home.kpi.tasks')}
            value={taskState === 'ready' ? String(taskCount) : '—'}
            state={taskState === 'loading' ? 'loading' : 'ready'}
          />
        </Link>
      </div>

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
    <PageFrame surfaceWash>
      {/* e7 TRANSPLANT (e7-views.js:143, ported not re-interpreted): head = personal greeting,
          subtitle = role identity — the warmth the build lost (parity finding R1). Only
          adaptation: a live clock picks the greeting (WIB); e7's static mock froze "morning".
          Falls back to the generic head when unauthenticated (e7 has no such state). */}
      <PageHead
        title={viewer ? t(greetingKey(), { name: viewer.person.full_name.split(' ')[0] }) : t('home.title')}
        subtitle={viewer && viewer.roles.length > 0
          ? viewer.roles[0].name + (viewer.roles.length > 1 ? ` +${viewer.roles.length - 1}` : '')
          : t('home.subtitle')}
        meta={
          order === 'personal-first' && personId ? (
            <a href="#attention-brief" className="home-attention-jump">{t('home.attention.summary', { n })}</a>
          ) : undefined
        }
      />

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
    </PageFrame>
  )
}
