// KitchenStockPage — /cafe/stock — S4 Stock view (read-only, auto-computed).
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S4.
//
// PER-STREAM (#237, FR-060): the page reads ONE (branch, activity) production stream at a
// time — default resolved from shared.default_stream() (the viewer's live primary stream
// Team, FR-001), switchable to any stream via the same scope affordance the capture
// surface uses (FR-003 — a default, never a wall). Each active WIP item shows its system
// quantity — `stok`, the net of approved production minus approved transfers for the
// SELECTED stream — beside the ERP inventory comparison column (placeholder until the ERP
// read is wired) and the start-of-day `tersedia` cut. This is the verification plane that
// derived raw usage depends on (OD-WAY-45): load-bearing, not decoration.
//
// "Stok HQ" in the incumbent means the CENTRAL KITCHEN, which books to Rumah Rames — not
// the GHQ branch — so no label here may read "HQ" for it (FR-061, CONTEXT.md trap); the
// stream is named through branchDisplayName (the Rumah Rames display alias).
//
// Proves (unit): AC-011 (per-stream net beside the ERP column, no "HQ" label), AC-032
// (negative balances preserved). Access: any authenticated member may read (FR-060 is
// org-readable; RLS is the authority — no UI role gate). Date defaults to WIB today
// (OQ-7). Read-only is the signal — NO edit/save/approve affordances.

import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { fetchKitchenStock, defaultStreamFrom } from '@/lib/db/kitchen-logs'
import { fetchDefaultStream } from '@/lib/db/default-stream'
import { listActiveBranches } from '@/lib/db/branches'
import type { BranchOption, KitchenStockRow, ProductionStream } from '@/lib/db/kitchen-logs.types'
import { activityLabel, branchDisplayName } from '@/lib/kitchen-action-label'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { KitchenKpiStrip } from '@/components/kitchen/kitchen-kpi-strip'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { StreamScopePicker } from '@/components/kitchen/stream-scope-picker'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
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

function streamLabel(t: ReturnType<typeof useT>, stream: ProductionStream | null): string {
  if (!stream) return '—'
  return `${branchDisplayName(stream.branch)} · ${activityLabel(t, stream.activity)}`
}

export function KitchenStockPage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('nav.kitchen.stock') }))
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.stock')}`
  const auth = useAuth()

  const [asOf] = useState(wibToday) // today WIB (date stepper deferred — owner OQ-7)
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [stream, setStream] = useState<ProductionStream | null>(null)
  const [rows, setRows] = useState<KitchenStockRow[]>([])
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const isDesktop = useIsDesktop()
  const [search, setSearch] = useState('')
  // Derived stock KPIs (P-1, OQ-5 default ON) — pure view over the SELECTED stream's rows.
  const kpiData = useStockKpiStripData(rows)
  const hasLoggedStockData = rows.some(row => row.stok !== 0 || row.tersedia !== 0)
  const searchQuery = search.trim().toLowerCase()
  const visibleRows = rows.filter(row => (
    !searchQuery || row.wip_item_name.toLowerCase().includes(searchQuery)
  ))

  // FR-060 column order: the system-quantity net (`stok`) sits DIRECTLY BESIDE the ERP
  // inventory column — the comparison is the point. The ERP cell is a placeholder ('—')
  // until the ERP read is wired (#237 preserves the ported page's placeholder source;
  // no new ERP calls); the note under the toolbar says so rather than letting an empty
  // column read as "zero everywhere".
  const stockColumns: DataTableColumn<KitchenStockRow>[] = [
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
    {
      key: 'erp_qty',
      header: t('kitchen.stock.col.erp'),
      numeric: true,
      render: () => <span className="ks-erp-pending">—</span>,
    },
    { key: 'tersedia', header: t('kitchen.stock.col.tersedia'), numeric: true },
  ]

  // Initial load: catalog → default stream → that stream's rows. The default comes from
  // shared.default_stream() (FR-001 — the viewer's live primary stream Team); a viewer
  // with no stream default (FR-002 shape) falls back to the catalog default — this is a
  // read surface, so an explicit-choice wall would only cost a glance, and the picker
  // stays one tap away either way (FR-003).
  const bootstrap = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      const branchRows = await listActiveBranches()
      const resolved = (await fetchDefaultStream(branchRows)) ?? defaultStreamFrom(branchRows)
      const data = resolved ? await fetchKitchenStock(asOf, resolved) : []
      setBranches(branchRows)
      setStream(resolved)
      setRows(data)
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'error' })
    }
  }, [asOf])

  // Switching the stream re-reads the rows: the same dish has a different balance in
  // another stream's books (OD-WAY-28) — a kept list would show one stream's numbers
  // under another stream's name, the exact confusion FR-061 exists to end.
  const applyStream = useCallback(async (next: ProductionStream) => {
    setStream(next)
    setLoad({ kind: 'loading' })
    try {
      setRows(await fetchKitchenStock(asOf, next))
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'error' })
    }
  }, [asOf])

  // Read once authenticated (an unauthenticated viewer never triggers the read).
  useEffect(() => {
    if (auth.status !== 'authenticated') return
    void bootstrap()
  }, [auth.status, bootstrap, retryKey])

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
          copy={t('kitchen.stock.empty.copy', { stream: streamLabel(t, stream), date: asOf })}
        />
      )}

      {load.kind === 'ready' && rows.length > 0 && (
        <div className="ks-block">
          <KitchenToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('kitchen.stock.searchPlaceholder')}
            ariaLabel={t('kitchen.stock.toolbarAria')}
          >
            <StreamScopePicker
              branches={branches}
              stream={stream}
              onChange={next => { void applyStream(next) }}
              branchAriaLabel={t('kitchen.stock.stream.branchAria')}
              activityAriaLabel={t('kitchen.stock.stream.activityAria')}
            />
          </KitchenToolbar>
          <DataProvenanceNote kind="live" show note={t('kitchen.stock.erpPending')} />
          <DataTable
            columns={stockColumns}
            rows={visibleRows}
            isDesktop={isDesktop}
            state={visibleRows.length > 0 ? 'ready' : 'empty'}
            emptyLabel={t('kitchen.filter.noMatch')}
            caption={t('kitchen.stock.caption', { stream: streamLabel(t, stream), date: asOf })}
          />
        </div>
      )}
    </PageFamilyFrame>
  )
}
