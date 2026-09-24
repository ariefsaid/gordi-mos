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
import { isItemNotOnStreamError, listActiveWipItems, listStreamItemIds } from '@/lib/db/kitchen-logs'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { listKitchenPlans, listPesanan, upsertKitchenPlan } from '@/lib/db/kitchen-plans'
import type {
  KitchenMovement,
  PesananRow,
  PlanCell,
  ProductionStream,
  WipItemOption,
} from '@/lib/db/kitchen-logs.types'
import { PESANAN_HORIZON_DAYS } from '@/lib/db/kitchen-logs.types'
import {
  deriveActionLabel,
  movementsEqual,
  movementsForStream,
  PRODUCE,
  streamLabel,
  streamProduces,
} from '@/lib/kitchen-action-label'
import { MovementSeg } from '@/components/kitchen/movement-seg'
import { CafeStreamBar } from '@/components/kitchen/cafe-stream-bar'
import { NotOnStreamTag } from '@/components/kitchen/not-on-stream-tag'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { MetricSummaryRule } from '@/components/kitchen/metric-summary-rule'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { PlanQtyField } from '@/components/kitchen/plan-qty-field'
import { groupByCategory } from '@/lib/kitchen-category'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'
import {
  DataTable,
  type DataTableColumn,
  type DataTableGroup,
} from '@/components/dashboard/data-table'
import { usePlanSummary } from '@/lib/kitchen-plan-kpis'
import { formatWeekdayDayMonth } from '@/lib/format/date'
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
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const t = useT()
  // issue 455: the tab names the module the rail and breadcrumb name; leaf-first per
  // the catalog's own docTitle convention (tasks-layout, signals-archive).
  useDocumentTitle(t('common.docTitle', { page: `${t('nav.cafe.plan')} · ${t('nav.cafe')}` }))
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

  // Routes stay mounted when the signed-in person changes. The whole view owns catalog, rows,
  // drafts, and load state for one viewer, so remount it at that boundary instead of briefly
  // presenting one person's in-memory plan to the next person.
  return canEdit
    ? <PlanEditor key={viewerId} />
    : <PesananView key={viewerId} />
}

// ════════════════════════════════════════════════════════════════════════════
// ops_lead / admin — the plan EDITOR (FR-030/031)
// ════════════════════════════════════════════════════════════════════════════
// The rows a stream's plan shows: its listed items, plus any item already planned there (#222).
function streamRows(items: WipItemOption[], offered: Set<string>, planCells: PlanCell[]): WipItemOption[] {
  return items.filter(item => offered.has(item.id) || planCells.some(cell => cell.wip_item_id === item.id))
}

function PlanEditor() {
  const t = useT()
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.plan')}`
  const [logDate] = useState(wibToday) // today WIB (date stepper deferred — owner OQ-7)
  // The enumerable stream catalog (FR-005) — the head picker's options (#440). The branch
  // catalog comes with it: the MOVEMENT control derives its destinations from the producing
  // stream catalog, which is a different question from which stream this plan belongs to.
  const cafeStream = useCafeStream()
  // OD-CAFE-1: plans are keyed on (org, date, item, branch, activity) — a plan row belongs to one
  // branch's books — so the picker offers this location's streams only. `streamOptions` stays whole
  // for the movement/destination derivation below.
  const { branches, options: streamOptions, locationOptions, stream } = cafeStream
  const { resolve: resolveStream, adopt: adoptStream, setStream: chooseStream } = cafeStream
  const streamMissing = stream === null
  const streamCanProduce = streamProduces(stream, streamOptions)
  const streamNonProducing = stream !== null && !streamCanProduce
  const planWriteClosed = streamMissing || streamNonProducing
  const movementOptions = stream ? movementsForStream(stream, streamOptions) : []
  const receivingOnlyNotice = (
    <section className="kp-receiving-only" role="status" aria-labelledby="kp-receiving-only-title">
      <div className="kp-receiving-only-copy">
        <h2 id="kp-receiving-only-title" className="kp-receiving-only-title">
          {t('kitchen.stream.receivingOnly.title')}
        </h2>
        <p className="kp-receiving-only-note">
          {t('kitchen.stream.receivingOnly.body')}
        </p>
      </div>
      <Link to="/cafe/stock" className="btn btn-outline btn-touch kp-receiving-only-cta">
        {t('kitchen.stream.receivingOnly.stockCta')}
      </Link>
    </section>
  )
  const [movement, setMovement] = useState<KitchenMovement>(PRODUCE)
  const [items, setItems] = useState<WipItemOption[]>([])
  // The stream's item list (#222). New plan rows are offered only for these; a row already
  // planned for any other item stays on screen, labelled, with its quantity editable.
  const [offeredIds, setOfferedIds] = useState<Set<string>>(new Set())
  const [cells, setCells] = useState<PlanCell[]>([])
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const requestGen = useRef(0)
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
  // #401 / DD-WAY-40: the figures band is the Metric summary rule (two numbers for
  // the current movement) — the retired word-tiles are gone. Pure derivation over
  // `cells`.
  const summary = usePlanSummary(cells, movement)

  useEffect(() => {
    function on() { setIsOnline(true) }
    function off() { setIsOnline(false) }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Clear the transient ✓ Saved timer on unmount so it can't setState after teardown.
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current) }, [])

  // #440: the plan editor used to open on `defaultStreamFrom` — the catalog's first branch,
  // a guess that has nothing to do with the person or with what they were just looking at.
  // It now resolves the module's stream: whatever was chosen elsewhere in Café this session,
  // else the person's own stream (shared.default_stream(), FR-001), else an explicit choice.
  const fetchEditor = useCallback(async () => {
    const gen = ++requestGen.current
    setLoad({ kind: 'loading' })
    try {
      const [itemRows, catalog] = await Promise.all([listActiveWipItems(), resolveStream()])
      const [planCells, offered] = catalog.stream
        ? await Promise.all([listKitchenPlans(logDate, catalog.stream), listStreamItemIds(catalog.stream)])
        : [[], null]
      if (gen !== requestGen.current) return
      // No stream yet: every item, read-only until a stream is chosen (planWriteClosed).
      setItems(offered ? streamRows(itemRows, offered, planCells) : itemRows)
      setOfferedIds(offered ?? new Set())
      adoptStream(catalog)
      setMovement(PRODUCE)
      setCells(planCells)
      setLoad({ kind: 'ready' })
    } catch {
      if (gen === requestGen.current) setLoad({ kind: 'error' })
    }
  }, [logDate, resolveStream, adoptStream])

  useEffect(() => { fetchEditor() }, [fetchEditor, retryKey])

  // Switching the stream re-reads the plan — a different (branch, activity) has its own
  // plan rows entirely, same as the capture surface's applyStream (#196).
  const applyStream = useCallback(async (nextStream: ProductionStream) => {
    const gen = ++requestGen.current
    chooseStream(nextStream) // the whole Café module follows this choice (#440)
    setMovement(PRODUCE)
    setLoad({ kind: 'loading' })
    try {
      const [itemRows, planCells, offered] = await Promise.all([
        listActiveWipItems(), listKitchenPlans(logDate, nextStream), listStreamItemIds(nextStream),
      ])
      if (gen !== requestGen.current) return
      setItems(streamRows(itemRows, offered, planCells))
      setOfferedIds(offered)
      setCells(planCells)
      setLoad({ kind: 'ready' })
    } catch {
      if (gen === requestGen.current) setLoad({ kind: 'error' })
    }
  }, [logDate, chooseStream])

  // A new plan row needs the item on the stream's list; an existing row keeps its quantity editable.
  const canPlan = useCallback(
    (wipItemId: string): boolean =>
      offeredIds.has(wipItemId)
      || cells.some(c => c.wip_item_id === wipItemId && movementsEqual(c.movement, movement)),
    [cells, movement, offeredIds],
  )
  const offList = (wipItemId: string) => stream !== null && !offeredIds.has(wipItemId)

  // Plan qty for (item, current movement) — 0 when no plan row yet.
  const qtyOf = useCallback(
    (wipItemId: string): number =>
      cells.find(c => c.wip_item_id === wipItemId && movementsEqual(c.movement, movement))?.qty_porsi ?? 0,
    [cells, movement],
  )

  // Persist one cell (FR-031 upsert). No-op when unchanged or offline; the stream and its
  // producer fact are checked again here so a closed/read-only surface cannot write.
  async function saveCell(wipItemId: string, nextQty: number) {
    if (!isOnline) return
    if (nextQty < 0) return
    if (!stream) {
      setSaveError(t('kitchen.log.stream.missing'))
      return
    }
    if (!streamCanProduce) {
      setSaveError(t('kitchen.plan.stream.nonProducing'))
      return
    }
    const current = qtyOf(wipItemId)
    if (!canPlan(wipItemId)) return
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
      if (isItemNotOnStreamError(err)) {
        // The list changed while the editor was open (#222): re-read it so the row reads as off-list.
        setSaveError(t('kitchen.plan.error.itemNotOnStream'))
        listStreamItemIds(stream).then(setOfferedIds, () => {})
      } else {
        setSaveError(err instanceof Error ? `Couldn't save — ${err.message}` : "Couldn't save — please try again.")
      }
    } finally {
      setSavingId(null)
    }
  }

  // Client-side search + category filter + null-safe category grouping.
  const q = search.trim().toLowerCase()
  // Category is a desktop-only control; preserve the URL state for a later desktop return,
  // but never apply an invisible filter while the phone face cannot clear it.
  const effectiveCategory = isDesktop ? category : 'All'
  const visible = useMemo(
    () => items.filter(it =>
      (!q || it.name.toLowerCase().includes(q)) &&
      (effectiveCategory === 'All' || (it.category ?? '') === effectiveCategory)),
    [items, q, effectiveCategory],
  )
  const categories = ['All', ...Array.from(new Set(items.map(i => i.category ?? '').filter(Boolean)))
    .sort((a, b) => kitchenCategoryLabel(t, a).localeCompare(kitchenCategoryLabel(t, b)))]
  // One destination for the whole screen, stated once, at every width, rendered beside the
  // toolbar below.
  const planGroups: DataTableGroup<WipItemOption>[] = useMemo(
    () => groupByCategory(visible).map(g => ({
      key: g.cat ?? '__uncategorised__',
      label: g.cat ? kitchenCategoryLabel(t, g.cat) : g.cat,
      rows: g.rows,
    })),
    [visible, t],
  )

  const planItemColumn: DataTableColumn<WipItemOption> = {
    key: 'dish',
    header: t('kitchen.plan.col.item'),
    cardLabel: '',
    render: item => (
      <span className="kp-dish">
        <span className="kp-name">{item.name}</span>
        {offList(item.id) && <NotOnStreamTag />}
        {item.category && <span className="kp-cat">{kitchenCategoryLabel(t, item.category)}</span>}
      </span>
    ),
  }

  const planColumns: DataTableColumn<WipItemOption>[] = [
    planItemColumn,
    {
      key: 'plan',
      header: t('kitchen.plan.col.plan'),
      numeric: true,
      // v4 (DD-5 typed-qty port): both viewports render the SAME typed field —
      // PlanQtyField — not the retired −/+ PlanQtyCell/PlanQtyStepper pair. Planning a
      // dish at 25 portions cost 25 taps; the owner already ordered this pattern killed
      // on Café · Log ("the production is not logged incrementally. it should be typed
      // in the amount being produced. mostly are 10-20+. incremental is just too
      // tedious"), and Plan is the same job on the next screen. Desktop gets the dense
      // (32px pointer-surface) sizing; the phone card keeps the 44px touch floor.
      // Commit state (Saving… / ✓ Saved) renders BESIDE the field at the page, only
      // when it has something to say — inline in the control it would reflow the row's
      // one input mid-entry.
      render: item => {
        const saving = savingId === item.id
        const saved = !saving && justSavedId === item.id
        return (
          <div className="kp-cell-qty">
            <PlanQtyField
              itemName={item.name}
              qty={qtyOf(item.id)}
              // #548 FR-006: a missing or receiving-only stream keeps the committed value
              // readable but closes the field; offline also pre-disables it. Commit state
              // renders beside the field at the page.
              disabled={!isOnline || planWriteClosed || !canPlan(item.id)}
              onSave={next => saveCell(item.id, next)}
              dense={isDesktop}
            />
            {(saving || saved) && (
              <span className="kp-cell-status" role="status" aria-live="polite">
                {saving
                  ? t('record.field.saving')
                  : <><span className="kp-cell-tick" aria-hidden="true">✓</span> {t('record.field.saved')}</>}
              </span>
            )}
          </div>
        )
      },
    },
  ]

  const receivingPlanColumns: DataTableColumn<WipItemOption>[] = [
    planItemColumn,
    {
      key: 'plan',
      header: t('kitchen.plan.col.plan'),
      numeric: true,
      render: item => {
        const quantity = qtyOf(item.id)
        return quantity > 0 ? quantity : '—'
      },
    },
  ]

  // #548 FR-007: Plan's phone face is the DESIGN.md compact capture row — identity left,
  // the typed plan field + unit right, no per-card field label. Same seam as Log
  // (renderCard → PhoneCard applies .dt-card--compact); the meta line renders ONLY when it
  // has something to say (commit state). No dense: the phone card keeps the 44px touch floor.
  const renderPlanCard = (item: WipItemOption) => {
    const saving = savingId === item.id
    const saved = !saving && justSavedId === item.id
    return (
      <div className="kp-card">
        <div className="kp-card-head">
          <span className="kp-card-name">
            {item.name}
            {offList(item.id) && <NotOnStreamTag />}
          </span>
          <PlanQtyField
            itemName={item.name}
            qty={qtyOf(item.id)}
            disabled={!isOnline || planWriteClosed || !canPlan(item.id)}
            onSave={next => saveCell(item.id, next)}
          />
        </div>
        {(saving || saved) && (
          <div className="kp-card-meta">
            <span className="kp-cell-status" role="status" aria-live="polite">
              {saving
                ? t('record.field.saving')
                : <><span className="kp-cell-tick" aria-hidden="true">✓</span> {t('record.field.saved')}</>}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageTitle}
      /* #440: the stream this plan is being written INTO, stated in the head and switched
         there — the same statement-and-switch every other Café surface carries, in the same
         place. It replaces the shared head's static job sentence (PageHead renders one or the
         other): which books a planned quantity lands in is what the number means. */
      statusRow={
        <CafeStreamBar
          options={locationOptions}
          stream={stream}
          onChange={next => { void applyStream(next) }}
        />
      }
      meta={
        <span className="kp-date tabular">{formatWeekdayDayMonth(logDate)}</span>
      }
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : streamNonProducing ? 'read-only' : items.length === 0 ? 'empty' : saveError ? 'validation' : savingId ? 'saving' : 'default'}
    >
      {/* #401 / DD-WAY-40: Plan is an ACT surface — its figures render as the DESIGN.md
          Metric summary rule: one inline line, no card, no width branch, never a tile
          row (OD-WAY-74 #2). No delta: a capture band has no state worth acting on. */}
      {load.kind === 'ready' && items.length > 0 && (
        <MetricSummaryRule
          ariaLabel={t(summary.ariaLabel)}
          metrics={summary.metrics.map(m => ({ key: m.key, label: t(m.label), value: m.value }))}
        />
      )}

      {!isOnline && (
        <div role="alert" className="kp-banner kp-banner-offline kp-block">
          {t('kitchen.plan.offline')}
        </div>
      )}
      {saveError && (
        <div role="alert" className="kp-banner kp-banner-error kp-block">{saveError}</div>
      )}
      {/* #548 FR-006: the precondition is a muted hint at rest (Log's .kl-submit-reason
          grammar, role="status" — programmatically associated as a live region, NFR-002).
          saveCell keeps the same guard as a defensive backstop if a caller bypasses the
          disabled field. */}
      {streamMissing && load.kind === 'ready' && (
        <p className="kp-stream-hint" role="status" aria-live="polite">
          {t('kitchen.log.stream.missing')}
        </p>
      )}
      {streamNonProducing && load.kind === 'ready' && (
        receivingOnlyNotice
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
          title={stream ? t('kitchen.streamItems.empty.title', { stream: streamLabel(t, stream) }) : t('kitchen.empty.noActiveItems.title')}
          copy={stream ? t('kitchen.streamItems.empty.copy') : t('kitchen.plan.empty.copy')}
        />
      )}

      {load.kind === 'ready' && items.length > 0 && (
        <div className="kp-block">
          <KitchenToolbar
            search={search}
            onSearchChange={setSearch}
            categories={isDesktop ? categories : undefined}
            categoryId="cafe-plan-category"
            categoryLabel={value => kitchenCategoryLabel(t, value)}
            category={isDesktop ? category : undefined}
            onCategoryChange={isDesktop ? setCategory : undefined}
            searchPlaceholder={t('kitchen.plan.searchPlaceholder')}
            ariaLabel={t('kitchen.plan.toolbarAria')}
          >
            {movementOptions.length > 0 && <div className="kp-scope">
              {/* #440: the branch × activity pair of selects that used to lead this block is
                  gone — it named the stream a SECOND way (and named Rumah Rames by the
                  'Bungur' alias, which names a transfer destination and never a stream), while
                  the head now names it once for the whole module. What stays is the movement:
                  a property of the rows, not of the books. */}
              {/* Same destination picker as capture (FR-013), with the same producer-aware
                  destination matrix. A plan for a movement the capture form cannot name is a
                  plan nobody fills. */}
              <MovementSeg
                value={movement}
                options={movementOptions}
                branches={branches}
                origin={stream}
                onChange={setMovement}
              />
            </div>}
          </KitchenToolbar>
          {/* ONE navigational affordance for the screen, present at every width. */}
          <p className="kp-log-link-row">
            <Link to="/cafe" className="kp-group-link">
              {t('kitchen.plan.group.log')}
            </Link>
          </p>
          <DataTable
            columns={streamNonProducing ? receivingPlanColumns : planColumns}
            rows={visible}
            groups={planGroups}
            renderCard={streamNonProducing ? undefined : renderPlanCard}
            isDesktop={isDesktop}
            state={visible.length > 0 ? 'ready' : 'empty'}
            emptyLabel={t('kitchen.filter.noMatch')}
            caption={streamNonProducing ? t('kitchen.stream.receivingOnly.planCaption') : t('kitchen.plan.caption')}
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
  const cafeStream = useCafeStream()
  // OD-CAFE-1: plans are keyed on (org, date, item, branch, activity) — a plan row belongs to one
  // branch's books — so the picker offers this location's streams only. `streamOptions` stays whole
  // for the movement/destination derivation below.
  const { branches, options: streamOptions, locationOptions, stream } = cafeStream
  const { resolve: resolveStream, adopt: adoptStream, setStream: chooseStream } = cafeStream
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const requestGen = useRef(0)
  const isDesktop = useIsDesktop()
  // #401: URL-synced search + category over the ~231-row horizon (v4's KitchenToolbar
  // port; Nielsen Café·Plan 16/32). Same keys as the editor face ('q'/'category') —
  // the faces are role-exclusive, so they never share a URL. Refresh/share keeps the
  // filtered view (I7 / D-E1).
  const [search, setSearch] = useSearchParamState('q', '')
  const [category, setCategory] = useSearchParamState('category', 'All')

  // #440: the horizon a floor member reads is THEIR stream's — it used to be
  // `defaultStreamFrom`, the catalog's first branch, so a Radiant barista read Gordi HQ's
  // pesanan and had no way to tell. Same resolution and same head control as every other
  // Café surface; switching is offered here too, because "what is the OTHER stream
  // planning" is a question the floor asks and reading a plan changes nothing.
  const fetchHorizon = useCallback(async () => {
    const gen = ++requestGen.current
    setLoad({ kind: 'loading' })
    try {
      const catalog = await resolveStream()
      const data = catalog.stream ? await listPesanan(from, PESANAN_HORIZON_DAYS, catalog.stream) : []
      if (gen !== requestGen.current) return
      adoptStream(catalog)
      setRows(data)
      setLoad({ kind: 'ready' })
    } catch {
      if (gen === requestGen.current) setLoad({ kind: 'error' })
    }
  }, [from, resolveStream, adoptStream])

  const applyStream = useCallback(async (next: ProductionStream) => {
    const gen = ++requestGen.current
    chooseStream(next) // the whole Café module follows this choice (#440)
    setLoad({ kind: 'loading' })
    try {
      const data = await listPesanan(from, PESANAN_HORIZON_DAYS, next)
      if (gen !== requestGen.current) return
      setRows(data)
      setLoad({ kind: 'ready' })
    } catch {
      if (gen === requestGen.current) setLoad({ kind: 'error' })
    }
  }, [from, chooseStream])

  useEffect(() => { fetchHorizon() }, [fetchHorizon, retryKey])

  // #401: client-side search + category over the read horizon (mirrors the editor).
  const q = search.trim().toLowerCase()
  // Same desktop-only category affordance as the editor: a deep-linked category must not
  // become an invisible row filter on the phone face.
  const effectiveCategory = isDesktop ? category : 'All'
  const visible = useMemo(
    () => rows.filter(r =>
      (!q || r.wip_item_name.toLowerCase().includes(q)) &&
      (effectiveCategory === 'All' || (r.category ?? '') === effectiveCategory)),
    [rows, q, effectiveCategory],
  )
  const categories = ['All', ...Array.from(new Set(rows.map(r => r.category ?? '').filter(Boolean)))
    .sort((a, b) => kitchenCategoryLabel(t, a).localeCompare(kitchenCategoryLabel(t, b)))]

  // Group the flat rows by date (already date-sorted by the query) for the read view.
  const pesananGroups: DataTableGroup<PesananRow>[] = useMemo(() => {
    const byDate = new Map<string, PesananRow[]>()
    for (const r of visible) {
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
  }, [visible])

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
          {r.category && <span className="kp-cat">{kitchenCategoryLabel(t, r.category)}</span>}
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
      statusRow={
        <CafeStreamBar
          options={locationOptions}
          stream={stream}
          onChange={next => { void applyStream(next) }}
        />
      }
      meta={
        <span className="kp-date tabular">
          {t('kitchen.plan.pesanan.meta.horizon', { days: PESANAN_HORIZON_DAYS })}
        </span>
      }
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : rows.length === 0 ? 'empty' : 'read-only'}
    >
      {/* #401: the face floor staff actually get said nothing about why it cannot be
          edited — one sentence + the CTA to the surface where their work happens. */}
      {load.kind === 'ready' && stream !== null && !streamProduces(stream, streamOptions) ? (
        <section className="kp-receiving-only" role="status" aria-labelledby="kp-member-receiving-title">
          <div className="kp-receiving-only-copy">
            <h2 id="kp-member-receiving-title" className="kp-receiving-only-title">
              {t('kitchen.stream.receivingOnly.title')}
            </h2>
            <p className="kp-receiving-only-note">{t('kitchen.stream.receivingOnly.body')}</p>
          </div>
          <Link to="/cafe/stock" className="btn btn-outline btn-touch kp-receiving-only-cta">
            {t('kitchen.stream.receivingOnly.stockCta')}
          </Link>
        </section>
      ) : (
      <div className="kp-readonly kp-block">
        <p className="kp-readonly-note">
          {t('kitchen.plan.pesanan.readOnlyNote', { days: PESANAN_HORIZON_DAYS })}
        </p>
        <Link to="/cafe" className="btn btn-outline kp-readonly-cta">
          {t('kitchen.plan.pesanan.readOnlyCta')}
        </Link>
      </div>
      )}

      {load.kind === 'loading' && <LoadingShell count={3} />}

      {load.kind === 'error' && (
        <ErrorState
          message={t('common.loadFailed', { what: t('common.what.upcomingPlan') })}
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {/* #440: "nothing planned" and "no stream to read a plan against" are different facts, and
          the first one told as the second is how a person concludes the kitchen has no plan when
          they simply have no stream yet (FR-002). */}
      {load.kind === 'ready' && stream === null && (
        <EmptyState variant="blank" title={t('cafe.stream.none')} />
      )}

      {load.kind === 'ready' && stream !== null && rows.length === 0 && (
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
            categories={isDesktop ? categories : undefined}
            categoryId="cafe-plan-category"
            categoryLabel={value => kitchenCategoryLabel(t, value)}
            category={isDesktop ? category : undefined}
            onCategoryChange={isDesktop ? setCategory : undefined}
            searchPlaceholder={t('kitchen.plan.pesanan.searchPlaceholder')}
            ariaLabel={t('kitchen.plan.pesanan.toolbarAria')}
          />
          <DataTable
            columns={pesananColumns}
            rows={visible}
            groups={pesananGroups}
            isDesktop={isDesktop}
            state={visible.length > 0 ? 'ready' : 'empty'}
            emptyLabel={t('kitchen.filter.noMatch')}
            caption={t('kitchen.plan.pesanan.caption')}
          />
        </div>
      )}
    </PageFamilyFrame>
  )
}
