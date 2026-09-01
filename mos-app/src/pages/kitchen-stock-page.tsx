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
// stream is named by the branch's CANONICAL catalog name, which is what keeps that true.
// #238 owner ruling (CONTEXT.md, Production stream): canonical everywhere a stream is named;
// the 'Bungur' alias names a transfer DESTINATION and the derived action label only. #237
// shipped the alias on this surface; the ruling moved it, and the test was inverted to pin
// both halves rather than deleted.
//
// Proves (unit): AC-011's RENDER half (the system-quantity column beside the ERP column,
// per-stream scoping + switch, no "HQ" label) and AC-032 (negative balances preserved).
// The NET itself — approved production minus approved transfers, per stream, cross-stream
// isolated — is owned at pgTAP: supabase/tests/ops_09_daily_log_and_stock.sql (+ ops_10
// block H for the one-round-trip reader this page calls through fetchKitchenStock).
// Access: any authenticated member may read (FR-060 is
// org-readable; RLS is the authority — no UI role gate). Date defaults to WIB today
// (OQ-7). Read-only is the signal — NO edit/save/approve affordances.

import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { fetchKitchenStock } from '@/lib/db/kitchen-logs'
import { useCafeStream } from '@/lib/use-cafe-stream'
import type { KitchenStockRow, ProductionStream } from '@/lib/db/kitchen-logs.types'
import { streamLabel } from '@/lib/kitchen-action-label'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { KitchenKpiStrip } from '@/components/kitchen/kitchen-kpi-strip'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { CafeStreamBar } from '@/components/kitchen/cafe-stream-bar'
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

// The stream label lives in `lib/kitchen-action-label` now (#440) — the same words on every
// Café surface, and the #238 naming ruling (canonical catalog name, never the 'Bungur'
// alias, never "HQ") stated once instead of once per page.

export function KitchenStockPage() {
  const t = useT()
  // issue 455: the tab names the module the rail and breadcrumb name; leaf-first per
  // the catalog's own docTitle convention (tasks-layout, signals-archive).
  useDocumentTitle(t('common.docTitle', { page: `${t('nav.cafe.stock')} · ${t('nav.cafe')}` }))
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.stock')}`
  const auth = useAuth()

  const [asOf] = useState(wibToday) // today WIB (date stepper deferred — owner OQ-7)
  // The module's stream + the enumerable stream catalog it is chosen from (FR-005),
  // through the ONE bootstrap every Café surface shares (issue 456).
  const cafeStream = useCafeStream()
  const { options: streamOptions, stream } = cafeStream
  const { resolve: resolveStream, adopt: adoptStream, setStream: chooseStream } = cafeStream
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
      header: t('kitchen.stock.col.item'),
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

  // Stale-response guard: every read bumps the generation, and only the LATEST
  // generation's result may land. Without this, two rapid stream switches can resolve
  // out of order and render stream A's rows under stream B's label — the exact
  // wrong-books confusion FR-061 exists to end, produced by the page itself. Shared by
  // bootstrap and applyStream so a slow bootstrap can't clobber a later switch either.
  const requestGen = useRef(0)

  // Initial load: catalog → stream → that stream's rows. #440: the stream is the MODULE's
  // selection — whatever the person chose on Log/Plan/Review this session wins, then their own
  // stream from shared.default_stream() (FR-001). No default (FR-002) now means the same here
  // as on capture: an explicit choice, never a silent fallback to the catalog's first branch.
  // A read surface that guesses is worse than one that asks — it answers "how much stock is
  // there" about books the person never picked.
  const bootstrap = useCallback(async () => {
    const gen = ++requestGen.current
    setLoad({ kind: 'loading' })
    try {
      const catalog = await resolveStream()
      const data = catalog.stream ? await fetchKitchenStock(asOf, catalog.stream) : []
      if (gen !== requestGen.current) return // superseded — a newer read owns the state
      adoptStream(catalog)
      setRows(data)
      setLoad({ kind: 'ready' })
    } catch {
      if (gen !== requestGen.current) return
      setLoad({ kind: 'error' })
    }
  }, [asOf, resolveStream, adoptStream])

  // Switching the stream re-reads the rows: the same dish has a different balance in
  // another stream's books (OD-WAY-28) — a kept list would show one stream's numbers
  // under another stream's name, the exact confusion FR-061 exists to end.
  const applyStream = useCallback(async (next: ProductionStream) => {
    const gen = ++requestGen.current
    chooseStream(next) // the whole Café module follows this choice (#440)
    setLoad({ kind: 'loading' })
    try {
      const data = await fetchKitchenStock(asOf, next)
      if (gen !== requestGen.current) return // superseded — a newer read owns the state
      setRows(data)
      setLoad({ kind: 'ready' })
    } catch {
      if (gen !== requestGen.current) return
      setLoad({ kind: 'error' })
    }
  }, [asOf, chooseStream])

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

  // #440: the head states the stream in EVERY state — the empty one and the mid-switch one
  // included. A stream with no picker is an implicit wall (the viewer would be stuck in the
  // very stream that has nothing to show) and a picker that unmounts during the re-read makes
  // rapid correction impossible — both violate FR-003. The generation guard above is what
  // makes rapid switching safe to allow.
  const streamHead = (
    <CafeStreamBar
      options={streamOptions}
      stream={stream}
      onChange={next => { void applyStream(next) }}
    />
  )

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageTitle}
      statusRow={streamHead}
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

      {load.kind === 'loading' && streamOptions.length === 0 && <LoadingShell count={3} />}

      {load.kind === 'error' && (
        <ErrorState
          message={t('common.loadFailed', { what: t('common.what.stock') })}
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {/* No stream resolved (FR-002 — no live primary stream Team, nothing chosen yet): the
          head's picker is the whole next step, so say that instead of rendering a table of
          nothing under an em dash. */}
      {load.kind === 'ready' && stream === null && (
        <EmptyState variant="blank" title={t('cafe.stream.none')} />
      )}

      {((load.kind === 'ready' && stream !== null) || (load.kind === 'loading' && streamOptions.length > 0)) && (
        <div className="ks-block">
          <KitchenToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('kitchen.stock.searchPlaceholder')}
            ariaLabel={t('kitchen.stock.toolbarAria')}
          />
          {load.kind === 'loading' ? (
            <LoadingShell count={3} />
          ) : rows.length === 0 ? (
            <EmptyState
              title={t('kitchen.stock.empty.title')}
              copy={t('kitchen.stock.empty.copy', { stream: streamLabel(t, stream), date: asOf })}
            />
          ) : (
            <>
              <DataProvenanceNote kind="live" show note={t('kitchen.stock.erpPending')} />
              <DataTable
                columns={stockColumns}
                rows={visibleRows}
                isDesktop={isDesktop}
                state={visibleRows.length > 0 ? 'ready' : 'empty'}
                emptyLabel={t('kitchen.filter.noMatch')}
                caption={t('kitchen.stock.caption', { stream: streamLabel(t, stream), date: asOf })}
              />
            </>
          )}
        </div>
      )}
    </PageFamilyFrame>
  )
}
