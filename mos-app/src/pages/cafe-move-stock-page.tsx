import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { ActionBar } from '@/components/ui/action-bar'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { Notice } from '@/components/ui/notice'
import { Select } from '@/components/ui/select'
import { TextInput } from '@/components/ui/text-input'
import { useT } from '@/i18n/use-t'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import { compareDec, formatDec, parseDecimal } from '@/lib/cafe-records/decimal'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { useCafeStreamBootstrap } from '@/lib/use-cafe-stream-bootstrap'
import { listCafeCountableItems, type CafeCountableItem } from '@/lib/db/cafe-count'
import { fetchCafeLocationBalances, getCafeStreamLocationDefaults, listCafeLocations, moveCafeStock, placeCafeUnassignedStock, type CafeLocation, type LocationBalances } from '@/lib/db/cafe-locations'
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
  const { options, stream, homeStream, myStreamKeys, setStream } = cafe
  const canMove = auth.status === 'authenticated' && canCaptureCafe({ affiliated: auth.viewer.affiliated, accessRoles: auth.viewer.accessRoles })
  const canPlace = auth.status === 'authenticated' && auth.viewer.accessRoles.some(role => role === 'ops_lead' || role === 'admin')
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [retry, setRetry] = useState(0)
  const { catalogReady } = useCafeStreamBootstrap(cafe, retry, setLoadState)
  const [data, setData] = useState<MoveData | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [date, setDate] = useState(wibToday())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ key: 'saved' | 'placed' | 'error' | 'openingRequired' | 'insufficientStock'; role: 'status' | 'alert' } | null>(null)
  const [confirmPlace, setConfirmPlace] = useState(false)
  const selectionRef = useRef({ stream: '', from: '', to: '', date, note: '' })
  const requestRef = useRef<{ signature: string; id: string } | null>(null)
  const generation = useRef(0)

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
      getCafeStreamLocationDefaults({ branch_id: stream.branch.id, activity: stream.activity }),
    ]).then(([items, locations, balances, defaults]) => {
      if (!active || generation.current !== current) return
      const streamKey = `${stream.branch.id}:${stream.activity}`
      if (selectionRef.current.stream !== streamKey) {
        const storage = locations.filter(location => location.use === 'storage' || location.use === 'both')
        const source = storage.find(location => location.id === defaults?.storage_location_id)?.id ?? ''
        const destination = source && storage.length === 2 ? storage.find(location => location.id !== source)?.id ?? '' : ''
        selectionRef.current = { stream: streamKey, from: source, to: destination, date, note: '' }
        setFrom(source); setTo(destination)
      }
      setData({ items, locations, balances })
      setLoadState('ready')
    }).catch(() => {
      if (!active || generation.current !== current) return
      setLoadState('error')
    })
    return () => { active = false }
  }, [canMove, catalogReady, date, retry, stream])

  const storageLocations = (data?.locations ?? []).filter(location => location.use === 'storage' || location.use === 'both')
  const selectedItem = data?.items.find((item) => item.unitId === itemId)
  const selectedFrom = storageLocations.find((location) => location.id === from)
  const unassigned = from === 'unassigned' && canPlace
  const sourceBalance = data?.balances.rows.find(row => row.location_id === (unassigned ? null : from) && row.item_unit_id === selectedItem?.unitId)
  const availableRaw = selectedItem && (selectedFrom || unassigned) && data && data.balances.coverage !== 'unavailable'
    ? sourceBalance ? sourceBalance.usable_qty : '0'
    : null
  const parsed = parseQuantityInput(quantity, { min: 0, maxIntegerDigits: 10, maxFractionDigits: 4 })
  const normalizedQuantity = parsed.kind === 'valid' ? parsed.normalized : null
  const quantityDecimal = normalizedQuantity === null ? null : parseDecimal(normalizedQuantity)
  const availableDecimal = availableRaw === null ? null : parseDecimal(availableRaw)
  const exceedsAvailable = quantityDecimal !== null && availableDecimal !== null && compareDec(quantityDecimal, availableDecimal) > 0
  const same = Boolean(from) && from === to
  const dirty = Boolean(itemId || quantity) || note !== selectionRef.current.note || from !== selectionRef.current.from || to !== selectionRef.current.to || date !== selectionRef.current.date
  const canPlaceAll = Boolean(stream && canPlace && !offline && !busy && storageLocations.some(location => location.id === to) && data && data.balances.coverage !== 'unavailable'
    && data.balances.rows.some(row => row.location_id === null && row.usable_qty !== null && parseDecimal(row.usable_qty) !== 0n))
  const canSubmit = Boolean(stream && data && canMove && !offline && !busy && !same && (selectedFrom || unassigned) && storageLocations.some(location => location.id === to) && selectedItem
    && quantityDecimal !== null && quantityDecimal > 0n && !exceedsAvailable)

  const chooseStream = (next: ProductionStream) => {
    if (!busy) {
      setStream(next); setData(null); setFrom(''); setTo(''); setItemId(''); setQuantity(''); setNote(''); setMessage(null)
    }
  }

  async function submitMove(all = false) {
    if (busy || !stream || (all ? !canPlaceAll : !canSubmit) || (!all && (!selectedItem || normalizedQuantity === null))) return
    setBusy(true); setMessage(null)
    const streamRef = { branch_id: stream.branch.id, activity: stream.activity }
    const placement = all || unassigned
    const input = placement
      ? { stream: streamRef, to_location_id: to, as_of: date, ...(!all && selectedItem && normalizedQuantity ? { item_unit_id: selectedItem.unitId, quantity: normalizedQuantity } : {}) }
      : { stream: streamRef, item_unit_id: selectedItem!.unitId, quantity: normalizedQuantity!, from_location_id: from, to_location_id: to, movement_date: date, note: note.trim() || null }
    const signature = JSON.stringify(input)
    const request = requestRef.current?.signature === signature
      ? requestRef.current
      : { signature, id: crypto.randomUUID() }
    requestRef.current = request
    try {
      if ('as_of' in input) await placeCafeUnassignedStock(input, { client_request_id: request.id })
      else await moveCafeStock(input, { client_request_id: request.id })
      requestRef.current = null
      setMessage({ key: placement ? 'placed' : 'saved', role: 'status' })
      setItemId(''); setQuantity(''); setConfirmPlace(false)
      selectionRef.current = { ...selectionRef.current, from, to, date, note }
      setRetry((count) => count + 1)
    } catch (error) {
      const token = error instanceof Error ? error.message : ''
      setConfirmPlace(false)
      setMessage({ key: token.includes('CAFE_LOCATION_MOVE_BALANCE_UNALLOCATED') ? 'openingRequired'
        : token.includes('CAFE_LOCATION_MOVE_INSUFFICIENT_STOCK') ? 'insufficientStock' : 'error', role: 'alert' })
    } finally { setBusy(false) }
  }

  const messageKeys = {
    saved: 'cafe.moveStock.saved', placed: 'cafe.moveStock.placed', error: 'cafe.moveStock.saveError',
    openingRequired: 'cafe.moveStock.openingRequired', insufficientStock: 'cafe.moveStock.insufficientStock',
  } as const

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
              {canPlace && <option value="unassigned">{t('cafe.moveStock.unassignedOption')}</option>}
              {storageLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </Select>
            <Select label={t('cafe.locations.field.to')} value={to} fullWidth disabled={busy} onChange={(event) => setTo(event.target.value)}>
              <option value="">{t('cafe.moveStock.choose')}</option>
              {storageLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </Select>
            {same && <p className="move-stock__error" role="alert">{t('cafe.moveStock.samePlace')}</p>}
            <Select label={t('cafe.moveStock.item')} value={itemId} disabled={busy} fullWidth onChange={(event) => setItemId(event.target.value)}>
              <option value="">{t('cafe.moveStock.itemChoose')}</option>
              {data.items.map((item) => <option key={item.unitId} value={item.unitId}>{item.name}</option>)}
            </Select>
            <div className="move-stock__qty">
              <TextInput label={t('cafe.moveStock.quantity')} inputMode="decimal" value={quantity} fullWidth autoComplete="off" disabled={busy}
                onChange={(event) => setQuantity(event.target.value)} />
              <div className="move-stock__unit"><span className="move-stock__label">{t('cafe.moveStock.unit')}</span><span className="move-stock__muted">{selectedItem?.unitName ?? t('cafe.moveStock.unitNone')}</span></div>
            </div>
            {exceedsAvailable && <p className="move-stock__error" role="alert">{t('cafe.moveStock.quantityTooHigh')}</p>}
            <TextInput label={t('cafe.moveStock.date')} type="date" value={date} fullWidth disabled={busy} onChange={(event) => setDate(event.target.value)} />
            <TextInput label={t('cafe.moveStock.note')} value={note} fullWidth autoComplete="off" disabled={busy} onChange={(event) => setNote(event.target.value)} />
            <p className="move-stock__note">{t('cafe.moveStock.sameBooks')}</p>
            {storageLocations.length === 0 && <Notice tone="attention">{t('cafe.moveStock.noLocations')}</Notice>}
            {data.items.length === 0 && <Notice tone="attention">{t('cafe.moveStock.noItems')}</Notice>}
            {data.balances.coverage !== 'complete' && <Notice tone="info">{t(data.balances.coverage === 'unallocated' ? 'cafe.moveStock.unallocated' : 'cafe.moveStock.coverageUnavailable')}</Notice>}
            {selectedItem && availableDecimal !== null && <p className="move-stock__note">{t('cafe.moveStock.available', { quantity: formatDec(availableDecimal), unit: selectedItem.unitName })}</p>}
            {message && <p role={message.role} className={message.role === 'alert' ? 'move-stock__error' : 'move-stock__note'}>{t(messageKeys[message.key])}{message.key === 'openingRequired' && <> {t(canPlace ? 'cafe.moveStock.openingNextStep' : 'cafe.moveStock.askLead')}</>}</p>}
          </div>
          <ActionBar className="move-stock__actions" reason={offline ? t('cafe.moveStock.offline') : undefined}
            secondary={canPlace ? <Button disabled={!canPlaceAll} onClick={() => setConfirmPlace(true)}>{t('cafe.moveStock.placeAll')}</Button> : undefined}
            primary={<Button variant="primary" disabled={!canSubmit} onClick={() => void submitMove()}>{t('cafe.moveStock.submit')}</Button>}
            aria-label={t('cafe.moveStock.submit')} />
        </>}
      </>}
    </section>
    {confirmPlace && <ConfirmDialog open title={t('cafe.moveStock.placeAll')} body={t('cafe.moveStock.placeAllConfirm', { location: storageLocations.find(location => location.id === to)?.name ?? '', date })}
      confirmLabel={t('cafe.moveStock.confirmPlace')} onConfirm={() => submitMove(true)} onCancel={() => { if (!busy) setConfirmPlace(false) }} />}
  </CafePageFrame>
}
