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
import { saveErrorMessage } from '@/lib/save-error'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useSearchParamState } from '@/lib/use-search-param-state'
import { isItemNotOnStreamError, listActiveWipItems, listStreamItemIds } from '@/lib/db/kitchen-logs'
import { cafeUnitDisplayLabel, listCafeItemSettings } from '@/lib/db/cafe-item-settings'
import type { CafeItemSetting } from '@/lib/db/cafe-item-settings'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { canEditCafePlan, isReviewerEligibleTeam } from '@/lib/kitchen-gates'
import { listCafeViewerTeams } from '@/lib/db/cafe-opening'
import type { CafeViewerTeam } from '@/lib/db/cafe-opening'
import { streamKey } from '@/lib/kitchen-action-label'
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
  movementKey,
  PRODUCE,
  streamLabel,
  streamProduces,
} from '@/lib/kitchen-action-label'
import { MovementSeg } from '@/components/kitchen/movement-seg'
import { CafeStreamBar, CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { NotOnStreamTag } from '@/components/kitchen/not-on-stream-tag'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { MetricSummaryRule } from '@/components/kitchen/metric-summary-rule'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { PlanQtyField } from '@/components/kitchen/plan-qty-field'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'
import {
  DataTable,
  type DataTableColumn,
} from '@/components/dashboard/data-table'
import {
  WIP_KIND_FILTER_OPTIONS,
  kitchenDataTableGroups,
  toKitchenListRows,
  useKitchenItemTable,
  type KitchenItemKindFilter,
  type KitchenListRow,
} from '@/lib/kitchen-item-list'
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
  // #784 AC-057: the stream's own supervisor edits too, not only ops_lead/admin (#778
  // widened plan-row writes on the database side to match Review's reviewer predicate).
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const canEdit = canEditCafePlan(accessRoles)

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
type PlanItem = WipItemOption & {
  defaultUnitName: string | null
  otherLogUnitNames: string[]
  currentKind: CafeItemSetting['kind']
  unavailableReason: 'inactive' | 'not-wip' | null
}

function withStreamSettings(
  items: WipItemOption[],
  settings: CafeItemSetting[],
  planCells: PlanCell[] = [],
): PlanItem[] {
  const plannedIds = new Set(planCells.map(cell => cell.wip_item_id))
  const visibleSettings = settings.filter(item =>
    (item.kind === 'WIP' && item.isActive) || plannedIds.has(item.id),
  )
  const byId = new Map(visibleSettings.map(item => [item.id, item]))
  const manualIds = new Set(items.map(item => item.id))
  const streamWipItems = [
    ...items,
    ...visibleSettings.filter(item => !manualIds.has(item.id)).map(item => ({
      id: item.id, name: item.mosName, category: item.category,
    })),
  ]
  return streamWipItems.map(item => {
    const setting = byId.get(item.id)
    const defaultUnit = setting?.units.find(unit => unit.id === setting.defaultUnitId)
    return {
      ...item,
      name: setting?.mosName ?? item.name,
      defaultUnitName: defaultUnit ? cafeUnitDisplayLabel(defaultUnit) : null,
      otherLogUnitNames: setting?.units
        .filter(unit => unit.isShown && unit.id !== setting.defaultUnitId)
        .map(cafeUnitDisplayLabel) ?? [],
      currentKind: setting ? setting.kind : manualIds.has(item.id) ? 'WIP' : null,
      unavailableReason: setting && !setting.isActive
        ? 'inactive'
        : setting && setting.kind !== 'WIP'
          ? 'not-wip'
          : null,
    }
  })
}

function planableItemIds(items: PlanItem[], streamItemIds: ReadonlySet<string>): Set<string> {
  return new Set(items
    .filter(item => item.unavailableReason === null && streamItemIds.has(item.id))
    .map(item => item.id))
}

type PesananDisplayRow = PesananRow & {
  defaultUnitName: string | null
  otherLogUnitNames: string[]
}

function withPesananSettings(rows: PesananRow[], settings: CafeItemSetting[]): PesananDisplayRow[] {
  const byId = new Map(settings.filter(item => item.kind === 'WIP').map(item => [item.id, item]))
  return rows.map(row => {
    const setting = byId.get(row.wip_item_id)
    const defaultUnit = setting?.units.find(unit => unit.id === setting.defaultUnitId)
    return {
      ...row,
      wip_item_name: setting?.mosName ?? row.wip_item_name,
      category: setting?.category ?? row.category,
      defaultUnitName: defaultUnit ? cafeUnitDisplayLabel(defaultUnit) : null,
      otherLogUnitNames: setting?.units
        .filter(unit => unit.isShown && unit.id !== setting.defaultUnitId)
        .map(cafeUnitDisplayLabel) ?? [],
    }
  })
}

// The rows a stream's plan shows: its listed items, plus any item already planned there (#222).
function streamRows(items: PlanItem[], planableIds: Set<string>, planCells: PlanCell[]): PlanItem[] {
  return items.filter(item => planableIds.has(item.id) || planCells.some(cell => cell.wip_item_id === item.id))
}

function PlanEditor() {
  const t = useT()
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.plan')}`
  const [logDate] = useState(wibToday) // today WIB (date stepper deferred — owner OQ-7)
  // #784 AC-057 hardening (gpt-6-luna review): canEditCafePlan only picked the FACE — every
  // supervisor got the editor regardless of stream, and RLS (ops.is_stream_reviewer) rejects
  // a write against a stream she doesn't hold. isLeadOrAdmin writes everywhere (matches the
  // DB's unconditional OR); a supervisor needs the SELECTED stream itself checked below.
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const isLeadOrAdmin = auth.status === 'authenticated'
    && (auth.viewer.accessRoles.includes('ops_lead') || auth.viewer.accessRoles.includes('admin'))
  const [reviewerStreamKeys, setReviewerStreamKeys] = useState<ReadonlySet<string>>(new Set())
  // The enumerable stream catalog (FR-005) — the head picker's options (#440). The branch
  // catalog comes with it: the MOVEMENT control derives its destinations from the producing
  // stream catalog, which is a different question from which stream this plan belongs to.
  const cafeStream = useCafeStream()
  // Plans are keyed on (org, date, item, branch, activity). Change offers the full readable catalog
  // for an explicit branch switch; `streamOptions` also drives movement/destination derivation.
  const { branches, options: streamOptions, locationOptions, stream, homeStream, myStreamKeys } = cafeStream
  const { resolve: resolveStream, adopt: adoptStream, setStream: chooseStream } = cafeStream
  const streamMissing = stream === null
  const streamCanProduce = streamProduces(stream, streamOptions)
  const streamNonProducing = stream !== null && !streamCanProduce
  const planWriteClosed = streamMissing || streamNonProducing
  const movementOptions = stream
    ? movementsForStream(stream, streamOptions, cafeStream.destinations)
    : []
  // Her own/current default stream is always writable (same trust the Review queue places in
  // it — issue 783); any OTHER stream needs an open-ended membership matching the DB's own
  // ops.is_stream_reviewer check (reviewerStreamKeys, isReviewerEligibleTeam).
  const homeKey = homeStream ? streamKey(homeStream.branch.id, homeStream.activity) : null
  const currentStreamKey = stream ? streamKey(stream.branch.id, stream.activity) : null
  const canWriteStream = isLeadOrAdmin || (
    currentStreamKey !== null
    && (currentStreamKey === homeKey || reviewerStreamKeys.has(currentStreamKey))
  )
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
  const [items, setItems] = useState<PlanItem[]>([])
  // The stream's item list (#222). New plan rows are offered only for these; a row already
  // planned for any other item stays on screen, labelled, with its quantity editable.
  const [offeredIds, setOfferedIds] = useState<Set<string>>(new Set())
  const [planableIds, setPlanableIds] = useState<Set<string>>(new Set())
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
  const [kindFilter, setKindFilter] = useSearchParamState('kind', 'All')
  const [category, setCategory] = useSearchParamState('category', 'All')
  // Phone hides both select filters, so a copied desktop URL must not silently hide Plan rows.
  const effectiveKindFilter: KitchenItemKindFilter = isDesktop && kindFilter === 'WIP' ? 'WIP' : 'All'
  const effectiveCategory = isDesktop ? category : 'All'
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
      const [itemRows, catalog, myTeams] = await Promise.all([
        listActiveWipItems(),
        resolveStream(),
        // Only a supervisor's per-stream write authority depends on this; ops_lead/admin
        // already write everywhere. Display only: a failure drops the extra streams, never
        // the surface (matches useCafeStream's own handling of this read).
        isLeadOrAdmin || !viewerId
          ? Promise.resolve<CafeViewerTeam[]>([])
          : listCafeViewerTeams(viewerId).catch(() => []),
      ])
      const [planCells, offered, settings] = catalog.stream
        ? await Promise.all([
          listKitchenPlans(logDate, catalog.stream),
          listStreamItemIds(catalog.stream),
          listCafeItemSettings(catalog.stream),
        ])
        : [[], null, []]
      if (gen !== requestGen.current) return
      // Existing off-list plans remain readable; stream-listed items use their MOS name and
      // ERP-selected default detail from the same reader as Log.
      // Without a resolved stream there is no working catalog to plan against. Do not present
      // the org-wide reference list beside a disabled quantity editor.
      const displayItems = catalog.stream ? withStreamSettings(itemRows, settings, planCells) : []
      const nextPlanableIds = planableItemIds(displayItems, offered ?? new Set())
      setItems(offered ? streamRows(displayItems, nextPlanableIds, planCells) : displayItems)
      setOfferedIds(offered ?? new Set())
      setPlanableIds(nextPlanableIds)
      adoptStream(catalog)
      setMovement(PRODUCE)
      setCells(planCells)
      setReviewerStreamKeys(new Set(
        myTeams.filter(isReviewerEligibleTeam).map((team) => streamKey(team.branch_id, team.activity)),
      ))
      setLoad({ kind: 'ready' })
    } catch {
      if (gen === requestGen.current) setLoad({ kind: 'error' })
    }
  }, [logDate, resolveStream, adoptStream, isLeadOrAdmin, viewerId])

  useEffect(() => { fetchEditor() }, [fetchEditor, retryKey])

  // Switching the stream re-reads the plan — a different (branch, activity) has its own
  // plan rows entirely, same as the capture surface's applyStream (#196).
  const applyStream = useCallback(async (nextStream: ProductionStream) => {
    const gen = ++requestGen.current
    chooseStream(nextStream) // the whole Café module follows this choice (#440)
    setMovement(PRODUCE)
    setLoad({ kind: 'loading' })
    try {
      const [itemRows, planCells, offered, settings] = await Promise.all([
        listActiveWipItems(),
        listKitchenPlans(logDate, nextStream),
        listStreamItemIds(nextStream),
        listCafeItemSettings(nextStream),
      ])
      if (gen !== requestGen.current) return
      const displayItems = withStreamSettings(itemRows, settings, planCells)
      setItems(streamRows(displayItems, planableItemIds(displayItems, offered), planCells))
      setOfferedIds(offered)
      setPlanableIds(planableItemIds(displayItems, offered))
      setCells(planCells)
      setLoad({ kind: 'ready' })
    } catch {
      if (gen === requestGen.current) setLoad({ kind: 'error' })
    }
  }, [logDate, chooseStream])

  // A new plan row needs the item on the stream's list; an existing row keeps its quantity editable.
  const canPlan = useCallback(
    (wipItemId: string): boolean =>
      planableIds.has(wipItemId)
      || cells.some(c => c.wip_item_id === wipItemId && movementsEqual(c.movement, movement)),
    [cells, movement, planableIds],
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
    // #784 AC-057 hardening: the field is already disabled when !canWriteStream, but re-check
    // here too — same defense-in-depth as the stream/producer checks above it.
    if (!canWriteStream) return
    const current = qtyOf(wipItemId)
    if (!canPlan(wipItemId)) return
    if (nextQty === current) return
    const gen = requestGen.current // a stream switch or reload after this moves it
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
        listStreamItemIds(stream).then((offered) => {
          if (gen === requestGen.current) {
            setOfferedIds(offered)
            setPlanableIds(planableItemIds(items, offered))
          }
        }, () => {})
      } else {
        setSaveError(saveErrorMessage(err, t))
      }
    } finally {
      setSavingId(null)
    }
  }

  const planListRows = useMemo(
    () => toKitchenListRows(items, {
      kind: 'WIP',
      getId: item => item.id,
      getName: item => item.name,
      getCategory: item => item.category,
      getGroupKey: item => item.category?.trim() || '__uncategorized__',
    }),
    [items],
  )
  const itemTable = useKitchenItemTable({
    data: planListRows,
    search,
    kind: effectiveKindFilter,
    category: effectiveCategory,
  })
  const visible = itemTable.getFilteredRowModel().rows.map(row => row.original)
  const categories = ['All', ...Array.from(new Set(items.map(item => item.category ?? '').filter(Boolean)))
    .sort((a, b) => kitchenCategoryLabel(t, a).localeCompare(kitchenCategoryLabel(t, b)))]
  // TanStack's grouped row model supplies category groups; the shared DataTable owns collapse.
  const planGroups = kitchenDataTableGroups(
    itemTable,
    groupKey => groupKey === '__uncategorized__' ? null : kitchenCategoryLabel(t, groupKey),
  ).sort((a, b) => a.label === null ? 1 : b.label === null ? -1 : a.label.localeCompare(b.label))

  const planItemColumn: DataTableColumn<KitchenListRow<PlanItem>> = {
    key: 'dish',
    header: t('kitchen.plan.col.item'),
    cardLabel: '',
    render: item => (
      <span className="kp-dish">
        <span className="kp-name">{item.currentKind && <span>{item.currentKind} - </span>}<span>{item.name}</span></span>
        {offList(item.id) && <NotOnStreamTag />}
        {item.unavailableReason === 'inactive' && <span className="kp-cat">{t('kitchen.plan.item.inactive')}</span>}
        {item.unavailableReason === 'not-wip' && <span className="kp-cat">{t('kitchen.plan.item.notWip')}</span>}
        {item.category && <span className="kp-cat">{kitchenCategoryLabel(t, item.category)}</span>}
        {item.defaultUnitName && <span className="kp-unit">{item.defaultUnitName}</span>}
        {item.otherLogUnitNames.length > 0 && (
          <span className="kp-unit-options">
            {t('kitchen.plan.item.otherLogUnits', { units: item.otherLogUnitNames.join(', ') })}
          </span>
        )}
      </span>
    ),
  }

  const planColumns: DataTableColumn<KitchenListRow<PlanItem>>[] = [
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
              disabled={!isOnline || planWriteClosed || !canWriteStream || !canPlan(item.id)}
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

  const receivingPlanColumns: DataTableColumn<KitchenListRow<PlanItem>>[] = [
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
  const renderPlanCard = (item: KitchenListRow<PlanItem>) => {
    const saving = savingId === item.id
    const saved = !saving && justSavedId === item.id
    return (
      <div className="kp-card">
        <div className="kp-card-head">
          <span className="kp-card-name">
            {item.currentKind && <span>{item.currentKind} - </span>}<span>{item.name}</span>
            {offList(item.id) && <NotOnStreamTag />}
            {item.unavailableReason === 'inactive' && <span className="kp-cat">{t('kitchen.plan.item.inactive')}</span>}
            {item.unavailableReason === 'not-wip' && <span className="kp-cat">{t('kitchen.plan.item.notWip')}</span>}
            {item.defaultUnitName && <span className="kp-card-unit">{item.defaultUnitName}</span>}
            {item.otherLogUnitNames.length > 0 && (
              <span className="kp-card-unit-options">
                {t('kitchen.plan.item.otherLogUnits', { units: item.otherLogUnitNames.join(', ') })}
              </span>
            )}
          </span>
          <PlanQtyField
            itemName={item.name}
            qty={qtyOf(item.id)}
            disabled={!isOnline || planWriteClosed || !canWriteStream || !canPlan(item.id)}
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
      /* #440: the stream this plan is being written INTO, stated in the head. Plan's existing
         Change menu also allows a deliberate working-branch switch; applyStream commits the new
         branch before re-reading its plan. Capture remains bounded to its active location. */
      statusRow={
        <CafeStreamBar
          options={streamOptions}
          stream={stream}
          homeStream={homeStream}
          myStreamKeys={myStreamKeys}
          locationBranchId={cafeStream.branchId ?? undefined}
          onChange={next => { void applyStream(next) }}
        />
      }
      meta={
        <span className="kp-date tabular">{formatWeekdayDayMonth(logDate)}</span>
      }
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : streamMissing ? 'default' : streamNonProducing ? 'read-only' : items.length === 0 ? 'empty' : saveError ? 'validation' : savingId ? 'saving' : 'default'}
    >
      {/* #401 / DD-WAY-40: Plan is an ACT surface — its figures render as the DESIGN.md
          Metric summary rule: one inline line, no card, no width branch, never a tile
          row (OD-WAY-74 #2). No delta: a capture band has no state worth acting on. */}
      {load.kind === 'ready' && stream !== null && items.length > 0 && (
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
      {/* #548 FR-006 / #781 item 2: the precondition is a muted hint at rest (Log's
          .kl-submit-reason grammar, role="status" — programmatically associated as a live
          region, NFR-002), plus the same one-step choice Log offers — the head bar has nothing
          to state while no default resolves (FR-002), so this is the only place the choice is
          reachable on this page. saveCell keeps the same guard as a defensive backstop if a
          caller bypasses the disabled field. */}
      {streamMissing && load.kind === 'ready' && (
        <div className="kp-stream-hint" role="status" aria-live="polite">
          <p>{t('kitchen.plan.stream.missing')}</p>
          <CafeStreamChoices
            options={locationOptions}
            homeStream={homeStream}
            myStreamKeys={myStreamKeys}
            onChoose={next => { void applyStream(next) }}
          />
        </div>
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

      {load.kind === 'ready' && !streamMissing && items.length === 0 && (
        <EmptyState
          variant="blank"
          title={stream ? t('kitchen.streamItems.empty.title', { stream: streamLabel(t, stream) }) : t('kitchen.empty.noActiveItems.title')}
          copy={stream ? t('kitchen.streamItems.empty.copy') : t('kitchen.plan.empty.copy')}
        />
      )}

      {load.kind === 'ready' && !streamMissing && items.length > 0 && (
        <div className="kp-block">
          <KitchenToolbar
            search={search}
            onSearchChange={setSearch}
            kinds={WIP_KIND_FILTER_OPTIONS}
            kind={kindFilter as KitchenItemKindFilter}
            kindId="cafe-plan-kind"
            onKindChange={setKindFilter}
            categories={categories}
            categoryId="cafe-plan-category"
            categoryLabel={value => kitchenCategoryLabel(t, value)}
            category={category}
            onCategoryChange={setCategory}
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
            <Link to="/cafe/production" className="kp-group-link">
              {t('kitchen.plan.group.log')}
            </Link>
          </p>
          <div className="kp-list">
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
  const [rows, setRows] = useState<PesananDisplayRow[]>([])
  const cafeStream = useCafeStream()
  // Pesanan reads the explicitly selected (branch, activity) horizon. Its Change menu can move to
  // another readable branch; the active location is shown in the menu so that choice stays clear.
  // `streamOptions` is the full readable catalog, and is also used for producer-aware labels.
  const { branches, options: streamOptions, locationOptions, stream, homeStream, myStreamKeys } = cafeStream
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
  const [kindFilter, setKindFilter] = useSearchParamState('kind', 'All')
  const [category, setCategory] = useSearchParamState('category', 'All')
  // Hidden desktop filters stay inert on phone even when their URL state is shared in.
  const effectiveKindFilter: KitchenItemKindFilter = isDesktop ? kindFilter as KitchenItemKindFilter : 'All'
  const effectiveCategory = isDesktop ? category : 'All'

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
      const [data, settings] = catalog.stream
        ? await Promise.all([
          listPesanan(from, PESANAN_HORIZON_DAYS, catalog.stream),
          listCafeItemSettings(catalog.stream),
        ])
        : [[], []]
      if (gen !== requestGen.current) return
      adoptStream(catalog)
      setRows(withPesananSettings(data, settings))
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
      const [data, settings] = await Promise.all([
        listPesanan(from, PESANAN_HORIZON_DAYS, next),
        listCafeItemSettings(next),
      ])
      if (gen !== requestGen.current) return
      setRows(withPesananSettings(data, settings))
      setLoad({ kind: 'ready' })
    } catch {
      if (gen === requestGen.current) setLoad({ kind: 'error' })
    }
  }, [from, chooseStream])

  useEffect(() => { fetchHorizon() }, [fetchHorizon, retryKey])

  const pesananListRows = useMemo(
    () => toKitchenListRows(rows, {
      kind: 'WIP',
      getId: row => `${row.log_date}:${row.wip_item_id}:${movementKey(row.movement)}`,
      getName: row => row.wip_item_name,
      getCategory: row => row.category,
      getGroupKey: row => row.log_date,
    }),
    [rows],
  )
  const pesananTable = useKitchenItemTable({
    data: pesananListRows,
    search,
    kind: effectiveKindFilter,
    category: effectiveCategory,
  })
  const visible = pesananTable.getFilteredRowModel().rows.map(row => row.original)
  const categories = ['All', ...Array.from(new Set(rows.map(row => row.category ?? '').filter(Boolean)))
    .sort((a, b) => kitchenCategoryLabel(t, a).localeCompare(kitchenCategoryLabel(t, b)))]
  const pesananGroups = kitchenDataTableGroups(pesananTable, date => date)
    .sort((a, b) => String(a.label).localeCompare(String(b.label)))

  // Read-only pesanan columns: Item (name + category sub-label) · Action · Planned.
  // No edit affordance (AC-024) — the qty is a plain tabular number, no stepper.
  const pesananColumns: DataTableColumn<KitchenListRow<PesananDisplayRow>>[] = [
    {
      key: 'item',
      header: t('kitchen.plan.pesanan.col.item'),
      cardLabel: '',
      render: r => (
        <span className="kp-dish">
          <span className="kp-name"><span>{r.kind} - </span><span>{r.wip_item_name}</span></span>
          {r.category && <span className="kp-cat">{kitchenCategoryLabel(t, r.category)}</span>}
          {r.defaultUnitName && <span className="kp-unit">{r.defaultUnitName}</span>}
          {r.otherLogUnitNames.length > 0 && (
            <span className="kp-unit-options">
              {t('kitchen.plan.item.otherLogUnits', { units: r.otherLogUnitNames.join(', ') })}
            </span>
          )}
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
          options={streamOptions}
          stream={stream}
          homeStream={homeStream}
          myStreamKeys={myStreamKeys}
          locationBranchId={cafeStream.branchId ?? undefined}
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
        <Link to="/cafe/production" className="btn btn-outline kp-readonly-cta">
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
        <EmptyState variant="next-step" title={t('cafe.stream.none')}>
          <CafeStreamChoices
            options={locationOptions}
            homeStream={homeStream}
            myStreamKeys={myStreamKeys}
            onChoose={next => { void applyStream(next) }}
          />
        </EmptyState>
      )}

      {load.kind === 'ready' && stream !== null && rows.length === 0 && (
        <EmptyState
          variant="awaiting"
          // B10: the shared 'awaiting' glyph is a rotating-arrow ↻ — a real cue on a surface with
          // a refresh action, but this read view has none, so it read as a dead refresh button.
          // A neutral glyph keeps the "a plan will eventually land here" meaning without implying
          // a control.
          icon="…"
          title={t('kitchen.plan.pesanan.empty.title')}
          copy={t('kitchen.plan.pesanan.empty.copy', { days: PESANAN_HORIZON_DAYS })}
        />
      )}

      {load.kind === 'ready' && rows.length > 0 && (
        <div className="kp-block">
          <KitchenToolbar
            search={search}
            onSearchChange={setSearch}
            kinds={WIP_KIND_FILTER_OPTIONS}
            kind={kindFilter as KitchenItemKindFilter}
            kindId="cafe-plan-kind"
            onKindChange={setKindFilter}
            categories={categories}
            categoryId="cafe-plan-category"
            categoryLabel={value => kitchenCategoryLabel(t, value)}
            category={category}
            onCategoryChange={setCategory}
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
