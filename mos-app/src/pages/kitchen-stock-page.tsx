// KitchenStockPage — /mos/kitchen/stock — S4 Stock view (read-only, auto-computed).
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S4.
// A glance, not an edit surface: each active WIP item with its two cuts for the
// selected date — stok (usable_qty, FR-060) and tersedia (available_qty, FR-061).
// Proves (unit): FR-060/061 (two cuts per item), AC-032 (negative balances
// preserved, never clamped). Access: any authenticated member may read (spec FR-060
// is org-readable; RLS is the authority — no UI role gate). Date defaults to WIB
// today (OQ-7). Read-only is the signal — NO edit/save/approve affordances.

import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useSearchParamState } from '@/lib/use-search-param-state'
import { useAuth } from '@/auth/use-auth'
import { fetchKitchenStock } from '@/lib/db/kitchen-logs'
import type { KitchenStockRow } from '@/lib/db/kitchen-logs.types'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { KitchenKpiStrip } from '@/components/kitchen/kitchen-kpi-strip'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { useStockKpiStripData } from '@/lib/kitchen-stock-kpis'
import { DataProvenanceNote } from '@/components/ui/data-provenance-note'
import { useT } from '@/i18n/use-t'
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

function stockColumns(t: ReturnType<typeof useT>): DataTableColumn<KitchenStockRow>[] {
  return [
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
}

export function KitchenStockPage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('doc.cafeStock') }))
  const auth = useAuth()
  // I18N sweep: reuse the existing nav.cafe.* family instead of a literal "Café · Stock".
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.stock')}`

  const [asOf] = useState(wibToday) // today WIB (date stepper deferred — owner OQ-7)
  const [rows, setRows] = useState<KitchenStockRow[]>([])
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  // Client-side search filter (P-3), URL-synced so the view survives refresh/share (I7 / D-E1).
  const isDesktop = useIsDesktop()
  const [search, setSearch] = useSearchParamState('q', '')
  // Derived stock KPIs (P-1, OQ-5 default ON) — pure view over `rows`.
  const kpiData = useStockKpiStripData(rows)
  const hasLoggedStockData = rows.some(row => row.stok !== 0 || row.tersedia !== 0)
  const searchQuery = search.trim().toLowerCase()
  const visibleRows = rows.filter(row => (
    !searchQuery || row.wip_item_name.toLowerCase().includes(searchQuery)
  ))

  const fetchStock = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      const data = await fetchKitchenStock(asOf)
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
          <p className="ks-forbidden-msg">You need to sign in to view Café stock.</p>
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        </div>
      </PageFamilyFrame>
    )
  }

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageTitle}
      jobSentence={t('job.cafe')}
      meta={
        // census FLAG-D: no naked count chip — a labeled meta sentence ("N dishes · <date>").
        <span className="ks-meta">
          {load.kind === 'ready' && `${t(rows.length === 1 ? 'kitchen.stock.meta.dishCount.one' : 'kitchen.stock.meta.dishCount.other', { count: rows.length })} · `}
          <span className="ks-date tabular">{asOf}</span>
        </span>
      }
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : rows.length === 0 ? 'empty' : 'default'}
    >

      {/* Derived KPI strip (P-1, OQ-5 default ON) — only when populated */}
      {load.kind === 'ready' && rows.length > 0 && (
        <>
          <KitchenKpiStrip data={kpiData} isDesktop={isDesktop} />
          <DataProvenanceNote
            kind="live"
            show={!hasLoggedStockData}
            note="No entries logged yet today"
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
        // 'awaiting' — stock derives from approved Café activity that will land as the day
        // progresses (matches kitchen-review/pushes' awaiting pattern), never 'quiet' ✓.
        <EmptyState
          variant="awaiting"
          title={t('kitchen.stock.empty.title')}
          copy={t('kitchen.stock.empty.copy', { date: asOf })}
        />
      )}

      {load.kind === 'ready' && rows.length > 0 && (
        <div className="ks-block">
          <KitchenToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Find a dish"
            ariaLabel="Stock filters"
          />
          <DataTable
            columns={stockColumns(t)}
            rows={visibleRows}
            isDesktop={isDesktop}
            state={visibleRows.length > 0 ? 'ready' : 'empty'}
            emptyLabel="No items match your filter."
            caption={`Café stock — on-hand and available per dish for ${asOf}`}
          />
        </div>
      )}
    </PageFamilyFrame>
  )
}
