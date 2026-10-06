import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { CafeItemQuantityRow, type CafeItemQuantityEntry } from '@/components/kitchen/cafe-item-quantity-row'
import { CafeRequestState } from '@/components/kitchen/cafe-request-state'
import { CafeStreamBar, CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import { canReviewCafe } from '@/lib/kitchen-gates'
import {
  listCafeReceivableItems,
  newCafeReceiptClientKey,
  normalizeCafeReceiptQuantity,
  type CafeReceivableItem,
} from '@/lib/db/cafe-receipts'
import {
  cafePurchaseRequestRequiredByBounds,
  listCafePurchaseRequests,
  submitCafePurchaseRequest,
  type CafePurchaseRequest,
} from '@/lib/db/cafe-purchase-requests'
import { wibToday } from '@/lib/db/cafe-opening'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'
import { useKitchenItemTable } from '@/lib/kitchen-item-list'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsOffline } from '@/shell/use-is-offline'
import './cafe-count-page.css'
import './cafe-receive-page.css'
import './cafe-request-page.css'

type LoadState = 'loading' | 'ready' | 'error'
type Sent = { lines: Array<{ name: string; quantity: string; unit: string }> }

function blankEntries(items: readonly CafeReceivableItem[]): Record<string, CafeItemQuantityEntry> {
  return Object.fromEntries(items.map(item => [item.id, { quantity: '', unitId: item.defaultUnitId, changingUnit: false }]))
}

/** A typed quantity that is not a positive decimal; it blocks Send rather than being dropped. */
function isInvalidEntry(entry: CafeItemQuantityEntry | undefined): boolean {
  return Boolean(entry?.quantity.trim()) && normalizeCafeReceiptQuantity(entry!.quantity) === null
}

function sendErrorKey(message: string) {
  if (message.includes('CAFE_PURCHASE_REQUEST_ITEM_NOT_AVAILABLE')) return 'cafe.request.error.itemUnavailable' as const
  if (message.includes('CAFE_PURCHASE_REQUEST_CLIENT_KEY_CONFLICT')) return 'cafe.request.error.keyConflict' as const
  if (message.includes('CAFE_PURCHASE_REQUEST_REQUIRED_BY')) return 'cafe.request.error.requiredBy' as const
  return 'cafe.request.error.send' as const
}

/** Request: a stream member lists what the stream needs and by when; a supervisor approves it. */
export function CafeRequestPage() {
  const t = useT()
  const auth = useAuth()
  const { options: streamOptions, stream, homeStream, myStreamKeys, resolve, adopt, setStream, branchId } = useCafeStream()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const canRequest = auth.status === 'authenticated' && canCaptureCafe({ affiliated: auth.viewer.affiliated, accessRoles })
  const canReview = canReviewCafe(accessRoles)
  const isDesktop = useIsDesktop()
  const isOnline = !useIsOffline()
  const today = useMemo(() => wibToday(), [])
  const dateBounds = cafePurchaseRequestRequiredByBounds(today)
  const pageLabel = t('cafe.request.title')
  useDocumentTitle(t('common.docTitle', { page: `${pageLabel} · ${t('nav.cafe')}` }))

  const [catalogReady, setCatalogReady] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [retryKey, setRetryKey] = useState(0)
  const [items, setItems] = useState<CafeReceivableItem[]>([])
  const [entries, setEntries] = useState<Record<string, CafeItemQuantityEntry>>({})
  const [requiredBy, setRequiredBy] = useState('')
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [clientKey, setClientKey] = useState(() => newCafeReceiptClientKey())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ReturnType<typeof sendErrorKey> | null>(null)
  const [sent, setSent] = useState<Sent | null>(null)
  const [recent, setRecent] = useState<CafePurchaseRequest[]>([])
  const requestGeneration = useRef(0)
  const sending = useRef(false)

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
    if (!stream || !canRequest) {
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
  }, [canRequest, catalogReady, retryKey, stream, stream?.activity, stream?.branch.id])

  const loadRecent = useCallback(() => {
    if (!viewerId || !canRequest) return
    void listCafePurchaseRequests(['Submitted', 'Approved', 'Rejected'], { requestedBy: viewerId, limit: 10 })
      .then(setRecent)
      .catch(() => setRecent([]))
  }, [canRequest, viewerId])
  useEffect(loadRecent, [loadRecent])

  const lines = items.flatMap(item => {
    const entry = entries[item.id]
    const quantity = entry ? normalizeCafeReceiptQuantity(entry.quantity) : null
    return entry && quantity !== null ? [{ item, entry, quantity }] : []
  })
  const hasInput = items.some(item => Boolean(entries[item.id]?.quantity.trim())) || requiredBy !== '' || note.trim() !== ''
  const invalidCount = items.filter(item => isInvalidEntry(entries[item.id])).length
  const dateProblem = requiredBy === '' ? 'cafe.request.requiredByMissing' as const
    : requiredBy < dateBounds.min || requiredBy > dateBounds.max ? 'cafe.request.requiredByInvalid' as const
    : null
  const canSend = isOnline && !busy && lines.length > 0 && invalidCount === 0 && dateProblem === null
  const canSwitch = !busy && !hasInput && sent === null

  const filterRows = useMemo(() => items.map(item => ({
    ...item,
    rowId: item.id,
    kind: item.kind ?? 'Unclassified' as const,
    itemName: item.name,
    groupKey: 'request',
  })), [items])
  // Filters beyond search are desktop-only (DESIGN: first capture row within 300px on phone).
  const itemTable = useKitchenItemTable({ data: filterRows, search, kind: 'All', category: isDesktop ? category : 'All' })
  const itemById = useMemo(() => new Map(items.map(item => [item.id, item])), [items])
  const visibleItems = itemTable.getFilteredRowModel().rows.flatMap(row => itemById.get(row.original.rowId) ?? [])
  const categories = useMemo(() => [
    'All',
    ...Array.from(new Set(items.map(item => item.category ?? '').filter(Boolean)))
      .sort((a, b) => kitchenCategoryLabel(t, a).localeCompare(kitchenCategoryLabel(t, b))),
  ], [items, t])

  const patchEntry = useCallback((itemId: string, patch: Partial<CafeItemQuantityEntry>) => {
    setEntries(current => current[itemId] ? { ...current, [itemId]: { ...current[itemId], ...patch } } : current)
    setError(null)
  }, [])

  const chooseStream = useCallback((next: ProductionStream) => {
    if (canSwitch) setStream(next)
  }, [canSwitch, setStream])

  async function handleSend() {
    if (!stream || !canSend || sending.current) return
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      await submitCafePurchaseRequest(stream, requiredBy, note, clientKey, lines.map(({ entry, quantity }) => ({
        item_unit_id: entry.unitId,
        quantity,
      })))
      setSent({
        lines: lines.map(({ item, entry, quantity }) => ({
          name: item.name,
          quantity,
          unit: item.units.find(unit => unit.id === entry.unitId)?.name ?? '',
        })),
      })
      loadRecent()
    } catch (cause) {
      const key = sendErrorKey(cause instanceof Error ? cause.message : '')
      setError(key)
      if (key === 'cafe.request.error.keyConflict') loadRecent()
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  function startAnother() {
    setSent(null)
    setRequiredBy('')
    setNote('')
    setClientKey(newCafeReceiptClientKey())
    setEntries(blankEntries(items))
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
    />
  )
  const pageState = loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error' : busy ? 'saving' : 'default'
  const ready = loadState === 'ready' && stream !== null && canRequest

  return (
    <PageFamilyFrame family="workspace" title={pageLabel} headClassName="cafe-count__head" statusRow={picker} state={pageState}>
      <div className="cafe-count cafe-receive cafe-request">
        {loadState === 'loading' && <LoadingShell count={3} />}
        {loadState === 'error' && (
          <ErrorState
            message={t('common.loadFailed', { what: t('common.what.items') })}
            onRetry={() => { setCatalogReady(false); setRetryKey(value => value + 1) }}
            retryLabel={t('common.retry')}
          />
        )}
        {loadState === 'ready' && !stream && (
          <EmptyState variant="next-step" title={t('cafe.request.noStream.title')} copy={t('cafe.request.noStream.copy')}>
            <CafeStreamChoices options={streamOptions} homeStream={homeStream} myStreamKeys={myStreamKeys} onChoose={chooseStream} />
          </EmptyState>
        )}
        {loadState === 'ready' && stream && !canRequest && (
          <p className="cafe-count__notice" role="status">{t('cafe.request.readOnly')}</p>
        )}
        {ready && sent && (
          <section className="cafe-receive__counted" aria-labelledby="cafe-request-sent-title">
            <h2 id="cafe-request-sent-title">{t('cafe.request.sent.title')}</h2>
            <p>{t('cafe.request.sent.copy')}</p>
            <ul className="cafe-receipt-lines" aria-label={t('cafe.request.sent.linesAria')}>
              {sent.lines.map(line => (
                <li key={`${line.name}-${line.unit}`}>
                  <span>{line.name}</span>
                  <span className="tabular">{t('cafe.receipts.quantityUnit', { quantity: line.quantity, unit: line.unit })}</span>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-outline btn-touch" onClick={startAnother}>
              {t('cafe.request.another')}
            </button>
          </section>
        )}
        {ready && !sent && (
          <>
            <div className="cafe-count__intro">
              <p className="cafe-receive__help">{t('cafe.request.help')}</p>
              {hasInput && <p className="cafe-count__switch-note" role="status">{t('cafe.request.streamLocked')}</p>}
              {!isOnline && <p className="cafe-count__notice" role="alert">{t('cafe.request.offline')}</p>}
            </div>
            <div className="cafe-request__fields">
              <div className="cafe-receive__date">
                <label htmlFor="cafe-request-required-by">{t('cafe.request.requiredBy')}</label>
                <input
                  id="cafe-request-required-by"
                  type="date"
                  required
                  value={requiredBy}
                  min={dateBounds.min}
                  max={dateBounds.max}
                  disabled={busy}
                  onChange={event => { setRequiredBy(event.target.value); setError(null) }}
                />
                {requiredBy && (
                  <span className="cafe-receive__date-hint" aria-hidden="true">{formatWeekdayDayMonth(requiredBy)}</span>
                )}
              </div>
              <div className="cafe-request__note">
                <label htmlFor="cafe-request-note">{t('cafe.request.note')}</label>
                <textarea
                  id="cafe-request-note"
                  rows={1}
                  maxLength={500}
                  value={note}
                  disabled={busy}
                  onChange={event => setNote(event.target.value)}
                />
              </div>
            </div>
            {items.length === 0 ? (
              <EmptyState variant="blank" title={t('cafe.request.empty.title')} copy={t('cafe.request.empty.copy')}>
                <Link to="/cafe/items" className="btn btn-outline btn-touch">{t('cafe.count.empty.action')}</Link>
              </EmptyState>
            ) : (
              <>
                <KitchenToolbar
                  search={search}
                  onSearchChange={setSearch}
                  categories={isDesktop ? categories : undefined}
                  categoryId="cafe-request-category"
                  categoryLabel={value => kitchenCategoryLabel(t, value)}
                  category={category}
                  onCategoryChange={setCategory}
                  searchPlaceholder={t('cafe.receive.searchPlaceholder')}
                  ariaLabel={t('kitchen.log.toolbarAria')}
                />
                {visibleItems.length === 0 && <p className="cafe-count__intro">{t('kitchen.filter.noMatch')}</p>}
                <ul className="cafe-count__list" aria-label={t('cafe.request.listAria')}>
                  {visibleItems.map(item => (
                    <CafeItemQuantityRow
                      key={item.id}
                      item={item}
                      entry={entries[item.id]}
                      idPrefix="cafe-request"
                      quantityLabel={t('cafe.request.quantityLabel')}
                      quantityFor={t('cafe.request.quantityFor', { item: item.name })}
                      invalid={isInvalidEntry(entries[item.id])}
                      disabled={busy}
                      onChange={patch => patchEntry(item.id, patch)}
                    />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
        {loadState === 'ready' && canRequest && recent.length > 0 && (
          <section className="cafe-receive__recent" aria-labelledby="cafe-request-recent-title">
            <h2 id="cafe-request-recent-title">{t('cafe.request.recent.title')}</h2>
            <ul>
              {recent.map(request => (
                <li key={request.id}>
                  <span className="tabular">{t('cafe.request.recent.neededBy', { date: formatWeekdayDayMonth(request.required_by) })}</span>
                  <span>{t(request.lines.length === 1 ? 'cafe.receive.lines.one' : 'cafe.receive.lines.other', { count: request.lines.length })}</span>
                  <CafeRequestState request={request} />
                </li>
              ))}
            </ul>
          </section>
        )}
        {canReview && (
          <nav className="cafe-receive__links" aria-label={t('cafe.request.linksAria')}>
            <Link to="/cafe/request/review">{t('cafe.request.review.title')}</Link>
          </nav>
        )}
        {ready && !sent && items.length > 0 && (
          <div className="cafe-count__footer">
            <div className="cafe-receive__band-status">
              <p className="cafe-count__tally" aria-live="polite">
                {t(lines.length === 1 ? 'cafe.receive.lines.one' : 'cafe.receive.lines.other', { count: lines.length })}
              </p>
              {invalidCount > 0 ? (
                <p className="cafe-count__field-error" role="status">
                  {t(invalidCount === 1 ? 'cafe.receive.fixInvalid.one' : 'cafe.receive.fixInvalid.other', { count: invalidCount })}
                </p>
              ) : lines.length > 0 && dateProblem && (
                <p className="cafe-count__field-error" role="status">{t(dateProblem)}</p>
              )}
              {error && <p className="cafe-count__field-error" role="alert">{t(error)}</p>}
            </div>
            <button
              type="button"
              className="btn btn-primary cafe-count__submit"
              disabled={!canSend}
              onClick={() => void handleSend()}
            >
              {busy ? t('common.working') : t('cafe.request.send')}
            </button>
          </div>
        )}
      </div>
    </PageFamilyFrame>
  )
}
