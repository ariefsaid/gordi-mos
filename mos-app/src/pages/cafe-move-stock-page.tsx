// Café › Locations › Change location (PREVIEW — descendant of the /cafe/locations ship root).
// Moving stock between two places inside the SAME books: not a cross-branch transfer and not production.
// Nothing is connected: the form lives in memory with the isolated SAMPLE places, every write is disabled with
// the spec's reason, and no stub is called. Contract: R/handover/locations.md.
import { useMemo, useState } from 'react'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { PreviewBadge } from '@/components/preview/preview-badge'
import { ActionBar } from '@/components/ui/action-bar'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'
import { Select } from '@/components/ui/select'
import { TextInput } from '@/components/ui/text-input'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { sampleLocations } from '@/lib/cafe-locations-view'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { wibToday } from '@/lib/format/date'
import './cafe-move-stock-page.css'

const SAMPLE_KEY: Record<string, MessageKey> = {
  'sample-kitchen': 'cafe.locations.sample.kitchen',
  'sample-chiller': 'cafe.locations.sample.chiller',
  'sample-store-room': 'cafe.locations.sample.storeRoom',
  'sample-bar-fridge': 'cafe.locations.sample.barFridge',
}

export function CafeMoveStockPage() {
  const t = useT()
  // Only active sample places that can hold stock; they exist in this preview and nowhere else.
  const places = useMemo(() => sampleLocations([]).filter((row) => !row.archived && row.use !== 'production'), [])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [quantity, setQuantity] = useState('')
  const [date, setDate] = useState(wibToday())
  const [note, setNote] = useState('')
  const dirty = Boolean(from || to || quantity || note) || date !== wibToday()
  const same = Boolean(from) && from === to

  return (
    <CafePageFrame page="moveStock" date={date}>
      <RouteLeaveGuard when={dirty} message={t('cafe.moveStock.leaveMessage')} />
      <section className="move-stock" aria-label={t('cafe.pageTitle.moveStock')}>
        <p className="move-stock__job">{t('cafe.moveStock.job')}</p>
        <p className="move-stock__badges">
          <Pill tone="violet" dot={false}>{t('cafe.locations.sampleBadge')}</Pill>
          <PreviewBadge />
        </p>
        <div className="move-stock__form" role="group" aria-label={t('cafe.pageTitle.moveStock')}>
          <Select label={t('cafe.locations.field.from')} value={from} fullWidth onChange={(e) => setFrom(e.target.value)}>
            <option value="" disabled>{t('cafe.moveStock.choose')}</option>
            {places.map((place) => <option key={place.id} value={place.id}>{t(SAMPLE_KEY[place.id])}</option>)}
          </Select>
          <Select label={t('cafe.locations.field.to')} value={to} fullWidth onChange={(e) => setTo(e.target.value)}>
            <option value="" disabled>{t('cafe.moveStock.choose')}</option>
            {places.map((place) => <option key={place.id} value={place.id}>{t(SAMPLE_KEY[place.id])}</option>)}
          </Select>
          {same && <p className="move-stock__error" role="alert">{t('cafe.moveStock.samePlace')}</p>}
          <Select label={t('cafe.moveStock.item')} value="" disabled fullWidth>
            <option value="">{t('cafe.moveStock.itemChoose')}</option>
          </Select>
          <div className="move-stock__qty">
            <TextInput label={t('cafe.moveStock.quantity')} inputMode="decimal" value={quantity} fullWidth autoComplete="off"
              onChange={(e) => setQuantity(e.target.value)} />
            <div className="move-stock__unit">
              <span className="move-stock__label">{t('cafe.moveStock.unit')}</span>
              <span className="move-stock__muted">{t('cafe.moveStock.unitNone')}</span>
            </div>
          </div>
          <p className="move-stock__note">{t('cafe.moveStock.unitFixed')}</p>
          <TextInput label={t('cafe.moveStock.date')} type="date" value={date} fullWidth onChange={(e) => setDate(e.target.value)} />
          <TextInput label={t('cafe.moveStock.note')} value={note} fullWidth autoComplete="off" onChange={(e) => setNote(e.target.value)} />
          <p className="move-stock__note">{t('cafe.moveStock.sameBooks')}</p>
        </div>
        <ActionBar
          className="move-stock__actions"
          reason={t('cafe.locations.notConnected')}
          primary={<Button variant="primary" disabled>{t('cafe.moveStock.submit')}</Button>}
          aria-label={t('cafe.moveStock.submit')}
        />
      </section>
    </CafePageFrame>
  )
}
