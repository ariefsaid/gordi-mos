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
import { HelpTip } from '@/components/ui/help-tip'
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
import { ActionTypeSeg, actionTypeLabel } from '@/components/kitchen/action-type-seg'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { PlanQtyField } from '@/components/kitchen/plan-qty-field'
import { groupByCategory } from '@/lib/kitchen-category'
import {
  DataTable,
  type DataTableColumn,
  type DataTableGroup,
} from '@/components/dashboard/data-table'
import { usePlanKpis } from '@/lib/kitchen-plan-kpis'
import './kitchen-plan-page.css'

// WIB "today" as YYYY-MM-DD (fixed +7h offset, NFR-007) — matches the other kitchen pages.
function wibToday(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const shifted = new Date(Date.now() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

// v4 (H4/H7 drill target): a planned dish leads to its Café · Log entry point, on BOTH
// faces of this page, so the plan→produce journey is one navigable path instead of two
// disconnected screens. Reuses Café · Log's own `q` URL-synced search param
// (useSearchParamState in kitchen-log-page.tsx) to land pre-filtered to this exact dish,
// not just the module's front door — and the app's row-link grammar (the identity cell
// IS the link — task-row-link, src/components/tasks/task-row.tsx) rather than a bespoke
// button.
function cafeLogHref(itemName: string): string {
  return `/cafe/log?q=${encodeURIComponent(itemName)}`
}

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready' }

export function KitchenPlanPage() {
  const auth = useAuth()
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('doc.cafePlan') }))
  // I18N sweep: reuse the existing nav.cafe.* family instead of a literal "Café · Plan".
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
  // I18N sweep: reuse the existing nav.cafe.* family instead of a literal "Café · Plan".
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.plan')}`
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
  // Derived plan KPIs (P-1) — pure view over `cells` for the current action. `cells` only
  // updates from a CONFIRMED upsertKitchenPlan result (see saveCell below), never from an
  // unsaved draft, so plannedTotal/plannedDishCount are real sourced figures (DD-7 —
  // unlike Log's old typed-not-submitted total, this one is safe to keep).
  const kpis = usePlanKpis(cells, action)

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

  // Plan editor columns: Dish · Plan (editable cell).
  // v4 (layout/distill pass): the desktop dish cell no longer repeats the category —
  // planGroups groups these SAME items by category, so every non-uncategorised row sat
  // under a group header stating the exact string it then printed again underneath the
  // name. Mirrors the "don't repeat a value the row/card already renders as its own
  // column/field" rule (DESIGN.md Do's and Don'ts, v4) that dropped Café · Log's row
  // category for the same reason.
  // v4 (typed-qty port): these columns are the DESKTOP table only. The phone path goes
  // through `renderCard` below, so the old `isDesktop ? PlanQtyCell : PlanQtyStepper`
  // ternary here had an unreachable second branch — DataTable ignores `columns` entirely
  // once `renderCard` is supplied. Dropped rather than left as a decoy phone path.
  //
  // v4 (H4/H7 drill target): the dish name is now the row link to Café · Log (cafeLogHref
  // above) — same identity-cell-is-the-link grammar as the phone card below.
  //
  // v4 (DD-5 desktop-qty port): the desktop cell used to be PlanQtyCell — a −/+ stepper —
  // while the phone card next to it already typed the value (DD-5: the owner killed
  // increment-to-plan on Café · Log because "mostly are 10-20+... incremental is just too
  // tedious", and Plan is the same job on the next screen). PlanQtyCell/qty-cell.css are
  // left in place (their own test suite covers them; the owner has deferred test work) but
  // are no longer wired to a live surface — this cell now renders the SAME typed field as
  // the phone card, PlanQtyField(dense), not a third variant.
  const planColumns: DataTableColumn<WipItemOption>[] = [
    {
      key: 'dish',
      header: t('kitchen.plan.col.dish'),
      render: item => (
        <Link
          to={cafeLogHref(item.name)}
          className="kp-name kp-row-link"
          aria-label={t('kitchen.plan.row.logAria', { item: item.name })}
        >
          {item.name}
        </Link>
      ),
    },
    {
      key: 'plan',
      header: t('kitchen.plan.col.plan'),
      numeric: true,
      render: item => {
        const saving = savingId === item.id
        const saved = !saving && justSavedId === item.id
        return (
          <div className="kp-cell-qty">
            <PlanQtyField
              itemName={item.name}
              qty={qtyOf(item.id)}
              disabled={!isOnline}
              onSave={next => saveCell(item.id, next)}
              dense
            />
            {(saving || saved) && (
              <span className="kp-cell-status" role="status" aria-live="polite">
                {saving
                  ? t('kitchen.plan.saving')
                  : <><span className="kp-cell-tick" aria-hidden="true">✓</span> {t('kitchen.plan.saved')}</>}
              </span>
            )}
          </div>
        )
      },
    },
  ]

  // v4 — the phone plan-capture row (DESIGN.md "Compact capture row", supplied through
  // DataTable's renderCard seam — the same v4 pattern Café · Log's renderLogCard uses).
  // Identity left, the control right where the thumb is, and a muted meta line beneath
  // that renders ONLY when it has something to say. Category is dropped for the same
  // reason as the desktop column above: the group header already names it.
  //
  // v4 (typed-qty port, DD-5): the control is PlanQtyField — one typed number — not the
  // −/+ PlanQtyStepper. Planning a dish at 25 portions cost 25 taps; the owner already
  // ordered this pattern killed on Café · Log ("mostly are 10-20+. incremental is just
  // too tedious"), and Plan is the same job on the next screen.
  //
  // Commit state moved OUT of the control and onto the meta line. Saving… / ✓ Saved used
  // to sit inline beside the stepper, which widened the row's control cluster mid-save and
  // reflowed the dish name around it — a layout shift at the exact moment the user wants
  // confirmation to hold still. Below the row it says the same thing without moving the
  // control, and at rest a committed row says nothing at all.
  const renderPlanCard = (item: WipItemOption) => {
    const saving = savingId === item.id
    const saved = !saving && justSavedId === item.id
    return (
      <div className="kp-card">
        <div className="kp-card-head">
          <Link
            to={cafeLogHref(item.name)}
            className="kp-card-name kp-row-link"
            aria-label={t('kitchen.plan.row.logAria', { item: item.name })}
          >
            {item.name}
          </Link>
          <PlanQtyField
            itemName={item.name}
            qty={qtyOf(item.id)}
            disabled={!isOnline}
            onSave={next => saveCell(item.id, next)}
          />
        </div>
        {(saving || saved) && (
          <div className="kp-card-meta" role="status" aria-live="polite">
            {saving
              ? t('kitchen.plan.saving')
              : <><span className="kp-card-tick" aria-hidden="true">✓</span> {t('kitchen.plan.saved')}</>}
          </div>
        )}
      </div>
    )
  }

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageTitle}
      jobSentence={t('job.cafe')}
      /* v4 (DD-1): the standalone KitchenKpiStrip + DataProvenanceNote band — the exact
         device DD-1 removed from Café Log — used to open this capture surface above the
         toolbar (~85px before a single row was visible). Folded into ONE page-head meta
         line instead, mirroring kitchen-log-page.tsx's kl-meta-line/kl-plan-sum: date +
         the planned total, only when there is one. plannedTotal/plannedDishCount come from
         `cells`, which only updates from a CONFIRMED save (never an unsaved draft), so —
         unlike the figures DD-7 removed on Log — these are real sourced numbers, safe to
         keep. "Nothing planned yet" needs no separate note: the summary line simply renders
         nothing when plannedTotal is 0 (metric summary rule — omit, don't restate zero). */
      meta={
        <span className="kp-meta-line">
          {/* polish (2026-07-28): H10 was the weakest heuristic app-wide (2.0/4) and this was
              the only scored surface with NO in-app help. Nothing on the screen says the typed
              number becomes Café Log's placeholder, or that there is no Submit — the two things
              a first-time planner cannot infer. Rides the existing meta line (DD-15). */}
          <HelpTip label={t('kitchen.plan.help')} />
          <span className="kp-date tabular">{logDate}</span>
          {load.kind === 'ready' && kpis.plannedTotal > 0 && (
            <span className="kp-plan-sum">
              {t('kitchen.kpi.plannedTotal')} <strong className="tabular">{kpis.plannedTotal}</strong>
              <span className="kp-plan-dishes tabular">{kpis.plannedDishCount}</span>
            </span>
          )}
        </span>
      }
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : items.length === 0 ? 'empty' : saveError ? 'validation' : savingId ? 'saving' : 'default'}
    >

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
          message={t('common.loadFailed', { what: t('common.what.plan') })}
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {load.kind === 'ready' && items.length === 0 && (
        // 'blank' — no WIP items are configured yet (an admin task), not a data source that
        // will fill on its own; never the 'quiet' ✓ (that would misread as "nothing to plan,
        // all done" instead of "nothing CAN be planned until items exist").
        <EmptyState
          variant="blank"
          title={t('kitchen.empty.noActiveItems.title')}
          copy={t('kitchen.plan.empty.copy')}
        />
      )}

      {load.kind === 'ready' && items.length > 0 && (
        <div className="kp-block">
          {/* v4 chrome merge: the action_type seg used to be its own bordered band stacked
              above this one — two utility strips for one row of controls. It is now the
              toolbar's LEADING scope slot (it decides what "Plan" means for every row, so it
              outranks the filters). It also stops rendering in the loading/error/empty states,
              where it was a disabled control over a list that does not exist yet. */}
          <KitchenToolbar
            search={search}
            onSearchChange={setSearch}
            categories={categories}
            category={category}
            onCategoryChange={setCategory}
            searchPlaceholder={t('kitchen.plan.searchPlaceholder')}
            ariaLabel="Plan scope and filters"
          >
            <ActionTypeSeg value={action} onChange={setAction} />
          </KitchenToolbar>
          <DataTable
            columns={planColumns}
            rows={visible}
            groups={planGroups}
            renderCard={renderPlanCard}
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
  // I18N sweep: reuse the existing nav.cafe.* family instead of a literal "Café · Plan".
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.plan')}`
  const [from] = useState(wibToday) // horizon start = today WIB
  const [rows, setRows] = useState<PesananRow[]>([])
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const isDesktop = useIsDesktop()
  // Nielsen sweep (Café·Plan 16/32): the 14-day horizon ran to ~231 items with no way to
  // narrow it — Log's KitchenToolbar search + category filter, ported rather than a second
  // filter grammar invented for this face (URL-synced, same as Log/PlanEditor — I7 / D-E1).
  // Day grouping (below) already existed; this adds the missing filter on top of it.
  const [search, setSearch] = useSearchParamState('q', '')
  const [category, setCategory] = useSearchParamState('category', 'All')

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

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(rows.map(r => r.category ?? '').filter(Boolean))).sort()],
    [rows],
  )
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r =>
      (!q || r.wip_item_name.toLowerCase().includes(q)) &&
      (category === 'All' || (r.category ?? '') === category))
  }, [rows, search, category])

  // Group the filtered rows by date (already date-sorted by the query) for the read view.
  const pesananGroups: DataTableGroup<PesananRow>[] = useMemo(() => {
    const byDate = new Map<string, PesananRow[]>()
    for (const r of visibleRows) {
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
  }, [visibleRows])

  // Read-only pesanan columns: Item (name + category sub-label) · Action · Planned.
  // No edit affordance (AC-024) — the qty is a plain tabular number, no stepper.
  //
  // v4 (H4/H7 drill target): the item is the ONE affordance this read-only face gets —
  // it leads to Café · Log, pre-filtered to this dish (cafeLogHref above), so a viewer
  // who can only look at the plan still has somewhere to go act on it.
  const pesananColumns: DataTableColumn<PesananRow>[] = [
    {
      key: 'item',
      header: t('kitchen.plan.pesanan.col.item'),
      cardLabel: '', // the phone card title line
      render: r => (
        <Link
          to={cafeLogHref(r.wip_item_name)}
          className="kp-dish kp-row-link"
          aria-label={t('kitchen.plan.row.logAria', { item: r.wip_item_name })}
        >
          <span className="kp-name">{r.wip_item_name}</span>
          {r.category && <span className="kp-cat">{r.category}</span>}
        </Link>
      ),
    },
    {
      key: 'action_type',
      header: t('kitchen.plan.pesanan.col.action'),
      render: r => actionTypeLabel(t, r.action_type),
    },
    { key: 'qty_porsi', header: t('kitchen.plan.pesanan.col.planned'), numeric: true },
  ]

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageTitle}
      jobSentence={t('job.cafe')}
      meta={
        // census FLAG-D: labeled meta sentence, not a naked count chip ("N planned · next 14 days").
        // v4 (header/filter honesty): this used to count `rows` (the full unfiltered fetch)
        // while the table below rendered `visibleRows` (search + category filtered) — a
        // scorer caught the two disagreeing the moment a filter was active. Counting the
        // same set that is actually on screen makes the header true in every state,
        // filtered or not (no filter active → the two counts are equal anyway).
        <span className="kp-meta">
          {load.kind === 'ready' && `${t('kitchen.plan.pesanan.meta.plannedCount', { count: visibleRows.length })} · `}
          <span className="kp-date tabular">{t('kitchen.plan.pesanan.meta.horizon', { days: PESANAN_HORIZON_DAYS })}</span>
        </span>
      }
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : rows.length === 0 ? 'empty' : 'read-only'}
    >

      {/* v4 (H1/H10 legibility): this face renders no editable affordance by design
          (client role gate mirrors the server's RLS — see canEdit above); it used to say
          nothing about why or what to do instead, which a scorer flagged as the surface's
          deepest problem for its PRIMARY user. Names the gate and points at the one thing
          this viewer can do (log the dish — the row link above, and this general door). */}
      <p className="kp-readonly-note">
        {t('kitchen.plan.pesanan.readOnlyNote')}{' '}
        {/* v4 note: composed from dest.cafe + nav.cafe.log (same as pageTitle above), not a
            baked "Café · Log" literal — stays "Buka Kafe · Log" in `id`, matching the
            breadcrumb, instead of mixing an untranslated "Café" into Indonesian body copy. */}
        <Link to="/cafe/log" className="kp-readonly-cta">
          {t('kitchen.plan.pesanan.openLogVerb')} {t('dest.cafe')} · {t('nav.cafe.log')} →
        </Link>
      </p>

      {load.kind === 'loading' && <LoadingShell count={3} />}

      {load.kind === 'error' && (
        <ErrorState
          message={t('common.loadFailed', { what: t('common.what.upcomingPlan') })}
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {load.kind === 'ready' && rows.length === 0 && (
        // 'awaiting' — the plan source exists and will fill as the lead plans ahead (matches
        // the sibling "Nothing to review" / "No pushes yet" awaiting pattern on kitchen-review
        // / kitchen-pushes), never the 'quiet' ✓ earned-all-clear.
        <EmptyState
          variant="awaiting"
          title={t('kitchen.plan.pesanan.empty.title')}
          copy={t('kitchen.plan.pesanan.empty.copy', { days: PESANAN_HORIZON_DAYS })}
        />
      )}

      {load.kind === 'ready' && rows.length > 0 && (
        <div className="kp-block">
          <KitchenToolbar
            search={search}
            onSearchChange={setSearch}
            categories={categories}
            category={category}
            onCategoryChange={setCategory}
            searchPlaceholder={t('kitchen.log.searchPlaceholder')}
            ariaLabel="Upcoming plan filters"
          />
          <DataTable
            columns={pesananColumns}
            rows={visibleRows}
            groups={pesananGroups}
            isDesktop={isDesktop}
            state={visibleRows.length > 0 ? 'ready' : 'empty'}
            emptyLabel={t('kitchen.filter.noMatch')}
            caption={`Planned items — next ${PESANAN_HORIZON_DAYS} days`}
          />
        </div>
      )}
    </PageFamilyFrame>
  )
}
