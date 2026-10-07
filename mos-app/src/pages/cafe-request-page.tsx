import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { CafeCaptureQuantityControl, CafeCaptureTable, type CafeItemQuantityEntry } from '@/components/kitchen/cafe-capture-table'
import { CafeRequestHistory } from '@/components/kitchen/cafe-request-history'
import { CafeStreamBar, CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import { canReviewCafe } from '@/lib/kitchen-gates'
import { newCafeReceiptClientKey } from '@/lib/db/cafe-receipts'
import {
  cafePurchaseRequestRequiredByBounds,
  listCafePurchaseRequests,
  submitCafePurchaseRequest,
  type CafePurchaseRequest,
} from '@/lib/db/cafe-purchase-requests'
import { wibToday } from '@/lib/db/cafe-opening'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'
import { isInvalidCafeItemEntry, useCafeItemCapture } from '@/lib/use-cafe-item-capture'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsOffline } from '@/shell/use-is-offline'
import './cafe-request-page.css'

type Sent = { requiredBy: string; note: string; lines: Array<{ name: string; quantity: string; unit: string }> }

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

  const [requiredBy, setRequiredBy] = useState('')
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [clientKey, setClientKey] = useState(() => newCafeReceiptClientKey())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ReturnType<typeof sendErrorKey> | null>(null)
  const [sent, setSent] = useState<Sent | null>(null)
  const [recent, setRecent] = useState<CafePurchaseRequest[]>([])
  const [recentFailed, setRecentFailed] = useState(false)
  const sending = useRef(false)
  const sentHeading = useRef<HTMLHeadingElement>(null)
  // Filters beyond search are desktop-only (DESIGN: first capture row within 300px on phone).
  const capture = useCafeItemCapture({ stream, enabled: canRequest, resolve, adopt, search, category: isDesktop ? category : 'All' })
  const { loadState, items, entries, lines, invalidCount, visibleItems, categories, patchEntry: patchCaptureEntry } = capture

  const loadRecent = useCallback(() => {
    if (!viewerId || !canRequest) return
    void listCafePurchaseRequests(['Submitted', 'Approved', 'Rejected'], { requestedBy: viewerId, limit: 10 })
      .then(rows => { setRecent(rows); setRecentFailed(false) })
      .catch(() => setRecentFailed(true))
  }, [canRequest, viewerId])
  useEffect(loadRecent, [loadRecent])

  const hasInput = capture.hasQuantity || requiredBy !== '' || note.trim() !== ''
  const dateProblem = requiredBy === '' ? 'cafe.request.requiredByMissing' as const
    : requiredBy < dateBounds.min || requiredBy > dateBounds.max ? 'cafe.request.requiredByInvalid' as const
    : null
  const canSend = isOnline && !busy && lines.length > 0 && invalidCount === 0 && dateProblem === null
  const canSwitch = !busy && !hasInput && sent === null

  const patchEntry = useCallback((itemId: string, patch: Partial<CafeItemQuantityEntry>) => {
    patchCaptureEntry(itemId, patch)
    setError(null)
  }, [patchCaptureEntry])

  // The Send button unmounts on success; the confirmation takes focus so its outcome is announced.
  useEffect(() => {
    if (sent) sentHeading.current?.focus()
  }, [sent])

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
      setSent({ requiredBy, note: note.trim(), lines: lines.map(({ item, quantity, unitName }) => ({ name: item.name, quantity, unit: unitName })) })
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
    capture.resetEntries()
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
  const ready = loadState === 'ready' && stream !== null && canRequest

  return (
    <PageFamilyFrame family="workspace" title={pageLabel} headClassName="cafe-capture-head" statusRow={picker} state={pageState}>
      <div className="cafe-capture-page cafe-count cafe-request">
        {loadState === 'loading' && <LoadingShell count={3} />}
        {loadState === 'error' && (
          <ErrorState
            message={t('common.loadFailed', { what: t('common.what.items') })}
            onRetry={capture.retry}
            retryLabel={t('common.retry')}
          />
        )}
        {loadState === 'ready' && !stream && (
          <EmptyState variant="next-step" title={t('cafe.request.noStream.title')} copy={t('cafe.request.noStream.copy')}>
            <CafeStreamChoices options={streamOptions} homeStream={homeStream} myStreamKeys={myStreamKeys} onChoose={chooseStream} />
          </EmptyState>
        )}
        {(canReview || (loadState === 'ready' && canRequest)) && (
          <div className="cafe-request__top">
            {loadState === 'ready' && canRequest && (
              <CafeRequestHistory requests={recent} failed={recentFailed} onRetry={loadRecent} />
            )}
            {canReview && <Link className="cafe-request__review-link" to="/cafe/request/review">{t('cafe.request.review.title')}</Link>}
          </div>
        )}
        {loadState === 'ready' && stream && !canRequest && (
          <p className="cafe-count__notice" role="status">{t('cafe.request.readOnly')}</p>
        )}
        {ready && sent && (
          <section className="cafe-receive__counted" aria-labelledby="cafe-request-sent-title">
            <h2 id="cafe-request-sent-title" ref={sentHeading} tabIndex={-1}>{t('cafe.request.sent.title')}</h2>
            <p>{t('cafe.request.sent.copy')}</p>
            <p className="cafe-request__sent-facts">
              {t('cafe.request.recent.neededBy', { date: formatWeekdayDayMonth(sent.requiredBy) })}
              {sent.note && <><br />{t('cafe.request.review.note', { note: sent.note })}</>}
            </p>
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
            </div>
            <div className="cafe-request__fields">
              <div className="cafe-request__field">
                <label htmlFor="cafe-request-required-by">{t('cafe.request.requiredBy')}</label>
                <div className="cafe-request__date-control">
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
                  {requiredBy && <span className="cafe-request__date-hint" aria-hidden="true">{formatWeekdayDayMonth(requiredBy)}</span>}
                </div>
              </div>
              <div className="cafe-request__field">
                <label htmlFor="cafe-request-note">{t('cafe.request.note')}</label>
                <textarea
                  id="cafe-request-note"
                  rows={2}
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
                  searchPlaceholder={t('kitchen.log.searchPlaceholder')}
                  ariaLabel={t('kitchen.log.toolbarAria')}
                />
                <CafeCaptureTable
                  rows={visibleItems}
                  caption={t('cafe.request.listAria')}
                  quantityHeader={t('cafe.request.quantityLabel')}
                  isDesktop={isDesktop}
                  state={visibleItems.length > 0 ? 'ready' : 'empty'}
                  emptyLabel={t('kitchen.filter.noMatch')}
                  renderControls={item => {
                    const invalid = isInvalidCafeItemEntry(entries[item.id])
                    const errorId = `cafe-request-${item.id}-quantity-error`
                    return (
                      <CafeCaptureQuantityControl
                        id={`cafe-request-${item.id}`}
                        itemName={item.name}
                        quantityFor={t('cafe.request.quantityFor', { item: item.name })}
                        value={entries[item.id]?.quantity ?? ''}
                        enterKeyHint="next"
                        unitName={item.units.find(unit => unit.id === entries[item.id]?.unitId)?.name ?? ''}
                        invalid={invalid}
                        describedById={invalid ? errorId : undefined}
                        disabled={busy}
                        units={item.units}
                        selectedUnitId={entries[item.id]?.unitId}
                        changingUnit={entries[item.id]?.changingUnit}
                        onQuantityChange={quantity => patchEntry(item.id, { quantity })}
                        onToggleUnit={() => patchEntry(item.id, { changingUnit: !entries[item.id]?.changingUnit })}
                        onUnitChange={unitId => patchEntry(item.id, { unitId })}
                      />
                    )
                  }}
                  renderFeedback={item => isInvalidCafeItemEntry(entries[item.id])
                    ? <p id={`cafe-request-${item.id}-quantity-error`} className="cafe-count__field-error" role="alert">{t('cafe.receive.quantityInvalid')}</p>
                    : null}
                />
              </>
            )}
          </>
        )}
        {ready && !sent && items.length > 0 && (
          <div className="cafe-capture-footer cafe-count__footer">
            <div className="cafe-receive__band-status">
              <p className="cafe-count__tally" aria-live="polite">
                {t(lines.length === 1 ? 'cafe.receive.lines.one' : 'cafe.receive.lines.other', { count: lines.length })}
              </p>
              {!isOnline ? (
                <p className="cafe-count__field-error" role="status">{t('cafe.request.offline')}</p>
              ) : invalidCount > 0 ? (
                <p className="cafe-count__field-error" role="status">
                  {t(invalidCount === 1 ? 'cafe.receive.fixInvalid.one' : 'cafe.receive.fixInvalid.other', { count: invalidCount })}
                </p>
              ) : lines.length > 0 && dateProblem && (
                <p className="cafe-count__field-error" role="status">{t(dateProblem)}</p>
              )}
              {error && isOnline && <p className="cafe-count__field-error" role="alert">{t(error)}</p>}
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
