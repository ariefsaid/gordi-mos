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

import { CheckIcon } from '@/shell/icons'
import { Select } from '@/components/ui/select'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { saveErrorMessage } from '@/lib/save-error'
import { Toast } from '@/components/admin/toast'
import { useToast } from '@/components/admin/use-toast'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useSearchParamState } from '@/lib/use-search-param-state'
import { isItemNotOnStreamError, listStreamItemIds } from '@/lib/db/kitchen-logs'
import { cafeUnitDisplayLabel, listCafeItemSettings } from '@/lib/db/cafe-item-settings'
import type { CafeItemSetting } from '@/lib/db/cafe-item-settings'
import { useCafeLocationNames } from '@/lib/use-cafe-location-choices'
import { useCafeDestinations } from '@/lib/use-cafe-destinations'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { recordsHref } from '@/lib/cafe-records/url-state'
import { canEditCafePlan, canPushCafe, isReviewerEligibleTeam } from '@/lib/kitchen-gates'
import { listCafeViewerTeams, type CafeViewerTeam } from '@/lib/db/cafe-opening'
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
  movementKey,
  PRODUCE,
  streamLabel,
  streamProduces,
} from '@/lib/kitchen-action-label'
import { CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { NotOnStreamTag } from '@/components/kitchen/not-on-stream-tag'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { CafeItemsEmptyState } from '@/components/kitchen/cafe-items-empty-state'
import { MetricSummaryRule } from '@/components/kitchen/metric-summary-rule'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { PlanQtyField } from '@/components/kitchen/plan-qty-field'
import { CaptureControl, CaptureRow, CaptureTable } from '@/components/kitchen/capture-row'
import { PlanWorkspace, PlanSheet, PlanScope } from '@/components/cafe/redesign/cafe-plan-workspace'
import { PlanHorizon, type PlanHorizonDate } from '@/components/cafe/redesign/cafe-plan-horizon'
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
import { formatWeekdayDayMonth, wibToday } from '@/lib/format/date'
import './kitchen-plan-page.css'
import { Notice } from '@/components/ui/notice'

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready' }

function shiftPlanDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}

export function KitchenPlanPage() {
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const t = useT()

  // Role split (member-read / lead-edit). RLS is the authority; this picks the face.
  // #784 AC-057: the stream's own supervisor edits too, not only ops_lead/admin (#778
  // widened plan-row writes on the database side to match Review's reviewer predicate).
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const canEdit = canEditCafePlan(accessRoles)

  if (auth.status === 'loading') {
    return (
      <CafePageFrame page="plan" streamBar={{ options: [], stream: null, onChange: () => undefined }} state="loading">
        <LoadingShell count={3} />
      </CafePageFrame>
    )
  }
  if (auth.status === 'unauthenticated' || auth.status === 'orphan') {
    return (
      <CafePageFrame page="plan" streamBar={{ options: [], stream: null, onChange: () => undefined }} state="permission">
        <div className="kp-block kp-forbidden">
          <p className="kp-forbidden-msg">{t('kitchen.plan.signInMsg')}</p>
          <Link to="/login" className="btn btn-primary">{t('common.signIn')}</Link>
        </div>
      </CafePageFrame>
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
  settings: CafeItemSetting[],
  planCells: PlanCell[] = [],
): PlanItem[] {
  const plannedIds = new Set(planCells.map(cell => cell.wip_item_id))
  return settings
    .filter(item => (item.kind === 'WIP' && item.isActive) || plannedIds.has(item.id))
    .map((setting): PlanItem => {
      const defaultUnit = setting.units.find(unit => unit.id === setting.defaultUnitId)
      return {
        id: setting.id,
        name: setting.mosName,
        category: setting.category,
        defaultUnitName: defaultUnit ? cafeUnitDisplayLabel(defaultUnit) : null,
        otherLogUnitNames: setting.units
          .filter(unit => unit.isShown && unit.id !== setting.defaultUnitId)
          .map(cafeUnitDisplayLabel),
        currentKind: setting.kind,
        unavailableReason: !setting.isActive ? 'inactive' : setting.kind !== 'WIP' ? 'not-wip' : null,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
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
  const [today] = useState(wibToday)
  const [logDate, setLogDate] = useState(today)
  const lastPlanDate = shiftPlanDate(today, PESANAN_HORIZON_DAYS - 1)
  const dayOffset = Math.round((Date.parse(logDate) - Date.parse(today)) / 86_400_000)
  const relativeDay = dayOffset === 0 ? t('kitchen.plan.day.today')
    : dayOffset === 1 ? t('kitchen.plan.day.tomorrow')
    : t('kitchen.plan.day.inDays', { days: dayOffset })
  // #784 AC-057 hardening (gpt-6-luna review): canEditCafePlan only picked the FACE — every
  // supervisor got the editor regardless of stream, and RLS (ops.is_stream_reviewer) rejects
  // a write against a stream she doesn't hold. isLeadOrAdmin writes everywhere (matches the
  // DB's unconditional OR); a supervisor needs the SELECTED stream itself checked below.
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const isLeadOrAdmin = auth.status === 'authenticated' && canPushCafe(auth.viewer.accessRoles)
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
  // Production, then one column per destination Location (the database's answer for this Location).
  const destinations = useCafeDestinations(stream, streamOptions)
  const movementOptions = destinations.movements
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
  const movementAllowed = movementOptions.some(option => movementsEqual(option, movement))
  useEffect(() => {
    if (destinations.status === 'ready' && !movementAllowed) setMovement(PRODUCE)
  }, [movementAllowed, destinations.status])
  const [items, setItems] = useState<PlanItem[]>([])
  // How many ESB items the stream lists, from the settings this page reads; the empty state uses it.
  const [esbItemCount, setEsbItemCount] = useState<number>()
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
  const { toast, showToast, clearToast } = useToast()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const isDesktop = useIsDesktop()
  const [search, setSearch] = useSearchParamState('q', '')
  const [kindFilter, setKindFilter] = useSearchParamState('kind', 'All')
  const [category, setCategory] = useSearchParamState('category', 'All')
  const effectiveKindFilter: KitchenItemKindFilter = kindFilter === 'WIP' ? 'WIP' : 'All'
  const effectiveCategory = category
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
      const [catalog, myTeams] = await Promise.all([
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
      // The stream's ESB items, with their MOS name and default ESB detail from the same reader as
      // Log; an existing plan for a listed item that went inactive or changed kind stays readable.
      // Without a resolved stream there is no working catalog to plan against. Do not present
      // the org-wide reference list beside a disabled quantity editor.
      const displayItems = catalog.stream ? withStreamSettings(settings, planCells) : []
      setEsbItemCount(settings.length)
      const nextPlanableIds = planableItemIds(displayItems, offered ?? new Set())
      setItems(offered ? streamRows(displayItems, nextPlanableIds, planCells) : displayItems)
      setOfferedIds(offered ?? new Set())
      setPlanableIds(nextPlanableIds)
      adoptStream(catalog)
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
    setSavingId(null)
    setJustSavedId(null)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = null
    setSaveError('')
    setLoad({ kind: 'loading' })
    try {
      const [planCells, offered, settings] = await Promise.all([
        listKitchenPlans(logDate, nextStream),
        listStreamItemIds(nextStream),
        listCafeItemSettings(nextStream),
      ])
      if (gen !== requestGen.current) return
      const displayItems = withStreamSettings(settings, planCells)
      setEsbItemCount(settings.length)
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
    (wipItemId: string, forMovement: KitchenMovement = movement): boolean =>
      planableIds.has(wipItemId)
      || cells.some(c => c.wip_item_id === wipItemId && movementsEqual(c.movement, forMovement)),
    [cells, movement, planableIds],
  )
  const offList = (wipItemId: string) => stream !== null && !offeredIds.has(wipItemId)

  // Plan qty for (item, current movement) — 0 when no plan row yet.
  const qtyOf = useCallback(
    (wipItemId: string, forMovement: KitchenMovement = movement): number =>
      cells.find(c => c.wip_item_id === wipItemId && movementsEqual(c.movement, forMovement))?.qty_porsi ?? 0,
    [cells, movement],
  )
  // One cell = one item in one action; the desktop sheet edits every action's column at once.
  const cellKey = (wipItemId: string, forMovement: KitchenMovement) => `${wipItemId}|${movementKey(forMovement)}`

  // Persist one cell (FR-031 upsert). No-op when unchanged or offline; the stream and its
  // producer fact are checked again here so a closed/read-only surface cannot write.
  async function saveCell(wipItemId: string, nextQty: number, forMovement: KitchenMovement = movement) {
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
    const current = qtyOf(wipItemId, forMovement)
    if (!canPlan(wipItemId, forMovement)) return
    if (nextQty === current) return
    const gen = requestGen.current // a stream switch or reload after this moves it
    const savingKey = cellKey(wipItemId, forMovement)
    setSavingId(savingKey)
    setSaveError('')
    try {
      const id = await upsertKitchenPlan({
        log_date: logDate,
        wip_item_id: wipItemId,
        branch_id: stream.branch.id,
        activity: stream.activity,
        action: forMovement.action,
        destination_branch_id: forMovement.destinationBranchId,
        // The Location ids are what the server reads; it fills Branch and Activity from them.
        from_location_id: stream.location?.id ?? null,
        to_location_id: forMovement.toLocationId ?? null,
        qty_porsi: nextQty,
      })
      if (gen !== requestGen.current) return
      // Reflect the confirmed result in place (no view transition).
      setCells(prev => {
        const without = prev.filter(
          c => !(c.wip_item_id === wipItemId && movementsEqual(c.movement, forMovement)),
        )
        return [...without, { id, wip_item_id: wipItemId, movement: forMovement, qty_porsi: nextQty }]
      })
      // Surface the commit INLINE at THIS cell (A5): a transient ✓ Saved tick, then
      // idle. Reset any in-flight tick (e.g. rapid back-to-back edits) before re-arming.
      setJustSavedId(savingKey)
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setJustSavedId(null), 1500)
    } catch (err) {
      if (gen !== requestGen.current) {
        showToast(t('kitchen.plan.saveFailedAfterSwitch', { stream: streamLabel(t, stream) }))
        return
      }
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
      if (gen === requestGen.current) setSavingId(null)
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
  const planGroups = load.kind === 'loading' ? [] : kitchenDataTableGroups(
    itemTable,
    groupKey => groupKey === '__uncategorized__' ? null : kitchenCategoryLabel(t, groupKey),
  ).sort((a, b) => a.label === null ? 1 : b.label === null ? -1 : a.label.localeCompare(b.label))
  const planableGroups = planGroups.map(group => ({ ...group, rows: group.rows.filter(row => planableIds.has(row.id)) })).filter(group => group.rows.length > 0)
  // One category needs no header of its own: the toolbar count already says how many, and the row
  // list starts higher on a phone (UX-STANDARD PA4). Several categories keep their collapsible headers.
  const mainPlanGroups = planableGroups.length === 1 ? [{ ...planableGroups[0], label: null }] : planableGroups

  // The item cell of every Plan row: name (+kind tag) and one muted meta line.
  const planItemMeta = (item: KitchenListRow<PlanItem>) => (
    <>
      {offList(item.id) && <NotOnStreamTag />}
      {item.unavailableReason === 'inactive' && <span>{t('kitchen.plan.item.inactive')}</span>}
      {item.unavailableReason === 'not-wip' && <span>{t('kitchen.plan.item.notWip')}</span>}
      {item.otherLogUnitNames.length > 0 && <span>{t('kitchen.plan.item.otherLogUnits', { units: item.otherLogUnitNames.join(', ') })}</span>}
    </>
  )
  // The editable "Plan" control for one action. The phone shows the action chosen in "Plan for"; the desktop
  // sheet shows one control per action, so a whole day is planned in one view. Commit state (Saving… / ✓ Saved)
  // sits under the unit, only when it has something to say, so the row's one box never moves mid-entry.
  const planControl = (item: KitchenListRow<PlanItem>, forMovement: KitchenMovement) => {
    const id = cellKey(item.id, forMovement)
    const saving = savingId === id
    const saved = !saving && justSavedId === id
    return (
      <CaptureControl>
        <PlanQtyField
          itemName={item.name}
          qty={qtyOf(item.id, forMovement)}
          // #548 FR-006: a missing or receiving-only stream keeps the committed value readable but closes
          // the field; offline also pre-disables it.
          disabled={!isOnline || planWriteClosed || !canWriteStream || !canPlan(item.id, forMovement)}
          onSave={next => saveCell(item.id, next, forMovement)}
          unitName={item.defaultUnitName}
          status={(saving || saved) ? (
            <span className="pqf-status kp-cell-status" role="status" aria-live="polite">
              {saving
                ? t('record.field.saving')
                : <><CheckIcon className="inline-icon" /> {t('record.field.saved')}</>}
            </span>
          ) : undefined}
        />
      </CaptureControl>
    )
  }
  const movementColumnHeader = (option: KitchenMovement): string => {
    if (option.action === 'produce') return t('kitchen.actionType.production')
    return t('kitchen.plan.col.transferTo', {
      destination: option.toLocationName ?? branches.find(branch => branch.id === option.destinationBranchId)?.name ?? t('kitchen.actionType.transferTo.fallback'),
    })
  }
  const wideColumns = isDesktop && movementOptions.length > 0
  const planControls = wideColumns
    ? movementOptions.map(option => ({ label: movementColumnHeader(option), movement: option }))
    : [{ label: t('kitchen.plan.col.plan'), movement }]
  const planTable = (
    rows: KitchenListRow<PlanItem>[],
    caption: string,
    groups?: ReturnType<typeof kitchenDataTableGroups<KitchenListRow<PlanItem>>>,
  ) => (
    <CaptureTable
      caption={caption}
      columns={{
        item: t('kitchen.plan.col.item'),
        itemSort: 'asc',
        // One control per action takes its action's name as its header; the single phone control keeps "Unit" beside it.
        controls: planControls.map(control => planControls.length > 1 ? { label: control.label, unit: null } : { label: control.label }),
      }}
      rows={rows}
      groups={groups}
      renderRow={item => (
        <CaptureRow
          id={item.id}
          name={item.name}
          kind={item.currentKind}
          meta={planItemMeta(item)}
          controls={planControls.map(control => ({ label: control.label, node: planControl(item, control.movement) }))}
        />
      )}
    />
  )

  const receivingPlanColumns: DataTableColumn<KitchenListRow<PlanItem>>[] = [
    {
      key: 'dish',
      header: t('kitchen.plan.col.item'),
      sortState: 'asc',
      cardLabel: '',
      render: item => (
        <span className="kp-dish">
          <span className="kp-name">{item.currentKind && <span>{item.currentKind} - </span>}<span>{item.name}</span></span>
          {planItemMeta(item)}
        </span>
      ),
    },
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

  return (
    <CafePageFrame
      page="plan"
      recordsHref={recordsHref({ question: 'made', reading: 'summary', from: logDate, to: logDate, stream: stream ? { branchId: stream.branch.id, activity: stream.activity } : null, today: wibToday() })}
      streamBar={{
        options: streamOptions,
        stream,
        homeStream,
        myStreamKeys,
        locationBranchId: cafeStream.branchId ?? undefined,
        onChange: next => { void applyStream(next) },
      }}
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : streamMissing ? 'default' : streamNonProducing ? 'read-only' : items.length === 0 ? 'empty' : saveError ? 'validation' : savingId ? 'saving' : 'default'}
    >

      <Toast toast={toast} onDismiss={clearToast} />
      {!isOnline && <Notice tone="attention" role="alert">{t('kitchen.plan.offline')}</Notice>}
      {saveError && <Notice tone="urgent">{saveError}</Notice>}
      {destinations.status === 'error' && <Notice tone="attention">
        {t('cafe.locations.loadError')} <button type="button" className="btn btn-outline" onClick={destinations.retry}>{t('common.retry')}</button>
      </Notice>}
      {/* #548 FR-006 / #781 item 2: the precondition is a muted hint at rest (Log's
          .kl-submit-reason grammar, role="status" — programmatically associated as a live
          region, NFR-002), plus the same one-step choice Log offers — the head bar has nothing
          to state while no default resolves (FR-002), so this is the only place the choice is
          reachable on this page. saveCell keeps the same guard as a defensive backstop if a
          caller bypasses the disabled field. */}
      {streamMissing && load.kind === 'ready' && (
        <CafeStreamChoices
          options={locationOptions}
          homeStream={homeStream}
          myStreamKeys={myStreamKeys}
          onChoose={next => { void applyStream(next) }}
        />
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

      {load.kind === 'ready' && stream && items.length === 0 && (
        <CafeItemsEmptyState stream={stream} esbItemCount={esbItemCount} />
      )}

      {load.kind === 'ready' && !streamMissing && items.length > 0 && (
        <PlanWorkspace className="kp-editor-workspace">
          <aside className="kp-date-rail">
            <div className="kp-day-stepper" role="group" aria-label={t('kitchen.plan.day.group')}>
              <button type="button" className="btn btn-outline kp-day-stepper__button" aria-label={t('kitchen.plan.day.previous')} disabled={logDate <= today} onClick={() => setLogDate(current => shiftPlanDate(current, -1))}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></button>
              <time className="kp-date-current tabular" dateTime={logDate} aria-live="polite">{t('kitchen.plan.day.label', { date: formatWeekdayDayMonth(logDate), relative: relativeDay })}</time>
              <button type="button" className="btn btn-outline kp-day-stepper__button" aria-label={t('kitchen.plan.day.next')} disabled={logDate >= lastPlanDate} onClick={() => setLogDate(current => shiftPlanDate(current, 1))}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg></button>
              <button type="button" className="btn btn-outline kp-day-stepper__today" disabled={logDate === today} onClick={() => setLogDate(today)}>{t('kitchen.plan.day.today')}</button>
            </div>
          </aside>
          {movementOptions.length > 0 && !wideColumns && <PlanScope className="kp-action-rail">
            <div className="kp-action-phone"><Select label={t('kitchen.plan.actionScope')} fullWidth value={movementKey(movement)} onChange={event => { const next = movementOptions.find(option => movementKey(option) === event.target.value); if (next) setMovement(next) }}>{movementOptions.map(option => <option key={movementKey(option)} value={movementKey(option)}>{deriveActionLabel(t, option, branches, stream?.branch)}</option>)}</Select></div>
          </PlanScope>}
          <PlanSheet label={t('kitchen.plan.caption')}>
            <div className="kp-sheet-head">
              {load.kind === 'ready' && stream !== null && items.length > 0 && <MetricSummaryRule ariaLabel={t(summary.ariaLabel)} metrics={summary.metrics.map(metric => ({ key: metric.key, label: t(metric.label), value: wideColumns ? String(new Set(cells.filter(cell => cell.qty_porsi > 0).map(cell => cell.wip_item_id)).size) : metric.value }))} />}
              <p className="kp-save-boundary">{t('kitchen.plan.saveBoundary')}</p>
            </div>
            <KitchenToolbar search={search} onSearchChange={setSearch} kinds={WIP_KIND_FILTER_OPTIONS} kind={kindFilter as KitchenItemKindFilter} kindId="cafe-plan-kind" onKindChange={setKindFilter} categories={categories} categoryId="cafe-plan-category" categoryLabel={value => kitchenCategoryLabel(t, value)} category={category} onCategoryChange={setCategory} searchPlaceholder={t('kitchen.plan.searchPlaceholder')} ariaLabel={t('kitchen.plan.toolbarAria')} resultCount={{ shown: visible.length, total: items.length }} sortLabel={t('cafe.toolbar.sorted.az')} filtersPanel={{ label: t('cafe.toolbar.filters'), summary: [kindFilter !== 'All' ? kindFilter : t('kitchen.filter.kind.all'), category !== 'All' ? kitchenCategoryLabel(t, category) : t('kitchen.filter.all')].join(' · ') }} />
            <div className="kp-list">
              {visible.some(item => planableIds.has(item.id)) ? (streamNonProducing
                ? <DataTable cardsHead={false} columns={receivingPlanColumns} rows={visible.filter(item => planableIds.has(item.id))} groups={mainPlanGroups} isDesktop={isDesktop} state="ready" caption={t('kitchen.stream.receivingOnly.planCaption')} />
                : planTable(visible.filter(item => planableIds.has(item.id)), t('kitchen.plan.caption'), mainPlanGroups)) : visible.length === 0 ? <p role="status" className="cafe-no-match">{t('kitchen.filter.noMatch')}</p> : null}
              {visible.some(item => !planableIds.has(item.id)) && <section className="kp-existing-only"><h2>{t('kitchen.plan.existingOnly')}</h2>{streamNonProducing
                ? <DataTable columns={receivingPlanColumns} rows={visible.filter(item => !planableIds.has(item.id))} isDesktop={isDesktop} caption={t('kitchen.plan.existingOnly')} />
                : planTable(visible.filter(item => !planableIds.has(item.id)), t('kitchen.plan.existingOnly'))}</section>}
            </div>
          </PlanSheet>
          <div className="kp-production-transition"><Link to="/cafe/production" className="btn btn-outline btn-touch">{t('kitchen.plan.group.log')}</Link></div>
        </PlanWorkspace>
      )}
    </CafePageFrame>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// member — the read-only PESANAN horizon (FR-035 / AC-024)
// ════════════════════════════════════════════════════════════════════════════
function PesananView() {
  const t = useT()
  const [from] = useState(wibToday) // horizon start = today WIB
  const [rows, setRows] = useState<PesananDisplayRow[]>([])
  const cafeStream = useCafeStream()
  // Pesanan reads the explicitly selected (branch, activity) horizon. Its Change menu can move to
  // another readable branch; the active location is shown in the menu so that choice stays clear.
  // `streamOptions` is the full readable catalog, and is also used for producer-aware labels.
  const { branches, options: streamOptions, locationOptions, stream, homeStream, myStreamKeys } = cafeStream
  const { resolve: resolveStream, adopt: adoptStream, setStream: chooseStream } = cafeStream
  const placeNames = useCafeLocationNames()
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const requestGen = useRef(0)
  // #401: URL-synced search + category over the ~231-row horizon (v4's KitchenToolbar
  // port; Nielsen Café·Plan 16/32). Same keys as the editor face ('q'/'category') —
  // the faces are role-exclusive, so they never share a URL. Refresh/share keeps the
  // filtered view (I7 / D-E1).
  const [search, setSearch] = useSearchParamState('q', '')
  const [kindFilter, setKindFilter] = useSearchParamState('kind', 'All')
  const [category, setCategory] = useSearchParamState('category', 'All')
  // Hidden desktop filters stay inert on phone even when their URL state is shared in.
  const effectiveKindFilter: KitchenItemKindFilter = kindFilter as KitchenItemKindFilter
  const effectiveCategory = category

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
  const horizonDates: PlanHorizonDate<KitchenListRow<PesananDisplayRow>>[] = []
  for (const row of visible) {
    const date = row.log_date
    const current = horizonDates[horizonDates.length - 1]
    if (current?.date === date) current.rows.push(row)
    else horizonDates.push({ date, rows: [row] })
  }

  return (
    <CafePageFrame
      page="plan"
      meta={t('kitchen.plan.pesanan.meta.horizon', { days: PESANAN_HORIZON_DAYS })}
      streamBar={{
        options: streamOptions,
        stream,
        homeStream,
        myStreamKeys,
        locationBranchId: cafeStream.branchId ?? undefined,
        onChange: next => { void applyStream(next) },
      }}
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
        <CafeStreamChoices
          options={locationOptions}
          homeStream={homeStream}
          myStreamKeys={myStreamKeys}
          onChoose={next => { void applyStream(next) }}
        />
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
          <div className="kp-member-tools">
            <KitchenToolbar search={search} onSearchChange={setSearch} kinds={WIP_KIND_FILTER_OPTIONS} kind={kindFilter as KitchenItemKindFilter} kindId="cafe-plan-kind" onKindChange={setKindFilter} categories={categories} categoryId="cafe-plan-category" categoryLabel={value => kitchenCategoryLabel(t, value)} category={category} onCategoryChange={setCategory} searchPlaceholder={t('kitchen.plan.pesanan.searchPlaceholder')} ariaLabel={t('kitchen.plan.pesanan.toolbarAria')} resultCount={{ shown: visible.length, total: rows.length }} />
            <Link to="/cafe/production" className="btn btn-outline btn-touch">{t('kitchen.plan.pesanan.readOnlyCta')}</Link>
          </div>
          {visible.length > 0 ? <PlanHorizon dates={horizonDates} getAction={row => deriveActionLabel(t, { ...row.movement, toLocationName: row.movement.toLocationId ? placeNames.get(row.movement.toLocationId) : null }, branches, stream?.branch)} renderRow={row => <div className="kp-horizon-row"><span className="kp-horizon-item"><span>{row.kind} - {row.wip_item_name}</span>{row.category && <small>{kitchenCategoryLabel(t, row.category)}</small>}{row.defaultUnitName && <small>{row.defaultUnitName}</small>}{row.otherLogUnitNames.length > 0 && <small>{t('kitchen.plan.item.otherLogUnits', { units: row.otherLogUnitNames.join(', ') })}</small>}</span><span className="kp-horizon-planned"><strong>{row.qty_porsi}</strong> {row.defaultUnitName ?? t('kitchen.unit.porsi')}</span></div>} dateLabel={date => formatWeekdayDayMonth(date)} indexLabel={t('kitchen.plan.dateIndex')} actionLabel={t('kitchen.plan.pesanan.col.action')} itemLabel={t('kitchen.plan.pesanan.col.item')} /> : <p role="status" className="kp-no-match">{t('kitchen.filter.noMatch')}</p>}
        </div>
      )}
    </CafePageFrame>
  )
}
