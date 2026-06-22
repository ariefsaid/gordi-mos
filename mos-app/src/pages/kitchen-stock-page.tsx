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
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useAuth } from '@/auth/use-auth'
import { fetchKitchenStock } from '@/lib/db/kitchen-logs'
import type { KitchenStockRow } from '@/lib/db/kitchen-logs.types'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { KitchenKpiStrip } from '@/components/kitchen/kitchen-kpi-strip'
import { KitchenStockTable } from '@/components/kitchen/kitchen-stock-table'
import { KitchenStockCards } from '@/components/kitchen/kitchen-stock-cards'
import { useStockKpiStripData } from '@/lib/kitchen-stock-kpis'
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

export function KitchenStockPage() {
  useDocumentTitle('Kitchen Stock — Gordi MOS')
  const auth = useAuth()

  const [asOf] = useState(wibToday) // today WIB (date stepper deferred — owner OQ-7)
  const [rows, setRows] = useState<KitchenStockRow[]>([])
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  // NEW presentational state (P-3): reflow branch + client-side search filter.
  const isDesktop = useIsDesktop()
  const [search, setSearch] = useState('')
  // Derived stock KPIs (P-1, OQ-5 default ON) — pure view over `rows`.
  const kpiData = useStockKpiStripData(rows)

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
    return <PageFrame><LoadingState /></PageFrame>
  }
  if (auth.status === 'unauthenticated' || auth.status === 'orphan') {
    return (
      <PageFrame>
        <div className="ks-block ks-forbidden">
          <p className="ks-forbidden-msg">You need to sign in to view kitchen stock.</p>
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        </div>
      </PageFrame>
    )
  }

  return (
    <PageFrame variant="data">
      <PageHead
        variant="content"
        title="Kitchen · Stock"
        count={load.kind === 'ready' ? rows.length : null}
        meta={<span className="ks-date tabular">{asOf}</span>}
      />

      {/* Derived KPI strip (P-1, OQ-5 default ON) — only when populated */}
      {load.kind === 'ready' && rows.length > 0 && (
        <KitchenKpiStrip data={kpiData} isDesktop={isDesktop} />
      )}

      {load.kind === 'loading' && <LoadingState />}

      {load.kind === 'error' && (
        <ErrorState
          message="Couldn't compute stock — check your connection."
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {load.kind === 'ready' && rows.length === 0 && (
        <EmptyState
          title="No stock to show"
          copy={`No approved kitchen activity for ${asOf} yet.`}
        />
      )}

      {load.kind === 'ready' && rows.length > 0 && (
        isDesktop ? (
          <KitchenStockTable
            rows={rows}
            asOf={asOf}
            search={search}
            onSearchChange={setSearch}
          />
        ) : (
          <KitchenStockCards
            rows={rows}
            search={search}
            onSearchChange={setSearch}
          />
        )
      )}
    </PageFrame>
  )
}

function LoadingState() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="ks-block">
      <SkeletonRows count={3} />
    </div>
  )
}
