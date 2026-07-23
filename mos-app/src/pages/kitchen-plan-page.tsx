// KitchenPlanPage — /mos/kitchen/plan — S2 plan editor + 14-day "pesanan" horizon.
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S2.
// Two faces of one route, role-gated (member-read / lead-edit — NOT a forbidden wall):
//   • ops_lead/admin → EDITOR: set qty_porsi per (date, item, action_type); save is an
//     upsert/replace (FR-031); a quiet "saved" confirms in place (no view transition).
//   • member        → PESANAN: read-only 14-day forward horizon of planned items
//     (FR-035, AC-024) — grouped by date, NO logging/approve/edit affordance.
// Both faces now render through the ONE shared <DataTable> primitive (RI-IXD-8),
// retiring the bespoke kitchen-plan/pesanan table+cards pair. Grouping is expressed
// as DataTableGroup[] (label:null = inline bucket, no header — preserves the
// "null category is never dropped" behavior). Proves (unit): AC-024 (member
// read-only horizon), FR-030/031 (lead edit → upsert, payload never carries
// org_id/plan_by). All states: loading, empty, error+retry, saving/saved, offline
// (online-only writes, NFR-008), read-only, unauthenticated.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useSearchParamState } from '@/lib/use-search-param-state'
import { listActiveWipItems } from '@/lib/db/kitchen-logs'
import { listKitchenPlans, listPesanan, upsertKitchenPlan } from '@/lib/db/kitchen-plans'
import type {
  WipItemOption,
  PlanCell,
  PesananRow,
  KitchenActionType,
} from '@/lib/db/kitchen-logs.types'
import { PESANAN_HORIZON_DAYS } from '@/lib/db/kitchen-logs.types'
import { ActionTypeSeg } from '@/components/kitchen/action-type-seg'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { KitchenKpiStrip } from '@/components/kitchen/kitchen-kpi-strip'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { DataProvenanceNote } from '@/components/ui/data-provenance-note'
import { PlanQtyCell } from '@/components/kitchen/plan-qty-cell'
import { PlanQtyStepper } from '@/components/kitchen/plan-qty-stepper'
import { groupByCategory } from '@/lib/kitchen-category'
import {
  DataTable,
  type DataTableColumn,
  type DataTableGroup,
} from '@/components/dashboard/data-table'
import { usePlanKpiStripData } from '@/lib/kitchen-plan-kpis'
import './kitchen-plan-page.css'

// WIB "today" as YYYY-MM-DD (fixed +7h offset, NFR-007) — matches the other kitchen pages.
function wibToday(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const shifted = new Date(Date.now() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready' }

export function KitchenPlanPage() {
  useDocumentTitle('Café Plan — Gordi MOS')
  const auth = useAuth()
  const t = useT()

  // Role split (member-read / lead-edit). RLS is the authority; this picks the face.
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const canEdit = accessRoles.includes('ops_lead') || accessRoles.includes('admin')

  if (auth.status === 'loading') {
    return (
      <PageFamilyFrame family="workspace" title="Café · Plan" jobSentence={t('job.cafe')} state="loading">
        <LoadingShell count={3} />
      </PageFamilyFrame>
    )
  }
  if (auth.status === 'unauthenticated' || auth.status === 'orphan') {
    return (
      <PageFamilyFrame family="workspace" title="Café · Plan" jobSentence={t('job.cafe')} state="permission">
        <div className="kp-block kp-forbidden">
          <p className="kp-forbidden-msg">You need to sign in to view the Café plan.</p>
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        </div>
      </PageFamilyFrame>
    )
  }

  return canEdit ? <PlanEditor /> : <PesananView />
}

// ════════════════════════════════════════════════════════════════════════════
// ops_lead / admin — the plan EDITOR (FR-030/031)
// ════════════════════════════════════════════════════════════════════════════
function PlanEditor() {
  const t = useT()
  const [logDate] = useState(wibToday) // today WIB (date stepper deferred — owner OQ-7)
  const [action, setAction] = useState<KitchenActionType>('Production')
  const [items, setItems] = useState<WipItemOption[]>([])
  const [cells, setCells] = useState<PlanCell[]>([])
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const [savingId, setSavingId] = useState<string | null>(null) // wip_item_id mid-save
  // The last-committed cell — drives the transient inline ✓ Saved tick (A5). Page-level
  // (not a local saving→idle transition) because `savingId` also clears on save ERROR,
  // so only a success-set flag can safely mean "this cell stuck".
  const [justSavedId, setJustSavedId] = useState<string | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saveError, setSaveError] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  // Client-side search/category filter (P-3), URL-synced so the view survives refresh/share (I7 / D-E1).
  const isDesktop = useIsDesktop()
  const [search, setSearch] = useSearchParamState('q', '')
  const [category, setCategory] = useSearchParamState('category', 'All')
  // Derived plan KPIs (P-1) — pure view over `cells` for the current action.
  const kpiData = usePlanKpiStripData(cells, action)
  const hasPlannedItems = cells.some(cell => cell.action_type === action && cell.qty_porsi > 0)

  useEffect(() => {
    function on() { setIsOnline(true) }
    function off() { setIsOnline(false) }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Clear the transient ✓ Saved timer on unmount so it can't setState after teardown.
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current) }, [])

  const fetchEditor = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      const [itemRows, planCells] = await Promise.all([
        listActiveWipItems(),
        listKitchenPlans(logDate),
      ])
      setItems(itemRows)
      setCells(planCells)
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'error' })
    }
  }, [logDate])

  useEffect(() => { fetchEditor() }, [fetchEditor, retryKey])

  // Plan qty for (item, current action) — 0 when no plan row yet.
  const qtyOf = useCallback(
    (wipItemId: string): number =>
      cells.find(c => c.wip_item_id === wipItemId && c.action_type === action)?.qty_porsi ?? 0,
    [cells, action],
  )

  // Persist one cell (FR-031 upsert). No-op when unchanged or offline (no needless write).
  async function saveCell(wipItemId: string, nextQty: number) {
    if (!isOnline) return
    if (nextQty < 0) return
    const current = qtyOf(wipItemId)
    if (nextQty === current) return
    setSavingId(wipItemId)
    setSaveError('')
    try {
      const id = await upsertKitchenPlan({
        log_date: logDate,
        wip_item_id: wipItemId,
        action_type: action,
        qty_porsi: nextQty,
      })
      // Reflect the confirmed result in place (no view transition).
      setCells(prev => {
        const without = prev.filter(c => !(c.wip_item_id === wipItemId && c.action_type === action))
        return [...without, { id, wip_item_id: wipItemId, action_type: action, qty_porsi: nextQty }]
      })
      // Surface the commit INLINE at THIS cell (A5): a transient ✓ Saved tick, then
      // idle. Reset any in-flight tick (e.g. rapid back-to-back edits) before re-arming.
      setJustSavedId(wipItemId)
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setJustSavedId(null), 1500)
    } catch (err) {
      setSaveError(err instanceof Error ? `Couldn't save — ${err.message}` : "Couldn't save — please try again.")
    } finally {
      setSavingId(null)
    }
  }

  // Client-side search + category filter + null-safe category grouping (lifted from
  // the retired KitchenPlanTable/Cards so the shared DataTable owns all rendering).
  const q = search.trim().toLowerCase()
  // Memoised on its real inputs so the planGroups memo below can depend on a stable
  // reference (predicates inlined — no closure deps leak).
  const visible = useMemo(
    () => items.filter(it =>
      (!q || it.name.toLowerCase().includes(q)) &&
      (category === 'All' || (it.category ?? '') === category)),
    [items, q, category],
  )
  // Category options derived from ALL items (unique, sorted) + "All" — so filtering
  // by one category doesn't remove the others from the select.
  const categories = ['All', ...Array.from(new Set(items.map(i => i.category ?? '').filter(Boolean))).sort()]
  // Group the visible items by category (sorted), with null-category items in a
  // fallback bucket so they are never silently dropped (staging/prod has no categories).
  const planGroups: DataTableGroup<WipItemOption>[] = useMemo(
    () => groupByCategory(visible).map(g => ({
      key: g.cat ?? '__uncategorised__',
      // null cat = uncategorised fallback bucket → no group header (label: null).
      label: g.cat,
      rows: g.rows,
    })),
    [visible],
  )

  // Plan editor columns: Dish (name + category sub-label) · Plan (editable cell).
  // The Plan render picks the desktop compact cell vs the phone 44px stepper from the
  // useIsDesktop() branch — same props the retired KitchenPlanTable/Cards passed.
  const planColumns: DataTableColumn<WipItemOption>[] = [
    {
      key: 'dish',
      header: 'Dish',
      cardLabel: '', // the phone card title line
      render: item => (
        <span className="kp-dish">
          <span className="kp-name">{item.name}</span>
          {item.category && <span className="kp-cat">{item.category}</span>}
        </span>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      numeric: true,
      render: item => isDesktop ? (
        <PlanQtyCell
          itemName={item.name}
          qty={qtyOf(item.id)}
          saving={savingId === item.id}
          justSaved={justSavedId === item.id}
          disabled={!isOnline}
          onSave={next => saveCell(item.id, next)}
        />
      ) : (
        <PlanQtyStepper
          itemName={item.name}
          qty={qtyOf(item.id)}
          saving={savingId === item.id}
          justSaved={justSavedId === item.id}
          disabled={!isOnline}
          onSave={next => saveCell(item.id, next)}
        />
      ),
    },
  ]

  return (
    <PageFamilyFrame
      family="workspace"
      title="Café · Plan"
      jobSentence={t('job.cafe')}
      meta={
        // census FLAG-D: labeled meta sentence, not a naked count chip ("N dishes · <date>").
        <span className="kp-meta">
          {load.kind === 'ready' && `${items.length} ${items.length === 1 ? 'dish' : 'dishes'} · `}
          <span className="kp-date tabular">{logDate}</span>
        </span>
      }
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : items.length === 0 ? 'empty' : saveError ? 'validation' : savingId ? 'saving' : 'default'}
    >

      {/* Derived KPI strip (P-1) — only when populated (plan §4.4) */}
      {load.kind === 'ready' && items.length > 0 && (
        <>
          <KitchenKpiStrip data={kpiData} isDesktop={isDesktop} />
          <DataProvenanceNote
            kind="live"
            show={!hasPlannedItems}
            note="Nothing planned yet"
          />
        </>
      )}

      <div className="kp-seg-wrap kp-block">
        <ActionTypeSeg value={action} onChange={setAction} disabled={load.kind !== 'ready'} />
      </div>

      {!isOnline && (
        <div role="alert" className="kp-banner kp-banner-offline kp-block">
          You're offline — editing the plan needs a connection. Reconnect to save.
        </div>
      )}
      {saveError && (
        <div role="alert" className="kp-banner kp-banner-error kp-block">{saveError}</div>
      )}

      {load.kind === 'loading' && <LoadingShell count={3} />}

      {load.kind === 'error' && (
        <ErrorState
          message="Couldn't load the plan — check your connection."
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {load.kind === 'ready' && items.length === 0 && (
        // 'blank' — no WIP items are configured yet (an admin task), not a data source that
        // will fill on its own; never the 'quiet' ✓ (that would misread as "nothing to plan,
        // all done" instead of "nothing CAN be planned until items exist").
        <EmptyState
          variant="blank"
          title="No active WIP items"
          copy="Ask an admin to add café items first."
        />
      )}

      {load.kind === 'ready' && items.length > 0 && (
        <div className="kp-block">
          <KitchenToolbar
            search={search}
            onSearchChange={setSearch}
            categories={categories}
            category={category}
            onCategoryChange={setCategory}
            searchPlaceholder="Find a dish to plan"
            ariaLabel="Plan filters"
          />
          <DataTable
            columns={planColumns}
            rows={visible}
            groups={planGroups}
            isDesktop={isDesktop}
            state={visible.length > 0 ? 'ready' : 'empty'}
            emptyLabel="No dishes match your filter."
            caption="Café plan — set planned quantity per dish"
          />
        </div>
      )}
    </PageFamilyFrame>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// member — the read-only PESANAN horizon (FR-035 / AC-024)
// ════════════════════════════════════════════════════════════════════════════
function PesananView() {
  const t = useT()
  const [from] = useState(wibToday) // horizon start = today WIB
  const [rows, setRows] = useState<PesananRow[]>([])
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const isDesktop = useIsDesktop()

  const fetchHorizon = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      const data = await listPesanan(from, PESANAN_HORIZON_DAYS)
      setRows(data)
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'error' })
    }
  }, [from])

  useEffect(() => { fetchHorizon() }, [fetchHorizon, retryKey])

  // Group the flat rows by date (already date-sorted by the query) for the read view.
  const pesananGroups: DataTableGroup<PesananRow>[] = useMemo(() => {
    const byDate = new Map<string, PesananRow[]>()
    for (const r of rows) {
      const list = byDate.get(r.log_date) ?? []
      list.push(r)
      byDate.set(r.log_date, list)
    }
    return [...byDate.entries()].map(([date, dateRows]) => ({
      key: date,
      label: date,
      count: dateRows.length,
      rows: dateRows,
    }))
  }, [rows])

  // Read-only pesanan columns: Item (name + category sub-label) · Action · Planned.
  // No edit affordance (AC-024) — the qty is a plain tabular number, no stepper.
  const pesananColumns: DataTableColumn<PesananRow>[] = [
    {
      key: 'item',
      header: 'Item',
      cardLabel: '', // the phone card title line
      render: r => (
        <span className="kp-dish">
          <span className="kp-name">{r.wip_item_name}</span>
          {r.category && <span className="kp-cat">{r.category}</span>}
        </span>
      ),
    },
    { key: 'action_type', header: 'Action' },
    { key: 'qty_porsi', header: 'Planned', numeric: true },
  ]

  return (
    <PageFamilyFrame
      family="workspace"
      title="Café · Plan"
      jobSentence={t('job.cafe')}
      meta={
        // census FLAG-D: labeled meta sentence, not a naked count chip ("N planned · next 14 days").
        <span className="kp-meta">
          {load.kind === 'ready' && `${rows.length} planned · `}
          <span className="kp-date tabular">next {PESANAN_HORIZON_DAYS} days</span>
        </span>
      }
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : rows.length === 0 ? 'empty' : 'read-only'}
    >

      {load.kind === 'loading' && <LoadingShell count={3} />}

      {load.kind === 'error' && (
        <ErrorState
          message="Couldn't load the upcoming plan — check your connection."
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {load.kind === 'ready' && rows.length === 0 && (
        // 'awaiting' — the plan source exists and will fill as the lead plans ahead (matches
        // the sibling "Nothing to review" / "No pushes yet" awaiting pattern on kitchen-review
        // / kitchen-pushes), never the 'quiet' ✓ earned-all-clear.
        <EmptyState
          variant="awaiting"
          title="Nothing planned"
          copy={`No planned items in the next ${PESANAN_HORIZON_DAYS} days yet.`}
        />
      )}

      {load.kind === 'ready' && rows.length > 0 && (
        <DataTable
          columns={pesananColumns}
          rows={rows}
          groups={pesananGroups}
          isDesktop={isDesktop}
          caption={`Planned items — next ${PESANAN_HORIZON_DAYS} days`}
        />
      )}
    </PageFamilyFrame>
  )
}
