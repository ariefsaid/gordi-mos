import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { CafeReceiptState } from '@/components/kitchen/cafe-receipt-state'
import { CafeReceiveLockConfirm } from '@/components/kitchen/cafe-receive-lock-confirm'
import { CafeReceiptLineRow } from '@/components/kitchen/cafe-receipt-difference'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import { canReviewCafe } from '@/lib/kitchen-gates'
import {
  cafeReceiptArrivalDateBounds,
  listCafeReceiptDifferences,
  listCafeReceipts,
  listCafeReceivableItems,
  newCafeReceiptClientKey,
  normalizeCafeReceiptQuantity,
  sendCafeReceiptForReview,
  submitCafeReceipt,
  summarizeCafeReceiptDifferences,
  type CafeReceipt,
  type CafeReceiptDifferenceSummary,
  type CafeReceivableItem,
} from '@/lib/db/cafe-receipts'
import { wibToday } from '@/lib/db/cafe-opening'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'
import { streamLabel } from '@/lib/kitchen-action-label'
import { useKitchenItemTable } from '@/lib/kitchen-item-list'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { useIsOffline } from '@/shell/use-is-offline'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import './cafe-count-page.css'
import './cafe-receive-page.css'

type Entry = { quantity: string; unitId: string; changingUnit: boolean }
type LoadState = 'loading' | 'ready' | 'error'

/** A typed quantity that is not a positive decimal; it blocks Count submit rather than being dropped. */
function isInvalidEntry(entry: Entry | undefined): boolean {
  return Boolean(entry?.quantity.trim()) && normalizeCafeReceiptQuantity(entry!.quantity) === null
}
type Counted = { receiptId: string; rowVersion: number; lines: Array<{ unitId: string; name: string; quantity: string; unit: string }> }

function blankEntries(items: readonly CafeReceivableItem[]): Record<string, Entry> {
  return Object.fromEntries(items.map(item => [item.id, { quantity: '', unitId: item.defaultUnitId, changingUnit: false }]))
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

export function CafeReceivePage() {
  const t = useT()
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
  const [catalogReady, setCatalogReady] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [retryKey, setRetryKey] = useState(0)
  const [items, setItems] = useState<CafeReceivableItem[]>([])
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [arrivalDate, setArrivalDate] = useState(today)
  const [clientKey, setClientKey] = useState(() => newCafeReceiptClientKey())
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<ReturnType<typeof submitErrorKey> | 'cafe.receive.error.send' | null>(null)
  const [counted, setCounted] = useState<Counted | null>(null)
  const [difference, setDifference] = useState<CafeReceiptDifferenceSummary | 'checking'>('checking')
  const [deliveryNote, setDeliveryNote] = useState('')
  const [sent, setSent] = useState(false)
  const [recent, setRecent] = useState<CafeReceipt[]>([])
  const isOnline = !useIsOffline()
  const requestGeneration = useRef(0)
  const lockButtonRef = useRef<HTMLButtonElement>(null)
  const countedHeadingRef = useRef<HTMLHeadingElement>(null)

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
    if (!catalogReady) return
    const generation = ++requestGeneration.current
    let active = true
    setItems([])
    setEntries({})
    setLoadState('loading')
    if (!stream || !canCapture) {
      setLoadState('ready')
      return () => { active = false }
    }
    void listCafeReceivableItems(stream).then(nextItems => {
      if (!active || generation !== requestGeneration.current) return
      setItems(nextItems)
      setEntries(blankEntries(nextItems))
      setLoadState('ready')
    }).catch(() => {
      if (!active || generation !== requestGeneration.current) return
      setLoadState('error')
    })
    return () => { active = false }
  }, [canCapture, catalogReady, retryKey, stream, stream?.activity, stream?.branch.id])

  const loadRecent = useCallback(() => {
    if (!viewerId || !canCapture) return
    void listCafeReceipts(['Counted', 'Submitted', 'Approved', 'Rejected'], { receivedBy: viewerId, limit: 10 })
      .then(setRecent)
      .catch(() => setRecent([]))
  }, [canCapture, viewerId])
  useEffect(loadRecent, [loadRecent])
  // The lock step closes with its opener gone, so focus lands on the result instead of the page body.
  useEffect(() => { if (counted) countedHeadingRef.current?.focus() }, [counted])

  // FR-1012: labels arrive once the counts are locked; any failure reads "not yet known" (NFR-1006).
  const countedReceiptId = counted?.receiptId ?? null
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
  }))
  const hasInput = items.some(item => Boolean(entries[item.id]?.quantity.trim()))
  const invalidCount = items.filter(item => isInvalidEntry(entries[item.id])).length
  const canLock = Boolean(stream) && isOnline && !busy && lines.length > 0 && invalidCount === 0
  const canSwitch = !busy && !hasInput && counted === null

  const filterRows = useMemo(() => items.map(item => ({
    ...item,
    rowId: item.id,
    kind: item.kind ?? 'Unclassified' as const,
    itemName: item.name,
    groupKey: 'receive',
  })), [items])
  // Filters beyond search are desktop-only (DESIGN: first capture row within 300px on phone).
  const itemTable = useKitchenItemTable({ data: filterRows, search, kind: 'All', category: isDesktop ? category : 'All' })
  const visibleItems = itemTable.getFilteredRowModel().rows.map(row => row.original)
  const categories = useMemo(() => [
    'All',
    ...Array.from(new Set(items.map(item => item.category ?? '').filter(Boolean)))
      .sort((a, b) => kitchenCategoryLabel(t, a).localeCompare(kitchenCategoryLabel(t, b))),
  ], [items, t])

  const patchEntry = useCallback((itemId: string, patch: Partial<Entry>) => {
    setEntries(current => current[itemId] ? { ...current, [itemId]: { ...current[itemId], ...patch } } : current)
    setError(null)
  }, [])

  const chooseStream = useCallback((next: ProductionStream) => {
    if (canSwitch) setStream(next)
  }, [canSwitch, setStream])

  async function handleCountSubmit() {
    if (!stream || !canLock) return
    setBusy(true)
    setError(null)
    try {
      const result = await submitCafeReceipt(stream, arrivalDate, clientKey, lines.map(({ entry, quantity }) => ({
        item_unit_id: entry.unitId,
        quantity,
      })))
      setCounted({ receiptId: result.receipt_id, rowVersion: result.row_version, lines: lockLines })
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
    if (!isOnline || busy) return
    setBusy(true)
    setError(null)
    try {
      await sendCafeReceiptForReview(receiptId, rowVersion, note)
      if (counted?.receiptId === receiptId) setSent(true)
      loadRecent()
    } catch {
      setError('cafe.receive.error.send')
    } finally {
      setBusy(false)
    }
  }

  function startAnother() {
    setCounted(null)
    setSent(false)
    setDeliveryNote('')
    setClientKey(newCafeReceiptClientKey())
    setEntries(blankEntries(items))
  }

  const streamBar = {
    options: streamOptions,
    locationBranchId: branchId ?? undefined,
    stream,
    homeStream,
    myStreamKeys,
    onChange: chooseStream,
    disabled: !canSwitch,
  }
  const pageState = loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error' : busy ? 'saving' : 'default'

  return (
    <CafePageFrame page="receive" streamBar={streamBar} state={pageState}>
      <div className="cafe-count cafe-receive">
        {loadState === 'loading' && <LoadingShell count={3} />}
        {loadState === 'error' && (
          <ErrorState
            message={t('common.loadFailed', { what: t('common.what.items') })}
            onRetry={() => { setCatalogReady(false); setRetryKey(value => value + 1) }}
            retryLabel={t('common.retry')}
          />
        )}
        {loadState === 'ready' && !stream && (
          <CafeStreamChoices options={streamOptions} homeStream={homeStream} myStreamKeys={myStreamKeys} onChoose={chooseStream} />
        )}
        {loadState === 'ready' && stream && !canCapture && (
          <p className="cafe-count__notice" role="status">{t('cafe.receive.readOnly')}</p>
        )}
        {loadState === 'ready' && stream && canCapture && counted && (
          <section className="cafe-receive__counted" aria-labelledby="cafe-receive-counted-title">
            <h2 id="cafe-receive-counted-title" ref={countedHeadingRef} tabIndex={-1}>{sent ? t('cafe.receive.sent.title') : t('cafe.receive.counted.title')}</h2>
            <p>{sent ? t('cafe.receive.sent.copy') : t('cafe.receive.counted.copy')}</p>
            <p className="cafe-receive__difference" role="status" aria-live="polite">
              {difference === 'checking' ? t('cafe.receive.difference.checking')
                : !difference.known ? t(sent ? 'cafe.receive.difference.unknownSent' : 'cafe.receive.difference.unknown')
                : difference.differing === 0 ? t('cafe.receive.difference.allMatch')
                : t('cafe.receive.difference.differ', { count: difference.differing, total: difference.total })}
            </p>
            <ul className="cafe-receipt-lines" aria-label={t('cafe.receive.counted.linesAria')}>
              {counted.lines.map(line => (
                <CafeReceiptLineRow
                  key={line.unitId}
                  name={line.name}
                  quantity={line.quantity}
                  unit={line.unit}
                  withDifference
                  outcome={difference !== 'checking' && difference.known ? difference.byUnit.get(line.unitId) : undefined}
                />
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
        {loadState === 'ready' && stream && canCapture && !counted && (
          <>
            <div className="cafe-count__intro">
              <p className="cafe-receive__help">{t('cafe.receive.blindHelp')}</p>
              {hasInput && <p className="cafe-count__switch-note" role="status">{t('cafe.receive.streamLocked')}</p>}
              {!isOnline && <p className="cafe-count__notice" role="alert">{t('cafe.receive.offline')}</p>}
            </div>
            <div className="cafe-receive__date">
              <label htmlFor="cafe-receive-arrival">{t('cafe.receive.arrivalDate')}</label>
              <input
                id="cafe-receive-arrival"
                type="date"
                value={arrivalDate}
                min={dateBounds.min}
                max={dateBounds.max}
                disabled={busy}
                onChange={event => setArrivalDate(event.target.value || today)}
              />
              <span className="cafe-receive__date-hint" aria-hidden="true">{formatWeekdayDayMonth(arrivalDate)}</span>
            </div>
            {items.length === 0 ? (
              <EmptyState variant="blank" title={t('cafe.receive.empty.title')} copy={t('cafe.receive.empty.copy')}>
                <Link to="/cafe/items" className="btn btn-outline btn-touch">{t('cafe.count.empty.action')}</Link>
              </EmptyState>
            ) : (
              <>
                <KitchenToolbar
                  search={search}
                  onSearchChange={setSearch}
                  categories={isDesktop ? categories : undefined}
                  categoryId="cafe-receive-category"
                  categoryLabel={value => kitchenCategoryLabel(t, value)}
                  category={category}
                  onCategoryChange={setCategory}
                  searchPlaceholder={t('cafe.receive.searchPlaceholder')}
                  ariaLabel={t('kitchen.log.toolbarAria')}
                />
                {visibleItems.length === 0 && <p className="cafe-count__intro">{t('kitchen.filter.noMatch')}</p>}
                <ul className="cafe-count__list" aria-label={t('cafe.receive.listAria')}>
                  {visibleItems.map(item => {
                    const entry = entries[item.id]
                    const invalid = isInvalidEntry(entry)
                    const unitName = item.units.find(unit => unit.id === entry?.unitId)?.name ?? ''
                    return (
                      <li className="cafe-count__row" key={item.id}>
                        <div className="cafe-count__item">
                          <div className="cafe-count__item-name">{item.name}</div>
                          {item.category && <div className="cafe-count__category">{kitchenCategoryLabel(t, item.category)}</div>}
                        </div>
                        <div className="cafe-count__input-group">
                          <label htmlFor={`cafe-receive-${item.id}`}>{t('cafe.receive.quantityLabel')}</label>
                          <div className="cafe-count__quantity-control">
                            <input
                              id={`cafe-receive-${item.id}`}
                              aria-label={t('cafe.receive.quantityFor', { item: item.name })}
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              value={entry?.quantity ?? ''}
                              aria-invalid={invalid || undefined}
                              disabled={busy}
                              onChange={event => patchEntry(item.id, { quantity: event.target.value })}
                            />
                            <span className="cafe-count__unit">{unitName}</span>
                          </div>
                          {item.units.length > 1 && (
                            <button
                              type="button"
                              className="cafe-receive__change-unit"
                              aria-expanded={entry?.changingUnit ?? false}
                              onClick={() => patchEntry(item.id, { changingUnit: !entry?.changingUnit })}
                            >
                              {t('cafe.receive.changeUnit')}
                            </button>
                          )}
                          {item.units.length > 1 && entry?.changingUnit && (
                            <fieldset className="cafe-receive__units" aria-label={t('cafe.receive.unitFor', { item: item.name })}>
                              <legend>{t('cafe.receive.unitLabel')}</legend>
                              {item.units.map(unit => (
                                <label key={unit.id}>
                                  <input
                                    type="radio"
                                    name={`cafe-receive-unit-${item.id}`}
                                    value={unit.id}
                                    checked={entry.unitId === unit.id}
                                    onChange={() => patchEntry(item.id, { unitId: unit.id })}
                                  />
                                  {unit.name}
                                </label>
                              ))}
                            </fieldset>
                          )}
                          {invalid && <p className="cafe-count__field-error" role="alert">{t('cafe.receive.quantityInvalid')}</p>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </>
        )}
        {loadState === 'ready' && canCapture && recent.length > 0 && (
          <section className="cafe-receive__recent" aria-labelledby="cafe-receive-recent-title">
            <h2 id="cafe-receive-recent-title">{t('cafe.receive.recent.title')}</h2>
            <ul>
              {recent.map(receipt => (
                <li key={receipt.id}>
                  <span className="tabular">{formatWeekdayDayMonth(receipt.arrival_date)}</span>
                  <span>{t(receipt.lines.length === 1 ? 'cafe.receive.lines.one' : 'cafe.receive.lines.other', { count: receipt.lines.length })}</span>
                  <CafeReceiptState receipt={receipt} />
                  {receipt.status === 'Counted' && receipt.id !== counted?.receiptId && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={!isOnline || busy}
                      onClick={() => void handleSend(receipt.id, receipt.row_version, '')}
                    >
                      {t('cafe.receive.send')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        <nav className="cafe-receive__links" aria-label={t('cafe.receive.linksAria')}>
          {canReview && <Link to="/cafe/receive/review">{t('cafe.receipts.review.title')}</Link>}
          <Link to="/cafe/receive/issues">{t('cafe.receipts.issues.title')}</Link>
        </nav>
        {loadState === 'ready' && stream && canCapture && !counted && items.length > 0 && (
          <div className="cafe-count__footer">
            <div className="cafe-receive__band-status">
              <p className="cafe-count__tally" aria-live="polite">
                {t(lines.length === 1 ? 'cafe.receive.lines.one' : 'cafe.receive.lines.other', { count: lines.length })}
              </p>
              {invalidCount > 0 && (
                <p className="cafe-count__field-error" role="status">
                  {t(invalidCount === 1 ? 'cafe.receive.fixInvalid.one' : 'cafe.receive.fixInvalid.other', { count: invalidCount })}
                </p>
              )}
              {error && !confirming && <p className="cafe-count__field-error" role="alert">{t(error)}</p>}
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
      </div>
    </CafePageFrame>
  )
}
