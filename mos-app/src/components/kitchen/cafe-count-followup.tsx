import { useId, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { QuantityFieldError } from '@/components/ui/quantity-field'
import { CaptureQuantityControl } from './capture-row'
import {
  normalizeCafeCountQuantity,
  parseCafeCountQuantity,
  recordCafeCountReason,
  recordCafeCountRecount,
  type CafeCountFloorLine,
} from '@/lib/db/cafe-count'
import './cafe-receipt.css'

const STATE_TEXT = {
  waiting: 'cafe.count.line.waiting',
  with_reviewer: 'cafe.count.line.withReviewer',
  confirmed: 'cafe.count.line.confirmed',
  held: 'cafe.count.line.held',
} as const

/** A submitted line's floor follow-up: its state, or the recount and reason it still needs. Never a figure. */
export function CafeCountFollowUp({ line, itemName, unitName, online, onSaved }: {
  line: CafeCountFloorLine
  itemName: string
  unitName: string
  online: boolean
  onSaved: (next: CafeCountFloorLine) => void
}) {
  const t = useT()
  const recountId = useId()
  const reasonId = useId()
  const helpId = useId()
  const errorId = useId()
  const [recount, setRecount] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [reasonInvalid, setReasonInvalid] = useState(false)

  if (line.state !== 'needs_recount' && line.state !== 'needs_reason') {
    return <p className="cafe-count__line-success" role="status">{t(STATE_TEXT[line.state])}</p>
  }

  async function save(write: () => Promise<CafeCountFloorLine>) {
    setSaving(true)
    setFailed(false)
    try {
      onSaved(await write())
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const parsed = parseCafeCountQuantity(recount)
  const recountValue = normalizeCafeCountQuantity(recount)
  const failure = failed && <p className="cafe-count__field-error" role="alert">{t('cafe.count.followupFailed')}</p>

  if (line.state === 'needs_recount') {
    return <div className="cafe-count__followup">
      <p className="cafe-count__recount-prompt" role="status">{t('cafe.count.recount.prompt')}</p>
      <label htmlFor={recountId}>{t('cafe.count.recount.label')}</label>
      <CaptureQuantityControl
        id={recountId}
        itemName={itemName}
        quantityFor={t('cafe.count.recount.quantityFor', { item: itemName, unit: unitName })}
        value={recount}
        unitName={unitName}
        invalid={parsed.kind === 'invalid'}
        describedById={parsed.kind === 'invalid' ? errorId : undefined}
        disabled={saving}
        onQuantityChange={setRecount}
      />
      {parsed.kind === 'invalid' && <QuantityFieldError id={errorId} reason={parsed.reason} rawValue={recount} maxFractionDigits={2} className="cafe-count__field-error" />}
      <button type="button" className="btn btn-outline btn-touch" disabled={!online || saving || recountValue === null}
        onClick={() => recountValue !== null && void save(async () => {
          const result = await recordCafeCountRecount(line.id, recountValue)
          return { ...line, rowVersion: result.rowVersion, state: result.reasonRequired ? 'needs_reason' : 'with_reviewer' }
        })}>
        {saving ? t('common.working') : t('cafe.count.recount.save')}
      </button>
      {failure}
    </div>
  }

  return <div className="cafe-count__followup">
    <p className="cafe-count__recount-prompt" role="status">{t('cafe.count.reason.prompt')}</p>
    <div className="cafe-receive__reason">
      <label htmlFor={reasonId}>{t('cafe.count.reason.label', { item: itemName })}</label>
      <textarea
        id={reasonId}
        value={reason}
        maxLength={500}
        rows={3}
        disabled={saving}
        aria-invalid={reasonInvalid || undefined}
        aria-describedby={reasonInvalid ? `${helpId} ${errorId}` : helpId}
        onChange={event => { setReason(event.target.value); setReasonInvalid(false) }}
      />
      <div className="cafe-receive__reason-meta">
        <span id={helpId}>{t('cafe.count.reason.help')}</span>
        <span className="tabular">{reason.length}/500</span>
      </div>
    </div>
    {reasonInvalid && <p id={errorId} className="cafe-count__field-error" role="alert">{t('cafe.count.reason.invalid')}</p>}
    <button type="button" className="btn btn-outline btn-touch" disabled={!online || saving}
      onClick={() => {
        if (!reason.trim()) { setReasonInvalid(true); return }
        void save(async () => {
          const result = await recordCafeCountReason(line.id, reason)
          return { ...line, rowVersion: result.rowVersion, state: 'with_reviewer' }
        })
      }}>
      {saving ? t('common.working') : t('cafe.count.reason.save')}
    </button>
    {failure}
  </div>
}
