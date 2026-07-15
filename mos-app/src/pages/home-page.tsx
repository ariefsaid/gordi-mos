// HomePage — the index route (/) replacement for MyWeek (ADR-0019 D2/D3, Task 4.4).
// Home v1 — the default composition behind SHOW_HOME_STACKED=false. Slot composition: each slot =
// one read-model/DAL query + one existing kit primitive. Finance KPI row (revenue + margin) is
// role-guarded — a member never issues the reporting query, so the row is simply absent (RLS-empty
// handling, never a misleading zero). Tasks row renders for everyone. Legacy cadence cards stay
// hidden on Home until their successors are real; MyWeekPanel still supplies the personal task card.
// renders below (demoted from route, ADR-0019 D2 "component survives"). Every tile is a drill-target
// <Link> — KPITile itself stays presentation-only (never learns router or "revenue").
//
// When SHOW_HOME_STACKED is flipped on, `/` renders StackedUnionHome instead; this v1 stays the
// documented default (docs/specs/home-v1.spec.md). The revenue/margin fetch+derive lives in the shared
// useCompanyFinanceKpis hook so the stacked money-position section renders the SAME tiles (reuse).
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { formatIDRCompact } from '@/lib/sales-dashboard'
import { useCompanyFinanceKpis } from '@/lib/use-company-finance-kpis'
import { listTasks } from '@/lib/db/tasks'
import { KPITile } from '@/components/dashboard/kpi-tile'
import { MyWeekPanel } from '@/components/weekly/my-week-panel'
import { DataProvenanceNote } from '@/components/ui/data-provenance-note'
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
  const isManager = viewer?.isManager ?? false

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

      {canSeeFinance && (snapshotAsOf || (revenueState !== 'loading' && marginState !== 'loading')) && (
        <DataProvenanceNote
          kind="snapshot"
          hasData={Boolean(revenueWindow || marginDisplay)}
          asOf={snapshotAsOf}
        />
      )}

      {/* Legacy Weekly Update/Daily Log cards are hidden on Home until their
          successors are real; the direct My Week route remains available. */}
      <MyWeekPanel hideLegacyCadenceCards={!isManager} />
    </PageFrame>
  )
}
