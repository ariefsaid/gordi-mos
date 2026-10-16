import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { ActionBar } from '@/components/ui/action-bar'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { Notice } from '@/components/ui/notice'
import { Select } from '@/components/ui/select'
import { TextInput } from '@/components/ui/text-input'
import { useT } from '@/i18n/use-t'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import { compareDec, formatDec, parseDecimal } from '@/lib/cafe-records/decimal'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { listCafeCountableItems, type CafeCountableItem } from '@/lib/db/cafe-count'
import { fetchCafeLocationBalances, listCafeLocations, moveCafeStock, type CafeLocation, type LocationBalances } from '@/lib/db/cafe-locations'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { parseQuantityInput } from '@/lib/quantity-parser'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { useIsOffline } from '@/shell/use-is-offline'
import { wibToday } from '@/lib/format/date'
import './cafe-move-stock-page.css'

type LoadState = 'loading' | 'ready' | 'error'
type MoveData = { items: CafeCountableItem[]; locations: CafeLocation[]; balances: LocationBalances }

export function CafeMoveStockPage() {
  const t = useT()
  const auth = useAuth()
  const offline = useIsOffline()
  const cafe = useCafeStream()
  const { options, stream, homeStream, myStreamKeys, resolve, adopt, setStream } = cafe
  const canMove = auth.status === 'authenticated' && canCaptureCafe({ affiliated: auth.viewer.affiliated, accessRoles: auth.viewer.accessRoles })
  const [catalogReady, setCatalogReady] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [retry, setRetry] = useState(0)
  const [data, setData] = useState<MoveData | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [date, setDate] = useState(wibToday())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ key: 'saved' | 'error'; role: 'status' | 'alert' } | null>(null)
  const requestRef = useRef<{ signature: string; id: string } | null>(null)
  const generation = useRef(0)

  useEffect(() => {
    let active = true
    setCatalogReady(false)
    void resolve().then((catalog) => {
      if (!active) return
      adopt(catalog)
      setCatalogReady(true)
    }).catch(() => { if (active) setLoadState('error') })
    return () => { active = false }
  }, [adopt, resolve, retry])

  useEffect(() => {
    if (!catalogReady) return
    const current = ++generation.current
    let active = true
    setData(null)
    if (!stream || !canMove) { setLoadState('ready'); return () => { active = false } }
    setLoadState('loading')
    void Promise.all([
      listCafeCountableItems(stream),
      listCafeLocations({ branch_id: stream.branch.id, archived: false }),
      fetchCafeLocationBalances(date, { branch_id: stream.branch.id, activity: stream.activity }),
    ]).then(([items, locations, balances]) => {
      if (!active || generation.current !== current) return
      setData({ items, locations, balances })
      setLoadState('ready')
    }).catch(() => {
      if (!active || generation.current !== current) return
      setLoadState('error')
    })
    return () => { active = false }
  }, [canMove, catalogReady, date, retry, stream])

  const storageLocations = useMemo(() => (data?.locations ?? []).filter((location) => location.use === 'storage' || location.use === 'both'), [data])
  const selectedItem = data?.items.find((item) => item.unitId === itemId)
  const selectedFrom = storageLocations.find((location) => location.id === from)
  const availableRaw = selectedItem && selectedFrom && data?.balances.coverage === 'complete'
    ? data.balances.rows.find((row) => row.location_id === selectedFrom.id && row.item_unit_id === selectedItem.unitId)?.available_qty ?? '0'
    : null
  const parsed = parseQuantityInput(quantity, { min: 0, maxIntegerDigits: 10, maxFractionDigits: 4 })
  const normalizedQuantity = parsed.kind === 'valid' ? parsed.normalized : null
  const quantityDecimal = normalizedQuantity === null ? null : parseDecimal(normalizedQuantity)
  const availableDecimal = availableRaw === null ? null : parseDecimal(availableRaw)
  const exceedsAvailable = quantityDecimal !== null && availableDecimal !== null && compareDec(quantityDecimal, availableDecimal) > 0
  const same = Boolean(from) && from === to
  const dirty = Boolean(from || to || itemId || quantity || note) || date !== wibToday()
  const coverageComplete = data?.balances.coverage === 'complete'
  const canSubmit = Boolean(stream && data && canMove && !offline && !busy && coverageComplete && !same && from && to && selectedItem
    && quantityDecimal !== null && quantityDecimal > 0n && !exceedsAvailable)

  const chooseStream = (next: ProductionStream) => {
    if (!busy) {
      setStream(next); setData(null); setFrom(''); setTo(''); setItemId(''); setQuantity(''); setNote(''); setMessage(null)
    }
  }

  async function submitMove() {
    if (!canSubmit || !stream || !selectedItem || normalizedQuantity === null) return
    setBusy(true); setMessage(null)
    const input = {
      stream: { branch_id: stream.branch.id, activity: stream.activity },
      item_unit_id: selectedItem.unitId, quantity: normalizedQuantity,
      from_location_id: from, to_location_id: to, movement_date: date, note: note.trim() || null,
    }
    const signature = JSON.stringify(input)
    const request = requestRef.current?.signature === signature
      ? requestRef.current
      : { signature, id: crypto.randomUUID() }
    requestRef.current = request
    try {
      await moveCafeStock(input, { client_request_id: request.id })
      requestRef.current = null
      setMessage({ key: 'saved', role: 'status' })
      setQuantity('')
      setRetry((count) => count + 1)
    } catch {
      setMessage({ key: 'error', role: 'alert' })
    } finally { setBusy(false) }
  }

  return <CafePageFrame page="moveStock" date={date}>
    <RouteLeaveGuard when={dirty} message={t('cafe.moveStock.leaveMessage')} />
    <section className="move-stock" aria-label={t('cafe.pageTitle.moveStock')}>
      <p className="move-stock__job">{t('cafe.moveStock.job')}</p>
      {!catalogReady || loadState === 'loading' ? <LoadingShell count={3} label={t('cafe.locations.loading')} /> : loadState === 'error' ? <ErrorState message={t('cafe.moveStock.loadError')} onRetry={() => setRetry((count) => count + 1)} /> : <>
        {!stream && <>
          <p className="move-stock__note">{t('cafe.moveStock.noStream')}</p>
          <CafeStreamChoices options={options} homeStream={homeStream} myStreamKeys={myStreamKeys} onChoose={chooseStream} />
        </>}
        {stream && !canMove && <Notice tone="attention">{t('cafe.moveStock.permission')}</Notice>}
        {stream && canMove && data && <>
          <div className="move-stock__form" role="group" aria-label={t('cafe.pageTitle.moveStock')}>
            <p className="move-stock__note">{stream.branch.name} · {stream.activity}</p>
            <Select label={t('cafe.locations.field.from')} value={from} fullWidth disabled={busy} onChange={(event) => setFrom(event.target.value)}>
              <option value="">{t('cafe.moveStock.choose')}</option>
              {storageLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </Select>
            <Select label={t('cafe.locations.field.to')} value={to} fullWidth disabled={busy} onChange={(event) => setTo(event.target.value)}>
              <option value="">{t('cafe.moveStock.choose')}</option>
              {storageLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </Select>
            {same && <p className="move-stock__error" role="alert">{t('cafe.moveStock.samePlace')}</p>}
            <Select label={t('cafe.moveStock.item')} value={itemId} disabled={busy || !coverageComplete} fullWidth onChange={(event) => setItemId(event.target.value)}>
              <option value="">{t('cafe.moveStock.itemChoose')}</option>
              {data.items.map((item) => <option key={item.unitId} value={item.unitId}>{item.name}</option>)}
            </Select>
            <div className="move-stock__qty">
              <TextInput label={t('cafe.moveStock.quantity')} inputMode="decimal" value={quantity} fullWidth autoComplete="off" disabled={busy || !coverageComplete}
                onChange={(event) => setQuantity(event.target.value)} />
              <div className="move-stock__unit"><span className="move-stock__label">{t('cafe.moveStock.unit')}</span><span className="move-stock__muted">{selectedItem?.unitName ?? t('cafe.moveStock.unitNone')}</span></div>
            </div>
            {exceedsAvailable && <p className="move-stock__error" role="alert">{t('cafe.moveStock.quantityTooHigh')}</p>}
            <TextInput label={t('cafe.moveStock.date')} type="date" value={date} fullWidth disabled={busy} onChange={(event) => setDate(event.target.value)} />
            <TextInput label={t('cafe.moveStock.note')} value={note} fullWidth autoComplete="off" disabled={busy} onChange={(event) => setNote(event.target.value)} />
            <p className="move-stock__note">{t('cafe.moveStock.sameBooks')}</p>
            {storageLocations.length === 0 && <Notice tone="attention">{t('cafe.moveStock.noLocations')}</Notice>}
            {data.items.length === 0 && <Notice tone="attention">{t('cafe.moveStock.noItems')}</Notice>}
            {data.balances.coverage === 'unallocated'
              ? <Notice tone="attention">{t('cafe.moveStock.unallocated')}</Notice>
              : data.balances.coverage === 'unavailable'
                ? <Notice tone="attention">{t('cafe.moveStock.coverageUnavailable')}</Notice>
                : selectedItem && selectedFrom && <p className="move-stock__note">{t('cafe.moveStock.available', { quantity: formatDec(availableDecimal ?? 0n), unit: selectedItem.unitName })}</p>}
            {message && <p role={message.role} className={message.role === 'alert' ? 'move-stock__error' : 'move-stock__note'}>{t(message.key === 'saved' ? 'cafe.moveStock.saved' : 'cafe.moveStock.saveError')}</p>}
          </div>
          <ActionBar className="move-stock__actions" reason={offline ? t('cafe.moveStock.offline') : !coverageComplete ? t(data.balances.coverage === 'unallocated' ? 'cafe.moveStock.unallocated' : 'cafe.moveStock.coverageUnavailable') : undefined}
            primary={<Button variant="primary" disabled={!canSubmit} onClick={() => void submitMove()}>{t('cafe.moveStock.submit')}</Button>}
            aria-label={t('cafe.moveStock.submit')} />
        </>}
      </>}
    </section>
  </CafePageFrame>
}
