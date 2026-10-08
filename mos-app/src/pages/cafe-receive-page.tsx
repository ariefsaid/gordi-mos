import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CafeStreamBar, CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { CafeCaptureQuantityControl, CafeCaptureTable } from '@/components/kitchen/cafe-capture-table'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { CafeReceiptState } from '@/components/kitchen/cafe-receipt-state'
import {
  CafeReceiptLineCondition,
  CafeReceiptLineEvidence,
  type EvidenceValidation,
} from '@/components/kitchen/cafe-receipt-line-condition'
import { CafeReceiveLockConfirm } from '@/components/kitchen/cafe-receive-lock-confirm'
import { CafeReceiptLineRow } from '@/components/kitchen/cafe-receipt-difference'
import { CafeReceiptIssuesLink } from '@/components/kitchen/cafe-receipt-issues-link'
import { CafeItemsEmptyState } from '@/components/kitchen/cafe-items-empty-state'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useI18n } from '@/i18n/I18nProvider'
import { useT } from '@/i18n/use-t'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import { canReviewCafe } from '@/lib/kitchen-gates'
import {
  explanationDiffers,
  pruneCafeReceiptExplanationDrafts,
  readCafeReceiptExplanationDrafts,
  sameServerStamp,
  writeCafeReceiptExplanationDrafts,
  type CafeReceiptExplanation,
} from '@/lib/cafe-receipt-explanation-draft'
import {
  cafeReceiptArrivalDateBounds,
  listCafeOpenPoIdentities,
  listCafeReceiptDifferences,
  listCafeReceipts,
  listCafeReceivableItems,
  newCafeReceiptClientKey,
  normalizeCafeReceiptQuantity,
  saveCafeReceiptLineExplanation,
  sendCafeReceiptForReview,
  submitCafeReceipt,
  summarizeCafeReceiptDifferences,
  type CafeOpenPoIdentity,
  type CafeOpenPoIdentityCache,
  type CafeReceipt,
  type CafeReceiptDifferenceSummary,
  type CafeReceiptLine,
  type CafeReceivableItem,
} from '@/lib/db/cafe-receipts'
import { wibToday } from '@/lib/db/cafe-opening'
import { clearOfflinePhotoDraft, pruneOfflinePhotoDrafts } from '@/lib/offline-photo-drafts'
import {
  clearCafeReceiveDraft,
  loadCafeReceiveDraft,
  pruneCafeReceiveDrafts,
  saveCafeReceiveDraft,
  type CafeReceiveDraftEntry,
  type CafeReceiveDraftScope,
} from '@/lib/cafe-receive-drafts'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'
import { streamLabel } from '@/lib/kitchen-action-label'
import { useKitchenItemTable } from '@/lib/kitchen-item-list'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsOffline } from '@/shell/use-is-offline'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { formatWeekdayDayMonth, formatWibShortDateTime } from '@/lib/format/date'
import '@/components/kitchen/cafe-capture-controls.css'
import './cafe-receive-page.css'

type Entry = { quantity: string; unitId: string; changingUnit: boolean; damagedWrong: boolean }
type LoadState = 'loading' | 'ready' | 'error'
/** `forbidden`: the identity read refuses a member receiving outside their own branch, so a retry cannot help. */
type OpenPoState = { branchId: string | null; status: LoadState | 'forbidden'; cache: CafeOpenPoIdentityCache | null }
/** A PO card names this many expected items and counts the rest. */
const PO_CARD_ITEMS = 3

/** A typed quantity that is not a positive decimal; it blocks Count submit rather than being dropped. */
function isInvalidEntry(entry: Entry | undefined): boolean {
  return Boolean(entry?.quantity.trim()) && normalizeCafeReceiptQuantity(entry!.quantity) === null
}
type Counted = {
  receiptId: string
  rowVersion: number
  lines: CafeReceiptLine[]
  /** Each line's explanation as the server holds it, so Send saves exactly the lines that differ. */
  server: Record<string, ServerExplanation>
  photosUnavailable: boolean
}

type ServerExplanation = CafeReceiptExplanation & { condition_updated_at: string | null }

const explanationOf = ({ conditions, condition_reason }: CafeReceiptExplanation): CafeReceiptExplanation => ({ conditions, condition_reason })

/** Send's refusal names the line: `CAFE_RECEIPT_<WHAT>_REQUIRED: line <id>: <item name>`. */
function sendRefusal(message: string): { lineId: string | null; missing: EvidenceValidation } | null {
  const match = /CAFE_RECEIPT_(REASON_AND_PHOTO|REASON|PHOTO)_REQUIRED(?:: line ([0-9a-f-]{36}))?/.exec(message)
  if (!match) return null
  const missing = match[1] === 'REASON_AND_PHOTO' ? 'both' : match[1] === 'REASON' ? 'reason' : 'photo'
  return { lineId: match[2] ?? null, missing }
}

function blankEntries(items: readonly CafeReceivableItem[]): Record<string, Entry> {
  return Object.fromEntries(items.map(item => [item.id, { quantity: '', unitId: item.defaultUnitId, changingUnit: false, damagedWrong: false }]))
}

function hasEntryContent(item: CafeReceivableItem, entry: Entry | undefined): boolean {
  return Boolean(entry && (entry.quantity.trim() || entry.damagedWrong || entry.unitId !== item.defaultUnitId))
}

function hasDraftContent(items: readonly CafeReceivableItem[], entries: Record<string, Entry>): boolean {
  return items.some(item => hasEntryContent(item, entries[item.id]))
}

/** Only the rows the person touched are kept on the device. */
function storedEntries(items: readonly CafeReceivableItem[], entries: Record<string, Entry>): Record<string, CafeReceiveDraftEntry> {
  return Object.fromEntries(items.filter(item => hasEntryContent(item, entries[item.id])).map(item => {
    const entry = entries[item.id]
    return [item.id, { name: item.name, quantity: entry.quantity, unitId: entry.unitId, damagedWrong: entry.damagedWrong }]
  }))
}

/**
 * A stored count comes back only onto the item and ESB unit it was typed in. A line whose item is
 * no longer receivable, or whose unit is no longer offered, stays blank and is named, since a
 * number moved onto another unit would be a different quantity (AC-1005).
 */
function restoreEntries(items: readonly CafeReceivableItem[], stored: Record<string, CafeReceiveDraftEntry> | null) {
  const entries = blankEntries(items)
  const notRestored: string[] = []
  for (const [itemId, entry] of Object.entries(stored ?? {})) {
    const item = items.find(candidate => candidate.id === itemId)
    if (!item || !item.units.some(unit => unit.id === entry.unitId)) {
      notRestored.push(item?.name ?? entry.name)
      continue
    }
    entries[item.id] = { quantity: entry.quantity, unitId: entry.unitId, changingUnit: false, damagedWrong: entry.damagedWrong }
  }
  return { entries, notRestored }
}

/** A photo waiting to upload belongs to one person's line on one receipt, whatever date is on screen. */
function receivePhotoDraftKey(personId: string, receiptId: string, lineId: string): string {
  return JSON.stringify([personId, receiptId, lineId])
}

function submitErrorKey(message: string) {
  if (message.includes('CAFE_RECEIPT_ITEM_NOT_RECEIVABLE')) return 'cafe.receive.error.itemUnavailable' as const
  if (message.includes('CAFE_RECEIPT_CLIENT_KEY_CONFLICT')) return 'cafe.receive.error.keyConflict' as const
  if (message.includes('CAFE_RECEIPT_COUNTED_PENDING') || message.includes('cafe_receipts_one_counted_per_receiver_branch_uk')) {
    return 'cafe.receive.error.countedPending' as const
  }
  if (message.includes('CAFE_RECEIPT_ARRIVAL_DATE')) return 'cafe.receive.error.arrivalDate' as const
  return 'cafe.receive.error.submit' as const
}

/** Submit refusals another Lock counts cannot fix: the lock step says so and sends the person back to the page. */
function lockStepDeadEnd(key: string) {
  if (key === 'cafe.receive.error.keyConflict') return 'cafe.receive.confirm.keyConflict' as const
  if (key === 'cafe.receive.error.countedPending') return 'cafe.receive.confirm.countedPending' as const
  return null
}

/** A PO's identity line: number (or the given title), supplier and PO date; never a quantity or price. */
function PoIdentity({ po, title, titleId }: { po: CafeOpenPoIdentity; title: string; titleId: string }) {
  const t = useT()
  return (
    <span className="cafe-receive__open-po-topline">
      <strong id={titleId}>{title}</strong>
      <span>{po.supplierName || t('cafe.receive.openPos.supplierUnknown')}</span>
      <span>{formatWeekdayDayMonth(po.poDate)}</span>
    </span>
  )
}

export function CafeReceivePage() {
  const t = useT()
  const { locale } = useI18n()
  const auth = useAuth()
  const { options: streamOptions, stream, homeStream, myStreamKeys, resolve, adopt, setStream, branchId } = useCafeStream()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const canCapture = auth.status === 'authenticated' && canCaptureCafe({
    affiliated: auth.viewer.affiliated,
    accessRoles,
  })
  const canBackdate = accessRoles.includes('ops_lead') || accessRoles.includes('admin')
  const canReview = canReviewCafe(accessRoles)
  const isDesktop = useIsDesktop()
  const today = useMemo(() => wibToday(), [])
  const dateBounds = cafeReceiptArrivalDateBounds(today, canBackdate)
  const pageLabel = t('nav.cafe.receive')
  useDocumentTitle(t('common.docTitle', { page: `${pageLabel} · ${t('nav.cafe')}` }))

  const [catalogReady, setCatalogReady] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [retryKey, setRetryKey] = useState(0)
  const [openPoRetryKey, setOpenPoRetryKey] = useState(0)
  // The list waits behind its toggle: listed on open, its cards push the first capture row past DESIGN's 300px.
  const [openPoPickerExpanded, setOpenPoPickerExpanded] = useState(false)
  const [openPoState, setOpenPoState] = useState<OpenPoState>({ branchId: null, status: 'loading', cache: null })
  const [selectedPoKey, setSelectedPoKey] = useState<{ branchId: string; poNumber: string } | null>(null)
  const openPoPickerToggleRef = useRef<HTMLButtonElement>(null)
  const [items, setItems] = useState<CafeReceivableItem[]>([])
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [arrivalDate, setArrivalDate] = useState(today)
  const [clientKey, setClientKey] = useState('')
  const [itemsStreamScope, setItemsStreamScope] = useState<string | null>(null)
  const [hydratedDraftScope, setHydratedDraftScope] = useState<string | null>(null)
  const [draftSaved, setDraftSaved] = useState(false)
  const [discardingDraft, setDiscardingDraft] = useState(false)
  const [notRestored, setNotRestored] = useState<string[]>([])
  const [pendingStream, setPendingStream] = useState<ProductionStream | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<ReturnType<typeof submitErrorKey> | 'cafe.receive.error.send' | 'cafe.receive.error.evidence' | 'cafe.receive.draft.saveFailed' | null>(null)
  const [counted, setCounted] = useState<Counted | null>(null)
  const [evidenceValidation, setEvidenceValidation] = useState<Record<string, EvidenceValidation>>({})
  const [difference, setDifference] = useState<CafeReceiptDifferenceSummary | 'checking'>('checking')
  const [deliveryNote, setDeliveryNote] = useState('')
  const [sent, setSent] = useState(false)
  const [recent, setRecent] = useState<CafeReceipt[]>([])
  const isOnline = !useIsOffline()
  const requestGeneration = useRef(0)
  const lockButtonRef = useRef<HTMLButtonElement>(null)
  const countedHeadingRef = useRef<HTMLHeadingElement>(null)
  const arrivalDateRef = useRef<HTMLInputElement>(null)
  const focusDateAfterDiscard = useRef(false)
  const itemScopeKey = stream ? JSON.stringify([stream.branch.id, stream.activity]) : null
  const draftScope = useMemo<CafeReceiveDraftScope | null>(() => viewerId && stream ? {
    personId: viewerId,
    branchId: stream.branch.id,
    activity: stream.activity,
    arrivalDate,
  } : null, [arrivalDate, stream, viewerId])
  const draftScopeKey = draftScope
    ? JSON.stringify([draftScope.personId, draftScope.branchId, draftScope.activity, draftScope.arrivalDate])
    : null

  useEffect(() => {
    let active = true
    setCatalogReady(false)
    void resolve().then(catalog => {
      if (!active) return
      adopt(catalog)
      setCatalogReady(true)
    }).catch(() => {
      if (active) setLoadState('error')
    })
    return () => { active = false }
  }, [adopt, resolve, retryKey])

  useEffect(() => {
    const branchId = stream?.branch.id
    if (!branchId || !canCapture) {
      setOpenPoState({ branchId: branchId ?? null, status: 'ready', cache: null })
      return
    }
    let active = true
    setOpenPoState({ branchId, status: 'loading', cache: null })
    void listCafeOpenPoIdentities(branchId).then(cache => {
      if (active) setOpenPoState({ branchId, status: 'ready', cache })
    }).catch((cause: unknown) => {
      const forbidden = cause instanceof Error && cause.message.includes('CAFE_OPEN_PO_FORBIDDEN')
      if (active) setOpenPoState({ branchId, status: forbidden ? 'forbidden' : 'error', cache: null })
    })
    return () => { active = false }
  }, [canCapture, openPoRetryKey, stream?.branch.id])

  useEffect(() => {
    if (!catalogReady) return
    const generation = ++requestGeneration.current
    let active = true
    setItems([])
    setEntries({})
    setItemsStreamScope(null)
    setLoadState('loading')
    if (!stream || !canCapture) {
      setLoadState('ready')
      return () => { active = false }
    }
    void listCafeReceivableItems(stream).then(nextItems => {
      if (!active || generation !== requestGeneration.current) return
      setItems(nextItems)
      setEntries(blankEntries(nextItems))
      setItemsStreamScope(itemScopeKey)
      setLoadState('ready')
    }).catch(() => {
      if (!active || generation !== requestGeneration.current) return
      setLoadState('error')
    })
    return () => { active = false }
  }, [canCapture, catalogReady, itemScopeKey, retryKey, stream, stream?.activity, stream?.branch.id])

  useEffect(() => {
    if (!draftScope || !draftScopeKey || !itemScopeKey || itemsStreamScope !== itemScopeKey || loadState !== 'ready') return
    const draft = loadCafeReceiveDraft(draftScope)
    const restored = restoreEntries(items, draft?.entries ?? null)
    setEntries(restored.entries)
    setNotRestored(restored.notRestored)
    setClientKey(draft?.clientKey ?? newCafeReceiptClientKey())
    setHydratedDraftScope(draftScopeKey)
    setDraftSaved(Boolean(draft))
  }, [draftScope, draftScopeKey, itemScopeKey, items, itemsStreamScope, loadState])

  // FR-1010: every change to the counts is kept on this device until it is locked or discarded.
  useEffect(() => {
    if (itemsStreamScope !== itemScopeKey) return
    persistCurrentDraft()
    // persistCurrentDraft reads exactly these values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientKey, draftScope, draftScopeKey, entries, hydratedDraftScope, itemScopeKey, items, itemsStreamScope])

  // Drafts left behind for a week, on this device, are dropped.
  useEffect(() => {
    pruneCafeReceiveDrafts()
    void pruneOfflinePhotoDrafts()
  }, [])

  // Confirming Discard removes the band link that opened it, so focus goes to the arrival date.
  useEffect(() => {
    if (discardingDraft || !focusDateAfterDiscard.current) return
    focusDateAfterDiscard.current = false
    arrivalDateRef.current?.focus()
  }, [discardingDraft])

  const loadRecent = useCallback(() => {
    if (!viewerId || !canCapture) return
    // Only a Counted receipt's photos show here (after Continue), so only those are read and signed.
    void listCafeReceipts(['Counted', 'Submitted', 'Approved', 'Rejected'], { receivedBy: viewerId, limit: 10, photosFor: ['Counted'] })
      .then(receipts => {
        setRecent(receipts)
        pruneCafeReceiptExplanationDrafts(viewerId, receipts)
      })
      .catch(() => setRecent([]))
  }, [canCapture, viewerId])
  useEffect(loadRecent, [loadRecent])
  const countedReceiptId = counted?.receiptId ?? null
  // The lock step closes with its opener gone, and Send replaces its own button, so focus lands on
  // the result heading instead of the page body.
  useEffect(() => { if (countedReceiptId) countedHeadingRef.current?.focus() }, [countedReceiptId, sent])

  // FR-1010: an explanation changed but not saved stays on this device until it is saved or sent.
  useEffect(() => {
    if (!counted || !viewerId) return
    const unsaved = sent ? {} : Object.fromEntries(counted.lines
      .filter(line => explanationDiffers(line, counted.server[line.id]))
      .map(line => [line.id, { ...explanationOf(line), serverUpdatedAt: counted.server[line.id]?.condition_updated_at ?? null }]))
    writeCafeReceiptExplanationDrafts(viewerId, counted.receiptId, unsaved)
  }, [counted, sent, viewerId])

  // FR-1012: labels arrive once the counts are locked; any failure reads "not yet known" (NFR-1006).
  useEffect(() => {
    if (!countedReceiptId) return
    let active = true
    setDifference('checking')
    void listCafeReceiptDifferences([countedReceiptId])
      .then(rows => summarizeCafeReceiptDifferences(rows))
      .catch((): CafeReceiptDifferenceSummary => ({ known: false, asOf: null }))
      .then(summary => { if (active) setDifference(summary) })
    return () => { active = false }
  }, [countedReceiptId])

  const poStateForBranch = stream && openPoState.branchId === stream.branch.id
    ? openPoState
    : { branchId: stream?.branch.id ?? null, status: 'loading' as const, cache: null }
  const selectedPo = stream && selectedPoKey?.branchId === stream.branch.id
    ? poStateForBranch.cache?.purchaseOrders.find(po => po.poNumber === selectedPoKey.poNumber) ?? null
    : null

  const lines = items.flatMap(item => {
    const entry = entries[item.id]
    const quantity = entry ? normalizeCafeReceiptQuantity(entry.quantity) : null
    return entry && quantity !== null ? [{ item, entry, quantity }] : []
  })
  const lockLines = lines.map(({ item, entry, quantity }) => ({
    unitId: entry.unitId,
    name: item.name,
    quantity,
    unit: item.units.find(unit => unit.id === entry.unitId)?.name ?? '',
    damagedWrong: entry.damagedWrong,
  }))
  const recentForStream = recent.filter(receipt => receipt.branch_id === stream?.branch.id && receipt.activity === stream?.activity)
  const captureReady = Boolean(draftScopeKey) && hydratedDraftScope === draftScopeKey
  const hasDraftData = hasDraftContent(items, entries)
  const invalidCount = items.filter(item => isInvalidEntry(entries[item.id])).length
  const canLock = Boolean(stream) && isOnline && !busy && lines.length > 0 && invalidCount === 0
    && Boolean(draftScopeKey) && hydratedDraftScope === draftScopeKey && clientKey !== ''
  const canSwitch = !busy && counted === null

  const filterRows = useMemo(() => items.map(item => ({
    ...item,
    rowId: item.id,
    kind: item.kind ?? 'Unclassified' as const,
    itemName: item.name,
    groupKey: 'receive',
  })), [items])
  // Filters beyond search are desktop-only (DESIGN: first capture row within 300px on phone).
  const itemTable = useKitchenItemTable({ data: filterRows, search, kind: 'All', category: isDesktop ? category : 'All' })
  const searchMatchedItems = itemTable.getFilteredRowModel().rows.map(row => row.original)
  const selectedPoUnitIds = new Set((selectedPo?.items ?? []).flatMap(poItem => poItem.itemUnitId ? [poItem.itemUnitId] : []))
  const isOnSelectedPo = (item: Pick<CafeReceivableItem, 'units'>) => item.units.some(unit => selectedPoUnitIds.has(unit.id))
  // Search and category narrow the picked PO's rows as they do the rest, so a match is never buried under the PO.
  const rowGroups = searchMatchedItems.length === 0 ? [] : selectedPo
    ? [
        { key: 'po', label: t('cafe.receive.openPos.onPo', { poNumber: selectedPo.poNumber }), items: searchMatchedItems.filter(isOnSelectedPo) },
        { key: 'other', label: t('cafe.receive.openPos.notOnPo'), items: searchMatchedItems.filter(item => !isOnSelectedPo(item)) },
      ].filter(group => group.items.length > 0)
    : [{ key: 'all', label: null, items: searchMatchedItems }]
  const receivableUnitIds = new Set(items.flatMap(item => item.units.map(unit => unit.id)))
  const selectedPoNotInMos = (selectedPo?.items ?? [])
    .filter(poItem => !poItem.itemUnitId || !receivableUnitIds.has(poItem.itemUnitId))
    .map(poItem => poItem.itemName)
  const categories = useMemo(() => [
    'All',
    ...Array.from(new Set(items.map(item => item.category ?? '').filter(Boolean)))
      .sort((a, b) => kitchenCategoryLabel(t, a).localeCompare(kitchenCategoryLabel(t, b))),
  ], [items, t])

  /** Picking only groups rows; each line keeps its default unit until the person changes it (FR-1007). */
  const pickPurchaseOrder = useCallback((po: CafeOpenPoIdentity | null) => {
    if (!stream) return
    setSelectedPoKey(po ? { branchId: stream.branch.id, poNumber: po.poNumber } : null)
    setOpenPoPickerExpanded(false)
    openPoPickerToggleRef.current?.focus()
  }, [stream])

  const openPos = poStateForBranch.cache?.purchaseOrders ?? []
  // A stale or never-synced list may no longer match ESB, so its POs show but cannot be picked.
  const openPosPickable = Boolean(poStateForBranch.cache?.asOf && poStateForBranch.cache.isCurrent)

  function closeOpenPoListOnEscape(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape' || !openPoPickerExpanded) return
    setOpenPoPickerExpanded(false)
    openPoPickerToggleRef.current?.focus()
  }

  const patchEntry = useCallback((itemId: string, patch: Partial<Entry>) => {
    setEntries(current => current[itemId] ? { ...current, [itemId]: { ...current[itemId], ...patch } } : current)
    setError(null)
  }, [])

  function persistCurrentDraft(): boolean {
    if (!draftScope || !draftScopeKey || hydratedDraftScope !== draftScopeKey) return false
    if (!hasDraftContent(items, entries)) {
      clearCafeReceiveDraft(draftScope)
      setDraftSaved(false)
      return true
    }
    const saved = saveCafeReceiveDraft(draftScope, { clientKey, entries: storedEntries(items, entries) })
    setDraftSaved(saved)
    if (!saved) setError('cafe.receive.draft.saveFailed')
    return saved
  }

  const chooseStream = useCallback((next: ProductionStream) => {
    if (!canSwitch) return
    if (hasDraftData) setPendingStream(next)
    else setStream(next)
  }, [canSwitch, hasDraftData, setStream])

  /**
   * Open a Counted receipt, with this person's unsaved explanations from this device laid over the
   * server's. A draft started from an older server value is dropped: the later save wins.
   */
  function openCounted(receiptId: string, rowVersion: number, lines: CafeReceiptLine[], photosUnavailable = false) {
    const drafts = viewerId ? readCafeReceiptExplanationDrafts(viewerId, receiptId) : {}
    setCounted({
      receiptId,
      rowVersion,
      lines: lines.map(line => {
        const draft = drafts[line.id]
        return draft && sameServerStamp(draft.serverUpdatedAt, line.condition_updated_at) ? { ...line, ...explanationOf(draft) } : line
      }),
      server: Object.fromEntries(lines.map(line => [line.id, { ...explanationOf(line), condition_updated_at: line.condition_updated_at }])),
      photosUnavailable,
    })
    setEvidenceValidation({})
  }

  function patchCountedLine(lineId: string, patch: Pick<Partial<CafeReceiptLine>, 'conditions' | 'condition_reason' | 'photos'>) {
    setCounted(current => current ? {
      ...current,
      lines: current.lines.map(line => line.id === lineId ? { ...line, ...patch } : line),
    } : current)
    setEvidenceValidation(current => {
      if (!(lineId in current)) return current
      const next = { ...current }
      delete next[lineId]
      return next
    })
    setError(null)
  }

  function markSaved(saved: Record<string, ServerExplanation>) {
    setCounted(current => current ? {
      ...current,
      lines: current.lines.map(line => saved[line.id] ? { ...line, ...saved[line.id] } : line),
      server: { ...current.server, ...saved },
    } : current)
  }

  async function handleCountSubmit() {
    if (!stream || !canLock) return
    setBusy(true)
    setError(null)
    try {
      const result = await submitCafeReceipt(stream, arrivalDate, clientKey, lines.map(({ entry, quantity }) => ({
        item_unit_id: entry.unitId,
        quantity,
        damaged_wrong: entry.damagedWrong,
      })))
      if (draftScope) clearCafeReceiveDraft(draftScope)
      setDraftSaved(false)
      setNotRestored([])
      openCounted(result.receipt_id, result.row_version, result.lines)
      setConfirming(false)
      loadRecent()
    } catch (cause) {
      const key = submitErrorKey(cause instanceof Error ? cause.message : '')
      setError(key)
      if (key === 'cafe.receive.error.keyConflict' || key === 'cafe.receive.error.countedPending') loadRecent()
    } finally {
      setBusy(false)
    }
  }

  async function handleSend(receiptId: string, rowVersion: number, note: string) {
    const target = counted
    if (!isOnline || busy || !target || target.receiptId !== receiptId) return
    const validation: Record<string, EvidenceValidation> = {}
    for (const line of target.lines) {
      if (line.conditions.length === 0) continue
      const missingReason = !line.condition_reason?.trim()
      // Unread photos are not known to be missing; the server's own check on Send decides.
      const missingPhoto = line.photos.length === 0 && !target.photosUnavailable
      if (missingReason && missingPhoto) validation[line.id] = 'both'
      else if (missingReason) validation[line.id] = 'reason'
      else if (missingPhoto) validation[line.id] = 'photo'
    }
    setEvidenceValidation(validation)
    if (Object.keys(validation).length > 0) return

    setBusy(true)
    setError(null)
    const saved: Record<string, ServerExplanation> = {}
    try {
      // Every line whose flag or reason differs from the server is saved first, an unflagged one included.
      for (const line of target.lines) {
        if (!explanationDiffers(line, target.server[line.id])) continue
        saved[line.id] = await saveCafeReceiptLineExplanation(line.id, line.conditions.includes('damaged_wrong'), line.condition_reason ?? '')
      }
      await sendCafeReceiptForReview(receiptId, rowVersion, note)
      if (viewerId) {
        await Promise.all(target.lines.map(line => clearOfflinePhotoDraft(receivePhotoDraftKey(viewerId, receiptId, line.id))))
      }
      setSent(true)
      loadRecent()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ''
      const refusal = sendRefusal(message)
      const refusedLine = refusal && target.lines.find(line => line.id === refusal.lineId)
      if (refusal && refusedLine) setEvidenceValidation({ [refusedLine.id]: refusal.missing })
      else setError(refusal ? 'cafe.receive.error.evidence' : 'cafe.receive.error.send')
    } finally {
      markSaved(saved)
      setBusy(false)
    }
  }

  function continueReceipt(receipt: CafeReceipt) {
    if (receipt.status !== 'Counted' || busy) return
    openCounted(receipt.id, receipt.row_version, receipt.lines, receipt.photosUnavailable)
    setDeliveryNote(receipt.delivery_note_number ?? '')
    setSent(false)
  }

  function startAnother() {
    const savedDraft = draftScope ? loadCafeReceiveDraft(draftScope) : null
    setCounted(null)
    setEvidenceValidation({})
    setSent(false)
    setDeliveryNote('')
    const restored = restoreEntries(items, savedDraft?.entries ?? null)
    setClientKey(savedDraft?.clientKey ?? newCafeReceiptClientKey())
    setEntries(restored.entries)
    setNotRestored(restored.notRestored)
    setDraftSaved(Boolean(savedDraft))
  }

  const picker = (
    <CafeStreamBar
      options={streamOptions}
      locationBranchId={branchId ?? undefined}
      stream={stream}
      homeStream={homeStream}
      myStreamKeys={myStreamKeys}
      onChange={chooseStream}
      disabled={!canSwitch}
      switchLabel={t(stream?.activity === 'bar' ? 'cafe.stream.switchBar' : 'cafe.stream.switchKitchen')}
      switchAriaLabel={t(stream?.activity === 'bar' ? 'cafe.stream.switchBarAria' : 'cafe.stream.switchKitchenAria')}
    />
  )
  const pageState = loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error' : busy ? 'saving' : 'default'
  const firstEvidenceErrorId = Object.keys(evidenceValidation)[0]

  function renderItemControls(item: Pick<CafeReceivableItem, 'id' | 'name' | 'units'>) {
    const entry = entries[item.id]
    const invalid = isInvalidEntry(entry)
    const unitName = item.units.find(unit => unit.id === entry?.unitId)?.name ?? ''
    const errorId = `cafe-receive-${item.id}-quantity-error`
    return (
      <CafeCaptureQuantityControl
        id={`cafe-receive-${item.id}`}
        itemName={item.name}
        quantityFor={t('cafe.receive.quantityFor', { item: item.name })}
        value={entry?.quantity ?? ''}
        unitName={unitName}
        invalid={invalid}
        describedById={invalid ? errorId : undefined}
        disabled={busy}
        units={item.units}
        selectedUnitId={entry?.unitId}
        changingUnit={entry?.changingUnit}
        onQuantityChange={quantity => patchEntry(item.id, { quantity })}
        onToggleUnit={() => patchEntry(item.id, { changingUnit: !entry?.changingUnit })}
        onUnitChange={unitId => patchEntry(item.id, { unitId })}
      >
        {/* DESIGN "Compact capture row": the flag shows once the row has a quantity to flag. */}
        {entry?.quantity.trim() && (
          <label className="cafe-receive__damage-flag">
            <input
              type="checkbox"
              aria-label={t('cafe.receive.damageFlagFor', { item: item.name })}
              checked={entry.damagedWrong}
              disabled={busy}
              onChange={event => patchEntry(item.id, { damagedWrong: event.target.checked })}
            />
            {t('cafe.receive.damageFlag')}
          </label>
        )}
      </CafeCaptureQuantityControl>
    )
  }

  function renderItemFeedback(item: Pick<CafeReceivableItem, 'id' | 'name' | 'units'>) {
    if (!isInvalidEntry(entries[item.id])) return null
    return <p id={`cafe-receive-${item.id}-quantity-error`} className="cafe-count__field-error" role="alert">{t('cafe.receive.quantityInvalid')}</p>
  }

  return (
    <PageFamilyFrame family="workspace" title={pageLabel} headClassName="cafe-capture-head" statusRow={picker} state={pageState}>
      <div className="cafe-capture-page cafe-count cafe-receive">
        {loadState === 'loading' && <LoadingShell count={3} />}
        {loadState === 'error' && (
          <ErrorState
            message={t('common.loadFailed', { what: t('common.what.items') })}
            onRetry={() => { setCatalogReady(false); setRetryKey(value => value + 1) }}
            retryLabel={t('common.retry')}
          />
        )}
        {loadState === 'ready' && !stream && (
          <EmptyState variant="next-step" title={t('cafe.receive.noStream.title')} copy={t('cafe.receive.noStream.copy')}>
            <CafeStreamChoices options={streamOptions} homeStream={homeStream} myStreamKeys={myStreamKeys} onChoose={chooseStream} />
          </EmptyState>
        )}
        {loadState === 'ready' && stream && !canCapture && (
          <p className="cafe-count__notice" role="status">{t('cafe.receive.readOnly')}</p>
        )}
        {loadState === 'ready' && stream && canCapture && counted && (
          <section className="cafe-receive__counted" aria-labelledby="cafe-receive-counted-title">
            <h2 id="cafe-receive-counted-title" ref={countedHeadingRef} tabIndex={-1}>{sent ? t('cafe.receive.sent.title') : t('cafe.receive.counted.title')}</h2>
            <p>{sent ? t('cafe.receive.sent.copy') : t('cafe.receive.counted.copy')}</p>
            {!sent && <p>{t('cafe.receive.conditionHelp')}</p>}
            {counted.photosUnavailable && <p role="status">{t('cafe.receipts.photosUnavailable')}</p>}
            <p className="cafe-receive__difference" role="status" aria-live="polite">
              {difference === 'checking' ? t('cafe.receive.difference.checking')
                : !difference.known ? t(sent ? 'cafe.receive.difference.unknownSent' : 'cafe.receive.difference.unknown')
                : difference.differing === 0 ? t('cafe.receive.difference.allMatch')
                : t('cafe.receive.difference.differ', { count: difference.differing, total: difference.total })}
            </p>
            <ul className="cafe-receipt-lines cafe-receive__counted-lines" aria-label={t('cafe.receive.counted.linesAria')}>
              {counted.lines.map(line => (
                <CafeReceiptLineRow
                  key={line.id}
                  name={line.item_name}
                  quantity={line.received_quantity}
                  unit={line.unit_name}
                  withDifference
                  outcome={difference !== 'checking' && difference.known ? difference.byUnit.get(line.item_unit_id) : undefined}
                >
                  {sent ? (
                    <CafeReceiptLineEvidence line={line} />
                  ) : (
                    <CafeReceiptLineCondition
                      line={line}
                      draftKey={viewerId ? receivePhotoDraftKey(viewerId, counted.receiptId, line.id) : undefined}
                      dirty={explanationDiffers(line, counted.server[line.id])}
                      photosUnavailable={counted.photosUnavailable}
                      disabled={busy}
                      validation={evidenceValidation[line.id]}
                      focusError={line.id === firstEvidenceErrorId}
                      onChange={patch => patchCountedLine(line.id, patch)}
                      onSaved={explanation => markSaved({ [line.id]: explanation })}
                    />
                  )}
                </CafeReceiptLineRow>
              ))}
            </ul>
            {!sent && (
              <div className="cafe-receive__send">
                <label htmlFor="cafe-receive-delivery-note">{t('cafe.receive.deliveryNote')}</label>
                <input
                  id="cafe-receive-delivery-note"
                  type="text"
                  autoComplete="off"
                  maxLength={64}
                  value={deliveryNote}
                  disabled={busy}
                  onChange={event => setDeliveryNote(event.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-touch"
                  disabled={!isOnline || busy}
                  onClick={() => void handleSend(counted.receiptId, counted.rowVersion, deliveryNote)}
                >
                  {busy ? t('common.working') : t('cafe.receive.send')}
                </button>
              </div>
            )}
            {error && <p className="cafe-count__field-error" role="alert">{t(error)}</p>}
            {sent && (
              <button type="button" className="btn btn-outline btn-touch" onClick={startAnother}>
                {t('cafe.receive.another')}
              </button>
            )}
          </section>
        )}
        {loadState === 'ready' && stream && canCapture && captureReady && !counted && (
          <>
            <div className="cafe-count__intro">
              <p className="cafe-receive__help">{t('cafe.receive.blindHelp')}</p>
              {/* With a draft the band says it is kept and how to send it; nothing is added above the rows. */}
              {!isOnline && !(draftSaved && hasDraftData) && <p className="cafe-count__notice" role="alert">{t('cafe.receive.offline')}</p>}
            </div>
            <div className="cafe-receive__date">
              <label htmlFor="cafe-receive-arrival">{t('cafe.receive.arrivalDate')}</label>
              <input
                id="cafe-receive-arrival"
                ref={arrivalDateRef}
                type="date"
                value={arrivalDate}
                min={dateBounds.min}
                max={dateBounds.max}
                disabled={busy}
                onChange={event => {
                  if (hasDraftData && !persistCurrentDraft()) return
                  setError(null)
                  setNotRestored([])
                  setArrivalDate(event.target.value || today)
                }}
              />
              <span className="cafe-receive__date-hint" aria-hidden="true">{formatWeekdayDayMonth(arrivalDate)}</span>
            </div>
            {items.length === 0 ? (
              <CafeItemsEmptyState stream={stream} />
            ) : (
              <>
                <section className="cafe-receive__open-pos" aria-labelledby="cafe-receive-open-pos-title" onKeyDown={closeOpenPoListOnEscape}>
                  <div className="cafe-receive__open-pos-head">
                    <div className="cafe-receive__open-pos-lead">
                      <h2 id="cafe-receive-open-pos-title" className="cafe-receive__open-pos-title">{t('cafe.receive.openPos.title')}</h2>
                      {selectedPo ? (
                        <div className="cafe-receive__open-po cafe-receive__open-po--picked" role="group" aria-labelledby="cafe-receive-picked-po">
                          <PoIdentity po={selectedPo} titleId="cafe-receive-picked-po" title={t('cafe.receive.openPos.onPo', { poNumber: selectedPo.poNumber })} />
                          {selectedPoNotInMos.length > 0 && (
                            <p className="cafe-receive__open-po-note">{t('cafe.receive.openPos.notInMos', { items: selectedPoNotInMos.join(', ') })}</p>
                          )}
                        </div>
                      ) : openPos.length > 0 && openPosPickable && (
                        <p className="cafe-receive__open-pos-help">{t('cafe.receive.openPos.help')}</p>
                      )}
                    </div>
                    {openPos.length > 0 && (
                      <div className="cafe-receive__open-po-actions">
                        <button
                          ref={openPoPickerToggleRef}
                          type="button"
                          className="btn btn-outline btn-touch"
                          aria-expanded={openPoPickerExpanded}
                          aria-controls="cafe-receive-open-po-list"
                          onClick={() => setOpenPoPickerExpanded(value => !value)}
                        >
                          {selectedPo
                            ? t('cafe.receive.openPos.change')
                            : t(openPos.length === 1 ? 'cafe.receive.openPos.choose.one' : 'cafe.receive.openPos.choose.other', { count: openPos.length })}
                        </button>
                        {selectedPo && (
                          <button type="button" className="btn btn-outline btn-touch" onClick={() => pickPurchaseOrder(null)}>
                            {t('cafe.receive.openPos.withoutPo')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {poStateForBranch.status === 'loading' && <p role="status">{t('cafe.receive.openPos.loading')}</p>}
                  {poStateForBranch.status === 'forbidden' && <p role="status">{t('cafe.receive.openPos.forbidden')}</p>}
                  {poStateForBranch.status === 'error' && (
                    <div className="cafe-receive__open-pos-state">
                      <p role="alert">{t('cafe.receive.openPos.error')}</p>
                      <button type="button" className="btn btn-outline btn-touch" onClick={() => setOpenPoRetryKey(value => value + 1)}>
                        {t('cafe.receive.openPos.retry')}
                      </button>
                    </div>
                  )}
                  {poStateForBranch.status === 'ready' && poStateForBranch.cache && (
                    <>
                      {!poStateForBranch.cache.asOf && <p role="status">{t('cafe.receive.openPos.notRead')}</p>}
                      {poStateForBranch.cache.asOf && !poStateForBranch.cache.isCurrent && (
                        <p role="status">{t('cafe.receive.openPos.stale', { time: formatWibShortDateTime(poStateForBranch.cache.asOf, locale) })}</p>
                      )}
                      {poStateForBranch.cache.asOf && poStateForBranch.cache.isCurrent && openPos.length === 0 && (
                        <p role="status">{t('cafe.receive.openPos.empty')}</p>
                      )}
                      {openPos.length > 0 && (
                        <ul
                          id="cafe-receive-open-po-list"
                          className="cafe-receive__open-po-list"
                          aria-label={t('cafe.receive.openPos.listAria')}
                          hidden={!openPoPickerExpanded}
                        >
                          {openPos.map((po, index) => {
                            const picked = selectedPo?.poNumber === po.poNumber
                            const hiddenItems = po.items.length - PO_CARD_ITEMS
                            return (
                              <li
                                key={po.poNumber}
                                className={picked ? 'cafe-receive__open-po cafe-receive__open-po--picked' : 'cafe-receive__open-po'}
                                aria-labelledby={`cafe-receive-open-po-${index}`}
                              >
                                <PoIdentity po={po} titleId={`cafe-receive-open-po-${index}`} title={po.poNumber} />
                                <ul className="cafe-receive__open-po-items">
                                  {po.items.slice(0, PO_CARD_ITEMS).map((item, itemIndex) => (
                                    <li className="cafe-receive__open-po-item" key={`${item.itemUnitId ?? item.itemName}-${itemIndex}`}>
                                      <span>{item.itemName}</span>
                                      {item.unitName && <span className="cafe-receive__open-po-unit">{item.unitName}</span>}
                                    </li>
                                  ))}
                                  {hiddenItems > 0 && (
                                    <li className="cafe-receive__open-po-more">{t('cafe.receive.openPos.more', { count: hiddenItems })}</li>
                                  )}
                                </ul>
                                {!openPosPickable ? (
                                  <p className="cafe-receive__open-po-note">{t('cafe.receive.openPos.staleCard')}</p>
                                ) : picked ? (
                                  <p className="cafe-receive__open-po-note">{t('cafe.receive.openPos.picked')}</p>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-touch"
                                    aria-label={t('cafe.receive.openPos.chooseThisAria', { poNumber: po.poNumber })}
                                    onClick={() => pickPurchaseOrder(po)}
                                  >
                                    {t('cafe.receive.openPos.chooseThis')}
                                  </button>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </>
                  )}
                </section>
                <KitchenToolbar
                  search={search}
                  onSearchChange={setSearch}
                  categories={isDesktop ? categories : undefined}
                  categoryId="cafe-receive-category"
                  categoryLabel={value => kitchenCategoryLabel(t, value)}
                  category={category}
                  onCategoryChange={setCategory}
                  searchPlaceholder={t('kitchen.log.searchPlaceholder')}
                  ariaLabel={t('kitchen.log.toolbarAria')}
                />
                {rowGroups.length === 0 && <p className="cafe-count__intro">{t('kitchen.filter.noMatch')}</p>}
                {rowGroups.map(group => (
                  <section className="cafe-receive__row-group" key={group.key} aria-labelledby={group.label ? `cafe-receive-rows-${group.key}` : undefined}>
                    {group.label && <h3 id={`cafe-receive-rows-${group.key}`} className="cafe-receive__row-group-label">{group.label}</h3>}
                    <CafeCaptureTable
                      rows={group.items}
                      caption={group.label ?? t('cafe.receive.listAria')}
                      quantityHeader={t('cafe.receive.quantityLabel')}
                      isDesktop={isDesktop}
                      renderControls={renderItemControls}
                      renderFeedback={renderItemFeedback}
                    />
                  </section>
                ))}
              </>
            )}
          </>
        )}
        {loadState === 'ready' && canCapture && recentForStream.length > 0 && (
          <section className="cafe-receive__recent" aria-labelledby="cafe-receive-recent-title">
            <h2 id="cafe-receive-recent-title">{t('cafe.receive.recent.title')}</h2>
            <ul>
              {recentForStream.map(receipt => (
                <li key={receipt.id}>
                  <span className="tabular">{formatWeekdayDayMonth(receipt.arrival_date)}</span>
                  <span>{t(receipt.lines.length === 1 ? 'cafe.receive.lines.one' : 'cafe.receive.lines.other', { count: receipt.lines.length })}</span>
                  <CafeReceiptState receipt={receipt} />
                  {receipt.photosUnavailable && <span className="cafe-receive__photos-unavailable">{t('cafe.receipts.photosUnavailable')}</span>}
                  {receipt.status === 'Counted' && receipt.id !== counted?.receiptId && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={!isOnline || busy}
                      onClick={() => continueReceipt(receipt)}
                    >
                      {t('cafe.receive.continue')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        <nav className="cafe-receive__links" aria-label={t('cafe.receive.linksAria')}>
          {canReview && <Link to="/cafe/receive/review">{t('cafe.receipts.review.title')}</Link>}
          <CafeReceiptIssuesLink canReview={canReview} receiverId={recent.length > 0 ? viewerId : null} />
        </nav>
        {loadState === 'ready' && stream && canCapture && captureReady && !counted && items.length > 0 && (
          <div className="cafe-capture-footer cafe-count__footer">
            <div className="cafe-receive__band-status">
              <div className="cafe-receive__band-row">
                <p className="cafe-count__tally" aria-live="polite">
                  {t(lines.length === 1 ? 'cafe.receive.lines.one' : 'cafe.receive.lines.other', { count: lines.length })}
                </p>
                {hasDraftData && (
                  <button type="button" className="cafe-receive__discard-draft" onClick={() => setDiscardingDraft(true)}>
                    {t('cafe.receive.draft.discard')}
                  </button>
                )}
              </div>
              {invalidCount > 0 && (
                <p className="cafe-count__field-error" role="status">
                  {t(invalidCount === 1 ? 'cafe.receive.fixInvalid.one' : 'cafe.receive.fixInvalid.other', { count: invalidCount })}
                </p>
              )}
              {error && !confirming && <p className="cafe-count__field-error" role="alert">{t(error)}</p>}
              {notRestored.length > 0 && (
                <p className="cafe-receive__band-note" role="status">
                  {t(notRestored.length === 1 ? 'cafe.receive.draft.notRestored.one' : 'cafe.receive.draft.notRestored.other', { items: notRestored.join(', ') })}
                </p>
              )}
              {draftSaved && hasDraftData && (
                <p className="cafe-receive__band-note" role="status">{t(isOnline ? 'cafe.receive.draft.saved' : 'cafe.receive.draft.offline')}</p>
              )}
            </div>
            <button
              ref={lockButtonRef}
              type="button"
              className="btn btn-primary cafe-count__submit"
              disabled={!canLock}
              onClick={() => setConfirming(true)}
            >
              {t('cafe.receive.countSubmit')}
            </button>
          </div>
        )}
        <CafeReceiveLockConfirm
          open={confirming && !counted}
          lines={lockLines}
          context={t('cafe.receive.confirm.context', { stream: streamLabel(t, stream), date: formatWeekdayDayMonth(arrivalDate) })}
          busy={busy}
          offline={!isOnline}
          error={error ? t(lockStepDeadEnd(error) ?? error) : null}
          canRetry={!error || lockStepDeadEnd(error) === null}
          returnFocusRef={lockButtonRef}
          onConfirm={() => void handleCountSubmit()}
          onCancel={() => setConfirming(false)}
        />
        <ConfirmDialog
          open={discardingDraft}
          title={t('cafe.receive.draft.discard.title')}
          body={t('cafe.receive.draft.discard.copy', {
            stream: streamLabel(t, stream),
            date: formatWeekdayDayMonth(arrivalDate),
          })}
          confirmLabel={t('cafe.receive.draft.discard')}
          cancelLabel={t('cafe.receive.draft.discard.cancel')}
          tone="destructive"
          onConfirm={async () => {
            if (draftScope) clearCafeReceiveDraft(draftScope)
            setEntries(blankEntries(items))
            setClientKey(newCafeReceiptClientKey())
            setDraftSaved(false)
            setNotRestored([])
            setError(null)
            focusDateAfterDiscard.current = true
            setDiscardingDraft(false)
          }}
          onCancel={() => setDiscardingDraft(false)}
        />
        <ConfirmDialog
          open={pendingStream !== null}
          title={t('cafe.receive.streamDraft.title')}
          body={t('cafe.receive.streamDraft.copy', {
            current: streamLabel(t, stream),
            date: formatWeekdayDayMonth(arrivalDate),
            next: pendingStream ? streamLabel(t, pendingStream) : '',
          })}
          confirmLabel={t('cafe.receive.streamDraft.confirm')}
          onConfirm={async () => {
            if (!pendingStream) return
            if (!persistCurrentDraft()) throw new Error(t('cafe.receive.draft.saveFailed'))
            setStream(pendingStream)
            setPendingStream(null)
          }}
          onCancel={() => setPendingStream(null)}
        />
      </div>
    </PageFamilyFrame>
  )
}
