// KitchenPlanPage — /cafe/plan — S2 plan editor + 14-day "pesanan" horizon.
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S2.
// Two faces of one route, role-gated (member-read / lead-edit — NOT a forbidden wall):
//   • ops_lead/admin → EDITOR: set qty_porsi per (item, movement) within ONE (branch,
//     activity) stream (OD-WAY-28); save is an upsert/replace (FR-031); a quiet "saved"
//     confirms in place (no view transition).
//   • member        → PESANAN: read-only 14-day forward horizon of planned items
//     (FR-035, AC-024) for the org's default stream — grouped by date, NO
//     logging/approve/edit affordance.
// Both faces render through the shared <DataTable> primitive. Proves (unit): AC-024
// (member read-only horizon), FR-030/031 (lead edit → upsert, payload never carries
// org_id/plan_by). All states: loading, empty, error+retry, saving/saved, offline
// (online-only writes, NFR-008), read-only, unauthenticated.
//
// #247 / #197 port: the prior version of this page read/wrote a stored `action_type`
// column that the squashed schema never carries — every plan editor and pesanan read
// against a live database 404'd. Cells now carry a KitchenMovement (DD-WAY-13) within an
// explicitly chosen (branch, activity) stream (OD-WAY-28), the same model the Café · Log
// capture surface already ported (#196).

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useSearchParamState } from '@/lib/use-search-param-state'
import { listActiveWipItems, defaultStreamFrom } from '@/lib/db/kitchen-logs'
import { listActiveBranches } from '@/lib/db/branches'
import { listKitchenPlans, listPesanan, upsertKitchenPlan } from '@/lib/db/kitchen-plans'
import type {
  BranchOption,
  KitchenMovement,
  PesananRow,
  PlanCell,
  ProductionStream,
  WipItemOption,
} from '@/lib/db/kitchen-logs.types'
import { PESANAN_HORIZON_DAYS, PRODUCTION_ACTIVITIES } from '@/lib/db/kitchen-logs.types'
import {
  activityLabel,
  branchDisplayName,
  deriveActionLabel,
  movementKey,
  movementsEqual,
  movementsForStream,
  PRODUCE,
} from '@/lib/kitchen-action-label'
import { MovementSeg } from '@/components/kitchen/movement-seg'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { KitchenKpiStrip } from '@/components/kitchen/kitchen-kpi-strip'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
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

// WIB "today" as YYYY-MM-DD (fixed +7h offset, NFR-007) — matches the other Café pages.
function wibToday(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const shifted = new Date(Date.now() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready' }

export function KitchenPlanPage() {
  const auth = useAuth()
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('nav.kitchen.plan') }))
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.plan')}`

  // Role split (member-read / lead-edit). RLS is the authority; this picks the face.
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const canEdit = accessRoles.includes('ops_lead') || accessRoles.includes('admin')

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
        <div className="kp-block kp-forbidden">
          <p className="kp-forbidden-msg">{t('kitchen.plan.signInMsg')}</p>
          <Link to="/login" className="btn btn-primary">{t('common.signIn')}</Link>
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
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.plan')}`
  const [logDate] = useState(wibToday) // today WIB (date stepper deferred — owner OQ-7)
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [stream, setStream] = useState<ProductionStream | null>(null)
  const [movement, setMovement] = useState<KitchenMovement>(PRODUCE)
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
  const isDesktop = useIsDesktop()
  const [search, setSearch] = useSearchParamState('q', '')
  const [category, setCategory] = useSearchParamState('category', 'All')
  // Derived plan KPIs (P-1) — pure view over `cells` for the current movement.
  const movementLabel = useMemo(() => deriveActionLabel(t, movement, branches), [t, movement, branches])
  const kpiData = usePlanKpiStripData(cells, movement, movementLabel)
  const hasPlannedItems = cells.some(
    cell => movementKey(cell.movement) === movementKey(movement) && cell.qty_porsi > 0,
  )

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
      const [itemRows, branchRows] = await Promise.all([
        listActiveWipItems(),
        listActiveBranches(),
      ])
      const resolvedStream = defaultStreamFrom(branchRows)
      const planCells = resolvedStream ? await listKitchenPlans(logDate, resolvedStream) : []
      setItems(itemRows)
      setBranches(branchRows)
      setStream(resolvedStream)
      setMovement(PRODUCE)
      setCells(planCells)
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'error' })
    }
  }, [logDate])

  useEffect(() => { fetchEditor() }, [fetchEditor, retryKey])

  // Switching the stream re-reads the plan — a different (branch, activity) has its own
  // plan rows entirely, same as the capture surface's applyStream (#196).
  const applyStream = useCallback(async (nextStream: ProductionStream) => {
    setStream(nextStream)
    setMovement(PRODUCE)
    setLoad({ kind: 'loading' })
    try {
      const planCells = await listKitchenPlans(logDate, nextStream)
      setCells(planCells)
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'error' })
    }
  }, [logDate])

  // Plan qty for (item, current movement) — 0 when no plan row yet.
  const qtyOf = useCallback(
    (wipItemId: string): number =>
      cells.find(c => c.wip_item_id === wipItemId && movementsEqual(c.movement, movement))?.qty_porsi ?? 0,
    [cells, movement],
  )

  // Persist one cell (FR-031 upsert). No-op when unchanged, offline, or no resolved stream.
  async function saveCell(wipItemId: string, nextQty: number) {
    if (!isOnline || !stream) return
    if (nextQty < 0) return
    const current = qtyOf(wipItemId)
    if (nextQty === current) return
    setSavingId(wipItemId)
    setSaveError('')
    try {
      const id = await upsertKitchenPlan({
        log_date: logDate,
        wip_item_id: wipItemId,
        branch_id: stream.branch.id,
        activity: stream.activity,
        action: movement.action,
        destination_branch_id: movement.destinationBranchId,
        qty_porsi: nextQty,
      })
      // Reflect the confirmed result in place (no view transition).
      setCells(prev => {
        const without = prev.filter(
          c => !(c.wip_item_id === wipItemId && movementsEqual(c.movement, movement)),
        )
        return [...without, { id, wip_item_id: wipItemId, movement, qty_porsi: nextQty }]
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

  // Client-side search + category filter + null-safe category grouping.
  const q = search.trim().toLowerCase()
  const visible = useMemo(
    () => items.filter(it =>
      (!q || it.name.toLowerCase().includes(q)) &&
      (category === 'All' || (it.category ?? '') === category)),
    [items, q, category],
  )
  const categories = ['All', ...Array.from(new Set(items.map(i => i.category ?? '').filter(Boolean))).sort()]
  const planGroups: DataTableGroup<WipItemOption>[] = useMemo(
    () => groupByCategory(visible).map(g => ({
      key: g.cat ?? '__uncategorised__',
      label: g.cat,
      rows: g.rows,
    })),
    [visible],
  )

  const planColumns: DataTableColumn<WipItemOption>[] = [
    {
      key: 'dish',
      header: t('kitchen.plan.col.dish'),
      cardLabel: '',
      render: item => (
        <span className="kp-dish">
          <span className="kp-name">{item.name}</span>
          {item.category && <span className="kp-cat">{item.category}</span>}
        </span>
      ),
    },
    {
      key: 'plan',
      header: t('kitchen.plan.col.plan'),
      numeric: true,
      render: item => isDesktop ? (
        <PlanQtyCell
          itemName={item.name}
          qty={qtyOf(item.id)}
          saving={savingId === item.id}
          justSaved={justSavedId === item.id}
          disabled={!isOnline || !stream}
          onSave={next => saveCell(item.id, next)}
        />
      ) : (
        <PlanQtyStepper
          itemName={item.name}
          qty={qtyOf(item.id)}
          saving={savingId === item.id}
          justSaved={justSavedId === item.id}
          disabled={!isOnline || !stream}
          onSave={next => saveCell(item.id, next)}
        />
      ),
    },
  ]

  const streamMissing = stream === null

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageTitle}
      jobSentence={t('job.cafe')}
      meta={
        <span className="kp-meta-line">
          <span className="kp-date tabular">{logDate}</span>
        </span>
      }
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : items.length === 0 ? 'empty' : saveError ? 'validation' : savingId ? 'saving' : 'default'}
    >
      {/* Derived KPI strip (P-1) — only when populated (plan §4.4) */}
      {load.kind === 'ready' && items.length > 0 && !hasPlannedItems && (
        <p className="kp-nothing-planned">{t('kitchen.plan.nothingPlannedYet')}</p>
      )}
      {load.kind === 'ready' && items.length > 0 && (
        <KitchenKpiStrip data={kpiData} isDesktop={isDesktop} />
      )}

      {!isOnline && (
        <div role="alert" className="kp-banner kp-banner-offline kp-block">
          {t('kitchen.plan.offline')}
        </div>
      )}
      {saveError && (
        <div role="alert" className="kp-banner kp-banner-error kp-block">{saveError}</div>
      )}
      {streamMissing && load.kind === 'ready' && (
        <div role="alert" className="kp-banner kp-banner-error kp-block">
          {t('kitchen.log.stream.missing')}
        </div>
      )}

      {load.kind === 'loading' && <LoadingShell count={3} />}

      {load.kind === 'error' && (
        <ErrorState
          message={t('common.loadFailed', { what: t('common.what.plan') })}
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {load.kind === 'ready' && items.length === 0 && (
        <EmptyState
          variant="blank"
          title={t('kitchen.empty.noActiveItems.title')}
          copy={t('kitchen.plan.empty.copy')}
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
            searchPlaceholder={t('kitchen.plan.searchPlaceholder')}
            ariaLabel={t('kitchen.plan.toolbarAria')}
          >
            <div className="kp-scope">
              <Select
                className="kp-scope-branch"
                aria-label={t('kitchen.log.stream.branchAria')}
                value={stream?.branch.id ?? ''}
                disabled={branches.length === 0}
                onChange={e => {
                  const branch = branches.find(b => b.id === e.target.value)
                  if (branch && stream) void applyStream({ ...stream, branch })
                }}
              >
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>{branchDisplayName(branch)}</option>
                ))}
              </Select>
              <Select
                className="kp-scope-activity"
                aria-label={t('kitchen.log.stream.activityAria')}
                value={stream?.activity ?? ''}
                disabled={!stream}
                onChange={e => {
                  if (stream) void applyStream({ ...stream, activity: e.target.value as typeof stream.activity })
                }}
              >
                {PRODUCTION_ACTIVITIES.map(activity => (
                  <option key={activity} value={activity}>{activityLabel(t, activity)}</option>
                ))}
              </Select>
              <MovementSeg
                value={movement}
                options={movementsForStream(branches)}
                branches={branches}
                onChange={setMovement}
              />
            </div>
          </KitchenToolbar>
          <DataTable
            columns={planColumns}
            rows={visible}
            groups={planGroups}
            isDesktop={isDesktop}
            state={visible.length > 0 ? 'ready' : 'empty'}
            emptyLabel={t('kitchen.filter.noMatch')}
            caption={t('kitchen.plan.caption')}
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
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.plan')}`
  const [from] = useState(wibToday) // horizon start = today WIB
  const [rows, setRows] = useState<PesananRow[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const isDesktop = useIsDesktop()

  const fetchHorizon = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      const branchRows = await listActiveBranches()
      const stream = defaultStreamFrom(branchRows)
      const data = stream ? await listPesanan(from, PESANAN_HORIZON_DAYS, stream) : []
      setBranches(branchRows)
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
      header: t('kitchen.plan.pesanan.col.item'),
      cardLabel: '',
      render: r => (
        <span className="kp-dish">
          <span className="kp-name">{r.wip_item_name}</span>
          {r.category && <span className="kp-cat">{r.category}</span>}
        </span>
      ),
    },
    {
      key: 'movement',
      header: t('kitchen.plan.pesanan.col.action'),
      render: r => deriveActionLabel(t, r.movement, branches),
    },
    { key: 'qty_porsi', header: t('kitchen.plan.pesanan.col.planned'), numeric: true },
  ]

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageTitle}
      jobSentence={t('job.cafe')}
      meta={
        <span className="kp-date tabular">
          {t('kitchen.plan.pesanan.meta.horizon', { days: PESANAN_HORIZON_DAYS })}
        </span>
      }
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : rows.length === 0 ? 'empty' : 'read-only'}
    >
      {load.kind === 'loading' && <LoadingShell count={3} />}

      {load.kind === 'error' && (
        <ErrorState
          message={t('common.loadFailed', { what: t('common.what.upcomingPlan') })}
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {load.kind === 'ready' && rows.length === 0 && (
        <EmptyState
          variant="awaiting"
          title={t('kitchen.plan.pesanan.empty.title')}
          copy={t('kitchen.plan.pesanan.empty.copy', { days: PESANAN_HORIZON_DAYS })}
        />
      )}

      {load.kind === 'ready' && rows.length > 0 && (
        <DataTable
          columns={pesananColumns}
          rows={rows}
          groups={pesananGroups}
          isDesktop={isDesktop}
          caption={t('kitchen.plan.pesanan.caption')}
        />
      )}
    </PageFamilyFrame>
  )
}
