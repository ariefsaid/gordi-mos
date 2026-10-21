import { useId, useRef, useState } from 'react'
import { Notice } from '@/components/ui/notice'
import { useT } from '@/i18n/use-t'
import { newCafeCountClientKey, normalizeCafeCountQuantity } from '@/lib/db/cafe-count'
import { startCafeCountCorrection } from '@/lib/db/cafe-count-corrections'
import { CaptureQuantityControl } from './capture-row'

type CafeCountCorrectionActionProps = {
  lineId: string
  itemName: string
  unitName: string
  disabled: boolean
  onSaved: () => void
}

// The original is read-only; the new observation is entered before starting its normal review path.
export function CafeCountCorrectionAction({ lineId, itemName, unitName, disabled, onSaved }: CafeCountCorrectionActionProps) {
  const t = useT()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [quantity, setQuantity] = useState('')
  const [clientKey, setClientKey] = useState(newCafeCountClientKey)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const inFlight = useRef(false)
  const normalized = normalizeCafeCountQuantity(quantity)

  async function save() {
    if (inFlight.current || disabled || normalized === null) return
    inFlight.current = true
    setSaving(true)
    setFailed(false)
    try {
      await startCafeCountCorrection(lineId, normalized, clientKey)
      setOpen(false)
      setQuantity('')
      setClientKey(newCafeCountClientKey())
      onSaved()
    } catch {
      setFailed(true)
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  if (!open) return <button type="button" className="btn btn-outline btn-touch" disabled={disabled}
    onClick={() => setOpen(true)}>{t('cafe.count.correction.start')}</button>
  return <div>
    <p>{t('cafe.count.correction.help')}</p>
    <label htmlFor={id}>{t('cafe.count.correction.quantity')}</label>
    <CaptureQuantityControl id={id} itemName={itemName} unitName={unitName} value={quantity}
      quantityFor={t('cafe.count.correction.quantity')} onQuantityChange={setQuantity}
      disabled={saving || disabled} invalid={quantity !== '' && normalized === null} />
    {failed && <Notice tone="urgent">{t('cafe.count.correction.failed')}</Notice>}
    <button type="button" className="btn btn-primary btn-touch" disabled={disabled || saving || normalized === null}
      onClick={() => void save()}>{saving ? t('common.working') : t('cafe.count.correction.submit')}</button>
    <button type="button" className="btn btn-outline btn-touch" disabled={saving}
      onClick={() => { setOpen(false); setFailed(false) }}>{t('common.cancel')}</button>
  </div>
}
