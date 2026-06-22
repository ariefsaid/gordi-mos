// KitchenPlanPage — /mos/kitchen/plan — S2 plan editor + 14-day "pesanan" horizon.
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S2.
// Two faces of one route, role-gated (member-read / lead-edit — NOT a forbidden wall):
//   • ops_lead/admin → EDITOR: set qty_porsi per (date, item, action_type); save is an
//     upsert/replace (FR-031); a quiet "saved" confirms in place (no view transition).
//   • member        → PESANAN: read-only 14-day forward horizon of planned items
//     (FR-035, AC-024) — grouped by date, NO logging/approve/edit affordance.
// Proves (unit): AC-024 (member read-only horizon), FR-030/031 (lead edit → upsert,
// payload never carries org_id/plan_by). All states: loading, empty, error+retry,
// saving/saved, offline (online-only writes, NFR-008), read-only, unauthenticated.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useAuth } from '@/auth/use-auth'
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
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { KitchenKpiStrip } from '@/components/kitchen/kitchen-kpi-strip'
import { KitchenPlanTable } from '@/components/kitchen/kitchen-plan-table'
import { KitchenPlanCards } from '@/components/kitchen/kitchen-plan-cards'
import { usePlanKpis } from '@/lib/kitchen-plan-kpis'
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
  useDocumentTitle('Kitchen Plan — Gordi MOS')
  const auth = useAuth()

  // Role split (member-read / lead-edit). RLS is the authority; this picks the face.
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const canEdit = accessRoles.includes('ops_lead') || accessRoles.includes('admin')

  if (auth.status === 'loading') {
    return <PageFrame><LoadingState /></PageFrame>
  }
  if (auth.status === 'unauthenticated' || auth.status === 'orphan') {
    return (
      <PageFrame>
        <div className="kp-block kp-forbidden">
          <p className="kp-forbidden-msg">You need to sign in to view the kitchen plan.</p>
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        </div>
      </PageFrame>
    )
  }

  return canEdit ? <PlanEditor /> : <PesananView />
}

// ════════════════════════════════════════════════════════════════════════════
// ops_lead / admin — the plan EDITOR (FR-030/031)
// ════════════════════════════════════════════════════════════════════════════
function PlanEditor() {
  const [logDate] = useState(wibToday) // today WIB (date stepper deferred — owner OQ-7)
  const [action, setAction] = useState<KitchenActionType>('Production')
  const [items, setItems] = useState<WipItemOption[]>([])
  const [cells, setCells] = useState<PlanCell[]>([])
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const [savingId, setSavingId] = useState<string | null>(null) // wip_item_id mid-save
  const [notice, setNotice] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  // NEW presentational state (P-3): reflow branch + client-side search/category filter.
  const isDesktop = useIsDesktop()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  // Derived plan KPIs (P-1) — pure view over `cells` for the current action.
  const kpis = usePlanKpis(cells, action)

  useEffect(() => {
    function on() { setIsOnline(true) }
    function off() { setIsOnline(false) }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

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
    setNotice('')
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
      setNotice('Saved')
    } catch (err) {
      setSaveError(err instanceof Error ? `Couldn't save — ${err.message}` : "Couldn't save — please try again.")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <PageFrame variant="data">
      <PageHead
        variant="content"
        title="Kitchen · Plan"
        count={load.kind === 'ready' ? items.length : null}
        meta={<span className="kp-date tabular">{logDate}</span>}
      />

      {/* Derived KPI strip (P-1) — only when populated (plan §4.4) */}
      {load.kind === 'ready' && items.length > 0 && (
        <KitchenKpiStrip kpis={kpis} isDesktop={isDesktop} />
      )}

      <div className="kp-seg-wrap kp-block">
        <ActionTypeSeg value={action} onChange={setAction} disabled={load.kind !== 'ready'} />
      </div>

      {!isOnline && (
        <div role="alert" className="kp-banner kp-banner-offline kp-block">
          You're offline — editing the plan needs a connection. Reconnect to save.
        </div>
      )}
      {notice && (
        <div role="status" aria-live="polite" className="kp-banner kp-banner-notice kp-block">
          {notice}
        </div>
      )}
      {saveError && (
        <div role="alert" className="kp-banner kp-banner-error kp-block">{saveError}</div>
      )}

      {load.kind === 'loading' && <LoadingState />}

      {load.kind === 'error' && (
        <ErrorState
          message="Couldn't load the plan — check your connection."
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {load.kind === 'ready' && items.length === 0 && (
        <EmptyState
          title="No active WIP items"
          copy="Ask an admin to add kitchen items first."
        />
      )}

      {load.kind === 'ready' && items.length > 0 && (
        isDesktop ? (
          <KitchenPlanTable
            items={items}
            qtyOf={qtyOf}
            savingId={savingId}
            disabled={!isOnline}
            onSave={saveCell}
            search={search}
            onSearchChange={setSearch}
            category={category}
            onCategoryChange={setCategory}
          />
        ) : (
          <KitchenPlanCards
            items={items}
            qtyOf={qtyOf}
            savingId={savingId}
            disabled={!isOnline}
            onSave={saveCell}
            search={search}
            onSearchChange={setSearch}
            category={category}
            onCategoryChange={setCategory}
          />
        )
      )}
    </PageFrame>
  )
}

// (The plan editor's inline PlanRow was lifted into PlanQtyCell (desktop) +
// PlanQtyStepper (phone) — see components/kitchen/.)

// ════════════════════════════════════════════════════════════════════════════
// member — the read-only PESANAN horizon (FR-035 / AC-024)
// ════════════════════════════════════════════════════════════════════════════
function PesananView() {
  const [from] = useState(wibToday) // horizon start = today WIB
  const [rows, setRows] = useState<PesananRow[]>([])
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)

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
  const groups = useMemo(() => {
    const byDate = new Map<string, PesananRow[]>()
    for (const r of rows) {
      const list = byDate.get(r.log_date) ?? []
      list.push(r)
      byDate.set(r.log_date, list)
    }
    return [...byDate.entries()].map(([date, items]) => ({ date, items }))
  }, [rows])

  return (
    <PageFrame>
      <PageHead
        variant="content"
        title="Kitchen · Pesanan"
        count={load.kind === 'ready' ? rows.length : null}
        meta={<span className="kp-date tabular">next {PESANAN_HORIZON_DAYS} days</span>}
      />

      {load.kind === 'loading' && <LoadingState />}

      {load.kind === 'error' && (
        <ErrorState
          message="Couldn't load the upcoming plan — check your connection."
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {load.kind === 'ready' && rows.length === 0 && (
        <EmptyState
          title="Nothing planned"
          copy={`No planned items in the next ${PESANAN_HORIZON_DAYS} days yet.`}
        />
      )}

      {load.kind === 'ready' && rows.length > 0 && (
        <div className="kp-pesanan kp-block">
          {groups.map(group => (
            <section key={group.date} className="kp-day" aria-label={`Plan for ${group.date}`}>
              <div className="kp-day-head">
                <span className="kp-day-date tabular">{group.date}</span>
                <span className="kp-day-count tabular">{group.items.length}</span>
              </div>
              <table className="kp-table">
                <caption className="sr-only">Planned items for {group.date}</caption>
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">Action</th>
                    <th scope="col" className="kp-num-head">Planned</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map(r => (
                    <tr key={`${r.wip_item_id}-${r.action_type}`}>
                      <td className="kp-item">{r.wip_item_name}</td>
                      <td className="kp-action">{r.action_type}</td>
                      <td className="kp-num tabular">{r.qty_porsi}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </PageFrame>
  )
}

function LoadingState() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="kp-block">
      <SkeletonRows count={3} />
    </div>
  )
}
