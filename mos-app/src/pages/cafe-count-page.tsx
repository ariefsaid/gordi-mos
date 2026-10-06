import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { CafeStreamBar, CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { CafeItemsEmptyState } from '@/components/kitchen/cafe-items-empty-state'
import { useT } from '@/i18n/use-t'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import {
  listCafeCountableItems,
  newCafeCountClientKey,
  normalizeCafeCountQuantity,
  submitCafeCounts,
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
    setSubmitError(false)
    setLoadState('loading')
    if (!stream || !canCapture) {
      setLoadState('ready')
      return () => { active = false }
    }
    void listCafeCountableItems(stream).then(nextItems => {
      if (!active || generation !== requestGeneration.current) return
      setItems(nextItems)
      setEntries(makeEntries(nextItems))
      setLoadState('ready')
    }).catch(() => {
      if (!active || generation !== requestGeneration.current) return
      setLoadState('error')
    })
    return () => { active = false }
  }, [canCapture, catalogReady, retryKey, stream, stream?.activity, stream?.branch.id])

  const entered = items.flatMap(item => {
    const entry = entries[item.id]
    if (!entry || !entry.quantity.trim() || entry.outcome) return []
    const quantity = normalizeCafeCountQuantity(entry.quantity)
    return quantity === null ? [] : [{ item, entry, quantity }]
  })
  const enteredCount = entered.length
  const hasSubmitted = items.some(item => Boolean(entries[item.id]?.outcome))
  const hasUnsubmittedInput = items.some(item => Boolean(entries[item.id]?.quantity.trim() && !entries[item.id]?.outcome))
  const canSwitch = !submitting && !hasUnsubmittedInput

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
  const pageState = loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error'
    : submitting ? 'saving' : hasSubmitted && entered.length === 0 && !hasUnsubmittedInput ? 'saved' : 'default'

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
              {hasUnsubmittedInput && <p className="cafe-count__switch-note" role="status">{t('cafe.count.streamLocked')}</p>}
              {!isOnline && <p className="cafe-count__notice" role="alert">{t('cafe.count.offline')}</p>}
              {submitError && <p className="cafe-count__notice" role="alert">{t('cafe.count.submitFailed')}</p>}
            </div>
            {items.length === 0 ? (
              <CafeItemsEmptyState stream={stream} />
            ) : (
              <>
                <ul className="cafe-count__list" aria-label={t('cafe.count.listAria')}>
                  {items.map(item => {
                    const entry = entries[item.id]
                    const normalized = entry ? normalizeCafeCountQuantity(entry.quantity) : null
                    const invalid = Boolean(entry?.quantity.trim()) && normalized === null
                    return (
                      <li className="cafe-count__row" key={item.id}>
                        <div className="cafe-count__item">
                          <div className="cafe-count__item-name">{item.name}</div>
                          {item.category && <div className="cafe-count__category">{item.category}</div>}
                          <span className="cafe-count__kind">{item.kind}</span>
                        </div>
                        <div className="cafe-count__input-group">
                          {/* The item name sits beside the field; the label carries it for assistive tech only. */}
                          <label htmlFor={`cafe-count-${item.id}`} className="sr-only">{t('cafe.count.quantityFor', { item: item.name })}</label>
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
                        </div>
                      </li>
                    )
                  })}
                </ul>
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
              </>
            )}
          </>
        )}
      </div>
    </PageFamilyFrame>
  )
}
