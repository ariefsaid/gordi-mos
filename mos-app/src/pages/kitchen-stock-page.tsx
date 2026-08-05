// KitchenStockPage — /cafe/stock — S4 Stock view (read-only, auto-computed).
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S4.
// A glance, not an edit surface: each active WIP item with its two cuts for the
// selected date — stok (usable_qty, FR-060) and tersedia (available_qty, FR-061) —
// ACROSS EVERY (branch, activity) production stream (#198, OD-WAY-28). "Stok HQ" means
// the central kitchen, which books to Rumah Rames — not Gordi HQ — so a stock view that
// cannot say whose books a row is looking at is the shape of problem that hides a COGS
// error. Rows are grouped by stream, each carrying its own stream label.
// Proves (unit): FR-060/061 (two cuts per item), AC-032 (negative balances preserved),
// #198 (every row's stream is shown). Access: any authenticated member may read (spec
// FR-060 is org-readable; RLS is the authority — no UI role gate). Date defaults to WIB
// today (OQ-7). Read-only is the signal — NO edit/save/approve affordances.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { fetchKitchenStockAcrossStreams } from '@/lib/db/kitchen-logs'
import { listActiveBranches } from '@/lib/db/branches'
import type { BranchOption, KitchenStockStreamRow, ProductionStream } from '@/lib/db/kitchen-logs.types'
import { PRODUCTION_ACTIVITIES } from '@/lib/db/kitchen-logs.types'
import { activityLabel, branchDisplayName, streamKey } from '@/lib/kitchen-action-label'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { KitchenKpiStrip } from '@/components/kitchen/kitchen-kpi-strip'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { DataTable, type DataTableColumn, type DataTableGroup } from '@/components/dashboard/data-table'
import { useStockKpiStripData } from '@/lib/kitchen-stock-kpis'
import { DataProvenanceNote } from '@/components/ui/data-provenance-note'
import './kitchen-stock-page.css'

// WIB "today" as YYYY-MM-DD (fixed +7h offset, NFR-007) — matches the capture/review pages.
function wibToday(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const shifted = new Date(Date.now() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready' }

function streamLabel(t: ReturnType<typeof useT>, stream: ProductionStream): string {
  return `${branchDisplayName(stream.branch)} · ${activityLabel(t, stream.activity)}`
}

export function KitchenStockPage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('nav.kitchen.stock') }))
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.stock')}`
  const auth = useAuth()

  const [asOf] = useState(wibToday) // today WIB (date stepper deferred — owner OQ-7)
  const [rows, setRows] = useState<KitchenStockStreamRow[]>([])
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const isDesktop = useIsDesktop()
  const [search, setSearch] = useState('')
  // Derived stock KPIs (P-1, OQ-5 default ON) — pure view over `rows`, across every stream.
  const kpiData = useStockKpiStripData(rows)
  const hasLoggedStockData = rows.some(row => row.stok !== 0 || row.tersedia !== 0)
  const searchQuery = search.trim().toLowerCase()
  const visibleRows = rows.filter(row => (
    !searchQuery || row.wip_item_name.toLowerCase().includes(searchQuery)
  ))

  const stockColumns: DataTableColumn<KitchenStockStreamRow>[] = [
    {
      key: 'wip_item_name',
      header: t('kitchen.stock.col.dish'),
      cardLabel: '',
      render: row => (
        <span className="ks-item">
          <span>{row.wip_item_name}</span>
          {row.category && <span className="ks-category">{row.category}</span>}
        </span>
      ),
    },
    { key: 'stok', header: t('kitchen.stock.col.stok'), numeric: true },
    { key: 'tersedia', header: t('kitchen.stock.col.tersedia'), numeric: true },
  ]

  // One group per (branch, activity) stream (#198) — "each row's stream is shown", and
  // grouping keeps a viewer from ever comparing one stream's stok to another's plan by
  // accident (the same class of mistake #247 fixed in the review queue).
  const streamGroups: DataTableGroup<KitchenStockStreamRow>[] = useMemo(() => {
    const byStream = new Map<string, { label: string; rows: KitchenStockStreamRow[] }>()
    for (const row of visibleRows) {
      const key = streamKey(row.stream.branch.id, row.stream.activity)
      const entry = byStream.get(key)
      if (entry) entry.rows.push(row)
      else byStream.set(key, { label: streamLabel(t, row.stream), rows: [row] })
    }
    return Array.from(byStream.entries()).map(([key, { label, rows: groupRows }]) => ({
      key,
      label,
      count: groupRows.length,
      rows: groupRows,
    }))
  }, [visibleRows, t])

  const fetchStock = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      const branches: BranchOption[] = await listActiveBranches()
      const streams: ProductionStream[] = branches.flatMap(branch =>
        PRODUCTION_ACTIVITIES.map(activity => ({ branch, activity })),
      )
      const data = await fetchKitchenStockAcrossStreams(asOf, streams)
      setRows(data)
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'error' })
    }
  }, [asOf])

  // Read once authenticated (an unauthenticated viewer never triggers the read).
  useEffect(() => {
    if (auth.status !== 'authenticated') return
    fetchStock()
  }, [auth.status, fetchStock, retryKey])

  // ── Auth loading / unauth ──────────────────────────────────────────────────
  if (auth.status === 'loading') {
    return (
      <PageFamilyFrame family="workspace" title={pageTitle} jobSentence={t('job.cafe')} state="loading">
        <LoadingShell count={3} />
      </PageFamilyFrame>
    )
  }
  if (auth.status === 'unauthenticated' || auth.status === 'orphan') {
    return (
      <PageFamilyFrame family="workspace" title={pageTitle} jobSentence={t('job.cafe')} state="permission">
        <div className="ks-block ks-forbidden">
          <p className="ks-forbidden-msg">{t('kitchen.stock.signInMsg')}</p>
          <Link to="/login" className="btn btn-primary">{t('common.signIn')}</Link>
        </div>
      </PageFamilyFrame>
    )
  }

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageTitle}
      jobSentence={t('job.cafe')}
      meta={<span className="ks-date tabular">{asOf}</span>}
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : rows.length === 0 ? 'empty' : 'read-only'}
    >
      {/* Derived KPI strip (P-1, OQ-5 default ON) — only when populated */}
      {load.kind === 'ready' && rows.length > 0 && (
        <>
          <KitchenKpiStrip data={kpiData} isDesktop={isDesktop} />
          <DataProvenanceNote
            kind="live"
            show={!hasLoggedStockData}
            note={t('kitchen.stock.noEntriesToday')}
          />
        </>
      )}

      {load.kind === 'loading' && <LoadingShell count={3} />}

      {load.kind === 'error' && (
        <ErrorState
          message={t('common.loadFailed', { what: t('common.what.stock') })}
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {load.kind === 'ready' && rows.length === 0 && (
        <EmptyState
          title={t('kitchen.stock.empty.title')}
          copy={t('kitchen.stock.empty.copy', { date: asOf })}
        />
      )}

      {load.kind === 'ready' && rows.length > 0 && (
        <div className="ks-block">
          <KitchenToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('kitchen.stock.searchPlaceholder')}
            ariaLabel={t('kitchen.stock.toolbarAria')}
          />
          <DataTable
            columns={stockColumns}
            rows={visibleRows}
            groups={streamGroups}
            isDesktop={isDesktop}
            state={visibleRows.length > 0 ? 'ready' : 'empty'}
            emptyLabel={t('kitchen.filter.noMatch')}
            caption={t('kitchen.stock.caption', { date: asOf })}
          />
        </div>
      )}
    </PageFamilyFrame>
  )
}
