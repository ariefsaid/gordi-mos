import { useSearchParamState } from '@/lib/use-search-param-state'
import { CafeNoMatch } from '@/components/kitchen/cafe-no-match'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightIcon } from '@/shell/icons'
import { useAuth } from '@/auth/use-auth'
import { CaptureQuantityControl, CaptureRow, CaptureTable, type CafeItemQuantityEntry } from '@/components/kitchen/capture-row'
import { CafeRequestHistory } from '@/components/kitchen/cafe-request-history'
import { CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { CafeItemsEmptyState } from '@/components/kitchen/cafe-items-empty-state'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { CafeRequestBrief } from '@/components/cafe/redesign/cafe-request-brief'
import { Worksheet } from '@/components/cafe/redesign/worksheet'
import { ActionBar } from '@/components/ui/action-bar'
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
import { cafeItemLabel } from '@/lib/cafe-item-label'
import { isInvalidCafeItemEntry, useCafeItemCapture } from '@/lib/use-cafe-item-capture'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { recordsHref } from '@/lib/cafe-records/url-state'
import { streamLabel } from '@/lib/kitchen-action-label'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsOffline } from '@/shell/use-is-offline'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { Notice } from '@/components/ui/notice'
import '@/components/ui/Disclosure.css'
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
  // Needed by starts as tomorrow, the usual ask; the person changes it when it is different.
  const tomorrow = useMemo(() => {
    const next = new Date(`${today}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    return next.toISOString().slice(0, 10)
  }, [today])
  const [requiredBy, setRequiredBy] = useState(tomorrow)
  const [requiredByInvalid, setRequiredByInvalid] = useState(false)
  const [note, setNote] = useState('')
  const [search, setSearch] = useSearchParamState('q', '')
  const [category, setCategory] = useSearchParamState('category', 'All')
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

  const hasInput = capture.hasQuantity || requiredBy !== tomorrow || note !== ''
  const dateProblem = requiredBy === '' ? 'cafe.request.requiredByMissing' as const
    : requiredByInvalid || requiredBy < dateBounds.min || requiredBy > dateBounds.max ? 'cafe.request.requiredByInvalid' as const
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
      setSent({ requiredBy, note: note.trim(), lines: lines.map(({ item, quantity, unitName }) => ({ name: cafeItemLabel(item), quantity, unit: unitName })) })
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
    setRequiredBy(tomorrow)
    setNote('')
    setClientKey(newCafeReceiptClientKey())
    capture.resetEntries()
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
  const ready = loadState === 'ready' && stream !== null && canRequest

  const instructions = (
    <details className="cafe-request__scope-copy"><summary>{t('cafe.capture.instructions')}</summary>
      <p>{t('cafe.request.help', { stream: streamLabel(t, stream) })}</p>
      {hasInput && <p className="cafe-count__switch-note" role="status">{t('cafe.request.streamLocked')}</p>}
    </details>
  )

  return (
    <CafePageFrame page="request" streamBar={streamBar} state={pageState}
      recordsHref={recordsHref({ question: 'requested', reading: 'entries', stream: stream ? { branchId: stream.branch.id, activity: stream.activity } : null, today: wibToday() })}>
      <div className="cafe-capture-page cafe-count cafe-request">
        {canReview && <nav className="cafe-capture-page-links" aria-label={t('cafe.request.linksAria')}>
          <Link to="/cafe/review?queue=requests">{t('cafe.request.review.title')}<ArrowRightIcon /></Link>
        </nav>}
        {loadState === 'loading' && <LoadingShell count={3} />}
        {loadState === 'error' && (
          <ErrorState
            message={t('common.loadFailed', { what: t('common.what.items') })}
            onRetry={capture.retry}
            retryLabel={t('common.retry')}
          />
        )}
        {loadState === 'ready' && !stream && (
          <CafeStreamChoices options={streamOptions} homeStream={homeStream} myStreamKeys={myStreamKeys} onChoose={chooseStream} />
        )}
        {loadState === 'ready' && stream && !canRequest && (
          <Notice tone="info">{t('cafe.request.readOnly')}</Notice>
        )}
        {ready && sent && (
          <section className="cafe-request__result" aria-labelledby="cafe-request-sent-title">
            <h2 id="cafe-request-sent-title" ref={sentHeading} tabIndex={-1}>{t('cafe.request.sent.title')}</h2>
            <p>{t('cafe.request.sent.copy', { stream: streamLabel(t, stream) })}</p>
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
        {ready && !sent && canRequest && (
          <div className="cafe-request__history-top"><CafeRequestHistory requests={recent} failed={recentFailed} onRetry={loadRecent} /></div>
        )}
        {ready && !sent && (
          <>
            {isDesktop && instructions}
            <div className="cafe-request__workspace">
            {items.length === 0 ? (
              <CafeItemsEmptyState stream={stream} requiresStockUnit />
            ) : (
              <>
                <Worksheet label={t('cafe.request.listAria')} className="cafe-request__finder">
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
                  resultCount={{ shown: visibleItems.length, total: items.length }}
                  sortLabel={t('cafe.toolbar.sorted.az')}
                />
                <>
                <CaptureTable
                  rows={visibleItems}
                  caption={t('cafe.request.listAria')}
                  columns={{ item: t('kitchen.log.col.item'), itemSort: 'asc', controls: [{ label: t('cafe.request.quantityLabel') }] }}
                  state={visibleItems.length > 0 ? 'ready' : 'empty'}
                  emptyLabel={<CafeNoMatch bare onClear={() => { setSearch(''); setCategory('All') }} />}
                  renderRow={item => {
                    const invalid = isInvalidCafeItemEntry(entries[item.id])
                    const errorId = `cafe-request-${item.id}-quantity-error`
                    return (
                      <CaptureRow
                        id={item.id}
                        name={item.name}
                        kind={new Set(items.map(entry => entry.kind)).size > 1 ? item.kind : null}
                        category={new Set(items.map(entry => entry.category).filter(Boolean)).size > 1 ? item.category : null}
                        controls={[{ node: (
                          <CaptureQuantityControl
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
                        ) }]}
                        detail={invalid ? <p id={errorId} className="cafe-count__field-error" role="alert">{t('cafe.receive.quantityInvalid')}</p> : null}
                      />
                    )
                  }}
                />
                </>
                </Worksheet>
              </>
            )}
            <aside className="cafe-request__brief-slot">
              <CafeRequestBrief
                requiredBy={requiredBy} min={dateBounds.min} max={dateBounds.max} disabled={busy}
                onValidityChange={setRequiredByInvalid}
                onRequiredByChange={value => { setRequiredBy(value); setError(null) }}
                note={note} onNoteChange={value => setNote(value)}
                lines={lines.map(({ item, quantity, unitName }) => ({ id: item.id, name: cafeItemLabel(item), quantity, unit: unitName }))}
                invalidItems={invalidCount > 0 ? <p className="cafe-request-brief__error">{t(invalidCount === 1 ? 'cafe.receive.fixInvalid.one' : 'cafe.receive.fixInvalid.other', { count: invalidCount })}: {items.filter(item => isInvalidCafeItemEntry(entries[item.id])).map(item => item.name).join(', ')}</p> : null}
                dateProblem={lines.length > 0 ? dateProblem : null}
              />
            </aside>
            </div>
            {!isDesktop && instructions}
          </>
        )}
        {ready && !sent && items.length > 0 && (
          <ActionBar
            className="cafe-capture-footer"
            alert={error && isOnline ? <p className="cafe-count__field-error" role="alert">{t(error)}</p> : undefined}
            summary={<span aria-live="polite">{t(lines.length === 1 ? 'cafe.receive.lines.one' : 'cafe.receive.lines.other', { count: lines.length })}{requiredBy && !dateProblem ? ` · ${t('cafe.request.recent.neededBy', { date: formatWeekdayDayMonth(requiredBy) })}` : ''}</span>}
            reason={!isOnline ? (
              <span className="cafe-count__field-error" role="status">{t('cafe.request.offline')}</span>
            ) : invalidCount > 0 ? (
              <span className="cafe-count__field-error" role="status">
                {t(invalidCount === 1 ? 'cafe.receive.fixInvalid.one' : 'cafe.receive.fixInvalid.other', { count: invalidCount })}
              </span>
            ) : lines.length > 0 && dateProblem ? (
              <span className="cafe-count__field-error" role="status">{t(dateProblem)}</span>
            ) : lines.length === 0 && !busy ? (
              <span className="cafe-count__bar-status" role="status">{t(requiredBy === '' ? 'cafe.request.needsQuantityAndDate' : 'cafe.capture.needsQuantity')}</span>
            ) : undefined}
            primary={<button type="button" className="btn btn-primary cafe-count__submit" disabled={!canSend} onClick={() => void handleSend()}>
              {busy ? t('common.working') : t('cafe.request.send')}
            </button>}
          />
        )}
        <RouteLeaveGuard when={ready && !sent && hasInput} message={t('cafe.request.leaveWarning')} />
      </div>
    </CafePageFrame>
  )
}
