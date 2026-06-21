// KitchenStockPage — /mos/kitchen/stock — S4 Stock view (read-only, auto-computed).
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S4.
// A glance, not an edit surface: each active WIP item with its two cuts for the
// selected date — stok (usable_qty, FR-060) and tersedia (available_qty, FR-061).
// Proves (unit): FR-060/061 (two cuts per item), AC-032 (negative balances
// preserved, never clamped). Access: any authenticated member may read (spec FR-060
// is org-readable; RLS is the authority — no UI role gate). Date defaults to WIB
// today (OQ-7). Read-only is the signal — NO edit/save/approve affordances.

import { useState, useEffect, useCallback } from 'react'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useAuth } from '@/auth/use-auth'
import { fetchKitchenStock } from '@/lib/db/kitchen-logs'
import type { KitchenStockRow } from '@/lib/db/kitchen-logs.types'
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
          <a href="/login" className="btn btn-primary">Sign in</a>
        </div>
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <PageHead
        variant="content"
        title="Kitchen · Stock"
        count={load.kind === 'ready' ? rows.length : null}
        meta={<span className="ks-date tabular">{asOf}</span>}
      />

      {load.kind === 'loading' && <LoadingState />}

      {load.kind === 'error' && (
        <div className="ks-block ks-error" role="alert">
          <p className="ks-error-msg">Couldn't compute stock — check your connection.</p>
          <button
            type="button"
            className="btn btn-outline"
            aria-label="Retry loading stock"
            onClick={() => setRetryKey(k => k + 1)}
          >
            Retry
          </button>
        </div>
      )}

      {load.kind === 'ready' && rows.length === 0 && (
        <div className="ks-block ks-empty">
          No stock to show — no approved kitchen activity for {asOf} yet.
        </div>
      )}

      {load.kind === 'ready' && rows.length > 0 && (
        <div className="ks-block ks-tablewrap">
          <table className="ks-table">
            <caption className="sr-only">Kitchen stock for {asOf}</caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="ks-num-head">Stok</th>
                <th scope="col" className="ks-num-head">Tersedia</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.wip_item_id}>
                  <td className="ks-item">{row.wip_item_name}</td>
                  <StockCell value={row.stok} />
                  <StockCell value={row.tersedia} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageFrame>
  )
}

// One numeric cell — tabular digits; negative balances are preserved and tinted
// destructive (AA-safe --status-lost-text), never clamped (FR-061/AC-032).
function StockCell({ value }: { value: number }) {
  const negative = value < 0
  return (
    <td className={`ks-num tabular${negative ? ' ks-num-neg' : ''}`}>
      {value}
    </td>
  )
}

function LoadingState() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="ks-loading ks-block">
      {[1, 2, 3].map(i => <div key={i} className="ks-skeleton" />)}
    </div>
  )
}
