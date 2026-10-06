import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { CafeStreamBar, CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import {
  listCafeCountableItems,
  listCafeCountFloorLines,
  newCafeCountClientKey,
  normalizeCafeCountQuantity,
  recordCafeCountReason,
  recordCafeCountRecount,
  submitCafeCounts,
  type CafeCountFloorLine,
  type CafeCountableItem,
} from '@/lib/db/cafe-count'
import { wibToday } from '@/lib/db/cafe-opening'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsOffline } from '@/shell/use-is-offline'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import './cafe-count-page.css'

type CountEntry = {
  quantity: string
  clientKey: string
  outcome?: 'submitted' | 'existing'
  refusal?: string
}
type LoadState = 'loading' | 'ready' | 'error'

function makeEntries(items: readonly CafeCountableItem[]): Record<string, CountEntry> {
  return Object.fromEntries(items.map(item => [item.id, {
    quantity: '',
    clientKey: newCafeCountClientKey(),
  }]))
}

function refusalText(reason: string | undefined, t: ReturnType<typeof useT>): string {
  switch (reason) {
    case 'already_counted': return t('cafe.count.refused.alreadyCounted')
    case 'item_not_countable': return t('cafe.count.refused.itemUnavailable')
    case 'client_key_conflict': return t('cafe.count.refused.retryConflict')
    case 'invalid_quantity':
    case 'invalid_quantity_or_item': return t('cafe.count.quantityInvalid')
    default: return t('cafe.count.refused.generic')
  }
}

export function CafeCountPage() {
  const t = useT()
  const auth = useAuth()
  const cafeStream = useCafeStream()
  const { options: streamOptions, stream, homeStream, myStreamKeys, resolve, adopt, setStream, branchId } = cafeStream
  const canCapture = auth.status === 'authenticated' && canCaptureCafe({
    affiliated: auth.viewer.affiliated,
    accessRoles: auth.viewer.accessRoles,
  })
  const logDate = useMemo(() => wibToday(), [])
  const pageLabel = t('nav.cafe.count')
  useDocumentTitle(t('common.docTitle', { page: `${pageLabel} · ${t('nav.cafe')}` }))

  const [catalogReady, setCatalogReady] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [retryKey, setRetryKey] = useState(0)
  const [items, setItems] = useState<CafeCountableItem[]>([])
  const [entries, setEntries] = useState<Record<string, CountEntry>>({})
  const [countLines, setCountLines] = useState<CafeCountFloorLine[]>([])
  const [recountDrafts, setRecountDrafts] = useState<Record<string, string>>({})
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({})
  const [lineBusyId, setLineBusyId] = useState<string | null>(null)
  const [lineErrors, setLineErrors] = useState<Record<string, 'recount' | 'reason'>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const isOnline = !useIsOffline()
  const requestGeneration = useRef(0)

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
    setCountLines([])
    setRecountDrafts({})
    setReasonDrafts({})
    setLineErrors({})
    setSubmitError(false)
    setLoadState('loading')
    if (!stream || !canCapture) {
      setLoadState('ready')
      return () => { active = false }
    }
    void Promise.all([listCafeCountableItems(stream), listCafeCountFloorLines(logDate)]).then(([nextItems, nextLines]) => {
      if (!active || generation !== requestGeneration.current) return
      setItems(nextItems)
      setEntries(makeEntries(nextItems))
      setCountLines(nextLines.filter(line => line.branch_id === stream.branch.id && line.activity === stream.activity))
      setLoadState('ready')
    }).catch(() => {
      if (!active || generation !== requestGeneration.current) return
      setLoadState('error')
    })
    return () => { active = false }
  }, [canCapture, catalogReady, logDate, retryKey, stream, stream?.activity, stream?.branch.id])

  const entered = items.flatMap(item => {
    const entry = entries[item.id]
    if (!entry || !entry.quantity.trim() || entry.outcome) return []
    const quantity = normalizeCafeCountQuantity(entry.quantity)
    return quantity === null ? [] : [{ item, entry, quantity }]
  })
  const enteredCount = entered.length
  const hasSubmitted = items.some(item => Boolean(entries[item.id]?.outcome))
  const hasUnsubmittedInput = items.some(item => Boolean(entries[item.id]?.quantity.trim() && !entries[item.id]?.outcome))
  const hasUnsubmittedFollowUp = countLines.some(line =>
    Boolean(recountDrafts[line.id]?.trim() && line.recounted_quantity === null)
      || Boolean(reasonDrafts[line.id]?.trim() && !line.reason),
  )
  const canSwitch = !submitting && lineBusyId === null && !hasUnsubmittedInput && !hasUnsubmittedFollowUp

  const patchQuantity = useCallback((itemId: string, quantity: string) => {
    setEntries(current => {
      const entry = current[itemId]
      return entry ? { ...current, [itemId]: { ...entry, quantity, refusal: undefined } } : current
    })
  }, [])

  const chooseStream = useCallback((next: ProductionStream) => {
    if (!canSwitch) return
    setStream(next)
  }, [canSwitch, setStream])

  async function handleRecount(line: CafeCountFloorLine) {
    const quantity = normalizeCafeCountQuantity(recountDrafts[line.id] ?? '')
    if (quantity === null) {
      setLineErrors(current => ({ ...current, [line.id]: 'recount' }))
      return
    }
    setLineBusyId(line.id)
    setLineErrors(current => { const next = { ...current }; delete next[line.id]; return next })
    try {
      const result = await recordCafeCountRecount(line.id, quantity)
      setCountLines(current => current.map(row => row.id === line.id ? {
        ...row,
        recounted_quantity: quantity,
        reason: null,
        recount_required: false,
        reason_required: result.reason_required,
        row_version: result.row_version,
      } : row))
      setRecountDrafts(current => { const next = { ...current }; delete next[line.id]; return next })
      if (result.reason_required) setReasonDrafts(current => ({ ...current, [line.id]: '' }))
    } catch {
      setLineErrors(current => ({ ...current, [line.id]: 'recount' }))
    } finally {
      setLineBusyId(null)
    }
  }

  async function handleReason(line: CafeCountFloorLine) {
    const reason = (reasonDrafts[line.id] ?? '').trim()
    if (!reason || reason.length > 500) {
      setLineErrors(current => ({ ...current, [line.id]: 'reason' }))
      return
    }
    setLineBusyId(line.id)
    setLineErrors(current => { const next = { ...current }; delete next[line.id]; return next })
    try {
      const result = await recordCafeCountReason(line.id, reason)
      setCountLines(current => current.map(row => row.id === line.id ? {
        ...row,
        reason,
        reason_required: false,
        row_version: result.row_version,
      } : row))
      setReasonDrafts(current => { const next = { ...current }; delete next[line.id]; return next })
    } catch {
      setLineErrors(current => ({ ...current, [line.id]: 'reason' }))
    } finally {
      setLineBusyId(null)
    }
  }

  async function handleSubmit() {
    if (!stream || !canCapture || !isOnline || submitting || entered.length === 0) return
    setSubmitting(true)
    setSubmitError(false)
    try {
      const outcomes = await submitCafeCounts(stream, entered.map(({ item, entry, quantity }) => ({
        client_key: entry.clientKey,
        item_id: item.id,
        quantity,
      })))
      const outcomeByKey = new Map(outcomes.map(outcome => [outcome.client_key, outcome]))
      setEntries(current => {
        const next = { ...current }
        for (const line of entered) {
          const outcome = outcomeByKey.get(line.entry.clientKey)
          if (!outcome) {
            next[line.item.id] = { ...line.entry, refusal: 'unknown' }
          } else if (outcome.outcome === 'refused') {
            next[line.item.id] = { ...line.entry, refusal: outcome.reason ?? 'unknown' }
          } else {
            next[line.item.id] = { ...line.entry, outcome: outcome.outcome, refusal: undefined }
          }
        }
        return next
      })
      void listCafeCountFloorLines(logDate).then(nextLines => {
        setCountLines(nextLines.filter(line => line.branch_id === stream.branch.id && line.activity === stream.activity))
      }).catch(() => undefined)
    } catch {
      setSubmitError(true)
    } finally {
      setSubmitting(false)
    }
  }

  function retryLoad() {
    setCatalogReady(false)
    setRetryKey(value => value + 1)
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
      context={<>
        <span aria-hidden="true">·</span>
        <span className="cafe-count__date tabular">{formatWeekdayDayMonth(logDate)}</span>
      </>}
    />
  )
  const countLineByItem = new Map(countLines.map(line => [line.wip_item_id, line]))
  const pageState = loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error'
    : submitting || lineBusyId ? 'saving'
      : hasSubmitted && entered.length === 0 && !hasUnsubmittedInput && !hasUnsubmittedFollowUp ? 'saved' : 'default'

  return (
    <PageFamilyFrame family="workspace" title={pageLabel} headClassName="cafe-count__head" statusRow={picker} state={pageState}>
      <div className="cafe-count">
        {loadState === 'loading' && <LoadingShell count={3} />}
        {loadState === 'error' && (
          <ErrorState
            message={t('common.loadFailed', { what: t('common.what.items') })}
            onRetry={retryLoad}
            retryLabel={t('common.retry')}
          />
        )}
        {loadState === 'ready' && !stream && (
          <EmptyState variant="next-step" title={t('cafe.count.noStream.title')} copy={t('cafe.count.noStream.copy')}>
            <CafeStreamChoices
              options={streamOptions}
              homeStream={homeStream}
              myStreamKeys={myStreamKeys}
              onChoose={chooseStream}
              disabled={submitting}
            />
          </EmptyState>
        )}
        {loadState === 'ready' && stream && !canCapture && (
          <p className="cafe-count__notice" role="status">{t('cafe.count.readOnly')}</p>
        )}
        {loadState === 'ready' && stream && canCapture && (
          <>
            <div className="cafe-count__intro">
              <p>{t('cafe.count.blindHelp')}</p>
              {(hasUnsubmittedInput || hasUnsubmittedFollowUp) && <p className="cafe-count__switch-note" role="status">{t('cafe.count.streamLocked')}</p>}
              {!isOnline && <p className="cafe-count__notice" role="alert">{t('cafe.count.offline')}</p>}
              {submitError && <p className="cafe-count__notice" role="alert">{t('cafe.count.submitFailed')}</p>}
            </div>
            {items.length === 0 ? (
              <EmptyState variant="blank" title={t('cafe.count.empty.title')} copy={t('cafe.count.empty.copy')}>
                <Link to="/cafe/items" className="btn btn-outline btn-touch">{t('cafe.count.empty.action')}</Link>
              </EmptyState>
            ) : (
              <>
                <ul className="cafe-count__list" aria-label={t('cafe.count.listAria')}>
                  {items.map(item => {
                    const entry = entries[item.id]
                    const line = countLineByItem.get(item.id)
                    const normalized = entry ? normalizeCafeCountQuantity(entry.quantity) : null
                    const invalid = Boolean(entry?.quantity.trim()) && normalized === null
                    const needsRecount = Boolean(line?.recount_required)
                    const needsReason = Boolean(line?.reason_required)
                    const recountDraft = recountDrafts[line?.id ?? ''] ?? ''
                    const recountInvalid = Boolean(recountDraft.trim()) && normalizeCafeCountQuantity(recountDraft) === null
                    const reasonDraft = reasonDrafts[line?.id ?? ''] ?? ''
                    return (
                      <li className="cafe-count__row" key={item.id}>
                        <div className="cafe-count__item">
                          <div className="cafe-count__item-name">{item.name}</div>
                          {item.category && <div className="cafe-count__category">{item.category}</div>}
                          <span className="cafe-count__kind">{item.kind}</span>
                        </div>
                        <div className="cafe-count__input-group">
                          {line ? (
                            <>
                              {line.status === 'Confirmed' ? (
                                <p className="cafe-count__line-success" role="status">
                                  {line.posting_status === 'held'
                                    ? t('cafe.count.review.confirmedHeld')
                                    : t('cafe.count.review.confirmedNotNeeded')}
                                </p>
                              ) : needsRecount && line.recounted_quantity === null ? (
                                <>
                                  <p className="cafe-count__recount-prompt" role="status">{t('cafe.count.recount.prompt')}</p>
                                  <label htmlFor={`cafe-recount-${line.id}`}>{t('cafe.count.recount.quantityFor', { item: item.name })}</label>
                                  <div className="cafe-count__quantity-control">
                                    <input
                                      id={`cafe-recount-${line.id}`}
                                      type="text"
                                      inputMode="decimal"
                                      autoComplete="off"
                                      value={recountDraft}
                                      aria-invalid={recountInvalid || lineErrors[line.id] === 'recount' || undefined}
                                      disabled={!isOnline || lineBusyId === line.id}
                                      onChange={event => {
                                        setRecountDrafts(current => ({ ...current, [line.id]: event.target.value }))
                                        setLineErrors(current => { const next = { ...current }; delete next[line.id]; return next })
                                      }}
                                    />
                                    <span className="cafe-count__unit">{item.unitName}</span>
                                  </div>
                                  {recountInvalid && <p className="cafe-count__field-error" role="alert">{t('cafe.count.quantityInvalid')}</p>}
                                  {lineErrors[line.id] === 'recount' && <p className="cafe-count__field-error" role="alert">{t('cafe.count.followupFailed')}</p>}
                                  <button type="button" className="btn btn-outline cafe-count__followup-submit"
                                    disabled={!isOnline || lineBusyId === line.id} onClick={() => void handleRecount(line)}>
                                    {lineBusyId === line.id ? t('common.working') : t('cafe.count.recount.submit')}
                                  </button>
                                </>
                              ) : needsReason ? (
                                <>
                                  <p className="cafe-count__recount-prompt" role="status">{t('cafe.count.recount.reasonPrompt')}</p>
                                  <label htmlFor={`cafe-reason-${line.id}`}>{t('cafe.count.recount.reasonFor', { item: item.name })}</label>
                                  <textarea
                                    id={`cafe-reason-${line.id}`}
                                    rows={3}
                                    maxLength={500}
                                    value={reasonDraft}
                                    aria-invalid={lineErrors[line.id] === 'reason' || undefined}
                                    disabled={!isOnline || lineBusyId === line.id}
                                    onChange={event => {
                                      setReasonDrafts(current => ({ ...current, [line.id]: event.target.value }))
                                      setLineErrors(current => { const next = { ...current }; delete next[line.id]; return next })
                                    }}
                                  />
                                  {lineErrors[line.id] === 'reason' && <p className="cafe-count__field-error" role="alert">{t('cafe.count.recount.reasonInvalid')}</p>}
                                  <button type="button" className="btn btn-outline cafe-count__followup-submit"
                                    disabled={!isOnline || lineBusyId === line.id} onClick={() => void handleReason(line)}>
                                    {lineBusyId === line.id ? t('common.working') : t('cafe.count.recount.saveReason')}
                                  </button>
                                </>
                              ) : line.recounted_quantity !== null ? (
                                <p className="cafe-count__line-success" role="status">
                                  {line.reason ? t('cafe.count.recount.reasonRecorded') : t('cafe.count.recount.complete')}
                                </p>
                              ) : (
                                <p className="cafe-count__line-success" role="status">
                                  {line.expected_ready ? t('cafe.count.lineSubmitted') : t('cafe.count.recount.waiting')}
                                </p>
                              )}
                            </>
                          ) : (
                            <>
                              <label htmlFor={`cafe-count-${item.id}`}>{t('cafe.count.quantityFor', { item: item.name })}</label>
                              <div className="cafe-count__quantity-control">
                                <input
                                  id={`cafe-count-${item.id}`}
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  value={entry?.quantity ?? ''}
                                  aria-invalid={invalid || undefined}
                                  disabled={submitting || Boolean(entry?.outcome)}
                                  onChange={event => patchQuantity(item.id, event.target.value)}
                                />
                                <span className="cafe-count__unit">{item.unitName}</span>
                              </div>
                              {invalid && <p className="cafe-count__field-error" role="alert">{t('cafe.count.quantityInvalid')}</p>}
                              {entry?.outcome && <p className="cafe-count__line-success" role="status">{t('cafe.count.lineSubmitted')}</p>}
                              {entry?.refusal && <p className="cafe-count__field-error" role="alert">{refusalText(entry.refusal, t)}</p>}
                            </>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
                {items.some(item => !countLineByItem.has(item.id)) && (
                  <div className="cafe-count__footer">
                    <p className="cafe-count__tally" aria-live="polite">
                      {t(enteredCount === 1 ? 'cafe.count.entered.one' : 'cafe.count.entered.other', { count: enteredCount })}
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary cafe-count__submit"
                      disabled={!canCapture || !isOnline || submitting || entered.length === 0}
                      onClick={() => void handleSubmit()}
                    >
                      {submitting ? t('common.working') : t('cafe.count.submit')}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </PageFamilyFrame>
  )
}
