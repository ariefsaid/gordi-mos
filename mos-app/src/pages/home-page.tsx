// HomePage — the index route (/) replacement for MyWeek (ADR-0019 D2/D3, Task 4.4).
// Home v1 — the default composition behind SHOW_HOME_STACKED=false. Slot composition: each slot =
// one read-model/DAL query + one existing kit primitive. Finance KPI row (revenue + margin) is
// role-guarded — a member never issues the reporting query, so the row is simply absent (RLS-empty
// handling, never a misleading zero). Tasks (+ ops, flag-gated) row renders for everyone. MyWeekPanel
// renders below (demoted from route, ADR-0019 D2 "component survives"). Every tile is a drill-target
// <Link> — KPITile itself stays presentation-only (never learns router or "revenue").
//
// When SHOW_HOME_STACKED is flipped on, `/` renders StackedUnionHome instead; this v1 stays the
// documented default (docs/specs/home-v1.spec.md). The revenue/margin fetch+derive lives in the shared
// useCompanyFinanceKpis hook so the stacked money-position section renders the SAME tiles (reuse).
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { SHOW_DAILY_LOG } from '@/config/features'
import { formatIDRCompact } from '@/lib/sales-dashboard'
import { useCompanyFinanceKpis } from '@/lib/use-company-finance-kpis'
import { listTasks } from '@/lib/db/tasks'
import { getTodayOpsSummary } from '@/lib/db/ops-log'
import type { TodayOpsSummary } from '@/lib/db/ops-log'
import { KPITile } from '@/components/dashboard/kpi-tile'
import { FreshnessLabel } from '@/components/dashboard/freshness-label'
import { MyWeekPanel } from '@/components/weekly/my-week-panel'
import { openTaskCount } from '@/lib/home-kpis'
import './home-page.css'

type FetchState = 'loading' | 'ready' | 'error'

export function HomePage() {
  useDocumentTitle('Home — Gordi MOS')
  const t = useT()
  const auth = useAuth()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const personId = viewer?.person?.id ?? null
  const accessRoles = viewer?.accessRoles ?? []
  const canSeeFinance = accessRoles.includes('finance') || accessRoles.includes('admin')

  // ── Finance reporting fetch (role-guarded — a member never issues this query) ──
  const fin = useCompanyFinanceKpis(canSeeFinance)
  const { revenueWindow, revenueDelta, revenueState, marginDisplay, marginState, snapshotAsOf } = fin

  // ── Tasks count (everyone) ──────────────────────────────────────────────────
  const [taskCount, setTaskCount] = useState(0)
  const [taskState, setTaskState] = useState<FetchState>('loading')

  useEffect(() => {
    if (!personId) return
    let cancelled = false
    setTaskState('loading')
    listTasks({})
      .then(tasks => {
        if (cancelled) return
        setTaskCount(openTaskCount(tasks, personId))
        setTaskState('ready')
      })
      .catch(() => {
        if (!cancelled) setTaskState('error')
      })
    return () => { cancelled = true }
  }, [personId])

  // ── Ops count (everyone, flag-gated) ────────────────────────────────────────
  const now = useMemo(() => new Date(), [])
  const [opsSummary, setOpsSummary] = useState<TodayOpsSummary>({ count: 0, needsAttention: false })
  const [opsState, setOpsState] = useState<FetchState>('loading')

  const loadOps = useCallback(() => {
    if (!SHOW_DAILY_LOG) return
    let cancelled = false
    setOpsState('loading')
    getTodayOpsSummary(now)
      .then(summary => {
        if (cancelled) return
        setOpsSummary(summary)
        setOpsState('ready')
      })
      .catch(() => {
        if (!cancelled) setOpsState('error')
      })
    return () => { cancelled = true }
  }, [now])

  useEffect(() => {
    const cancel = loadOps()
    return cancel
  }, [loadOps])

  return (
    <PageFrame surfaceWash>
      <PageHead title={t('home.title')} subtitle={t('home.subtitle')} />

      {/* Finance row — role-guarded; a member never issues the reporting fetch, so
          this row is simply absent (never a misleading zero). */}
      {canSeeFinance && (
        <div className="home-kpi-grid" role="group" aria-label="Sales KPIs">
          <Link to="/dashboard" className="home-kpi-link">
            <KPITile
              label={t('home.kpi.revenue')}
              value={revenueState === 'ready' && revenueWindow ? formatIDRCompact(revenueWindow.current) : '—'}
              delta={
                revenueState === 'ready' && revenueDelta
                  ? { text: revenueDelta.text, tone: revenueDelta.tone }
                  : undefined
              }
              state={revenueState === 'loading' ? 'loading' : 'ready'}
            />
          </Link>
          <Link to="/dashboard" className="home-kpi-link">
            <KPITile
              label={t('home.kpi.margin')}
              value={marginState === 'ready' && marginDisplay ? marginDisplay.value : '—'}
              delta={
                marginState === 'ready' && marginDisplay
                  ? { text: marginDisplay.delta.text, tone: marginDisplay.delta.tone }
                  : undefined
              }
              sub={marginState === 'ready' && marginDisplay ? marginDisplay.pctSub : undefined}
              state={marginState === 'loading' ? 'loading' : 'ready'}
            />
          </Link>
        </div>
      )}

      {/* Everyone row — tasks (always) + ops (flag-gated). */}
      <div className="home-kpi-grid">
        <Link to="/tasks" className="home-kpi-link">
          <KPITile
            label={t('home.kpi.tasks')}
            value={taskState === 'ready' ? String(taskCount) : '—'}
            state={taskState === 'loading' ? 'loading' : 'ready'}
          />
        </Link>
        {SHOW_DAILY_LOG && (
          <Link to="/ops" className="home-kpi-link">
            <KPITile
              label={t('home.kpi.ops')}
              value={opsState === 'ready' ? String(opsSummary.count) : '—'}
              state={opsState === 'loading' ? 'loading' : 'ready'}
            />
          </Link>
        )}
      </div>

      {snapshotAsOf && <FreshnessLabel asOf={snapshotAsOf} />}

      <MyWeekPanel />
    </PageFrame>
  )
}
