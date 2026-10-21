import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { useT } from '@/i18n/use-t'
import { CANCEL_VOID_REASONS, recordCancelVoidReview, type CancelVoidRow, type CancelVoidReview, type CancelVoidReason } from '@/lib/db/cancel-void'
import { type PersonOption } from '@/lib/db/directory'
import { CANCEL_VOID_REASON_LABELS } from './cancel-void-labels'

type CancelVoidReviewFormProps = {
  row: CancelVoidRow; people: PersonOption[]; onSaved: (review: CancelVoidReview) => void; onClose: () => void
}

export function CancelVoidReviewForm({ row, people, onSaved, onClose }: CancelVoidReviewFormProps) {
  const t = useT()
  const [personId, setPersonId] = useState('')
  const [reason, setReason] = useState<CancelVoidReason | ''>('')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [discard, setDiscard] = useState(false)
  const inFlight = useRef(false)
  const dirty = Boolean(personId || reason || note)
  return <>
    <RouteLeaveGuard when={dirty || pending} message={t('money.cancelVoid.unsaved')} includeSearch />
    <form aria-label={t('money.cancelVoid.record')} className="cancel-void__form" onSubmit={async event => {
      event.preventDefault()
      if (!personId || !reason || !note.trim() || inFlight.current) return
      inFlight.current = true
      setPending(true)
      setFailed(false)
      try {
        const review = await recordCancelVoidReview({ esbCode: row.esb_code, caseId: row.case_id, personId, reason, note })
        onSaved(review)
      } catch { setFailed(true) }
      finally { inFlight.current = false; setPending(false) }
    }}>
      <h4>{t('money.cancelVoid.record')} · {row.sales_num}</h4>
      <Select label={t('money.cancelVoid.person')} value={personId} disabled={pending} required onChange={event => setPersonId(event.target.value)}>
        <option value="">{t('money.cancelVoid.choose')}</option>
        {people.map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}
      </Select>
      <Select label={t('money.cancelVoid.reason')} value={reason} disabled={pending} required onChange={event => setReason(event.target.value as CancelVoidReason)}>
        <option value="">{t('money.cancelVoid.choose')}</option>
        {CANCEL_VOID_REASONS.map(value => <option key={value} value={value}>{t(CANCEL_VOID_REASON_LABELS[value])}</option>)}
      </Select>
      <label>{t('money.cancelVoid.note')}<textarea className="input" value={note} required maxLength={2000} disabled={pending} onChange={event => setNote(event.target.value)} /></label>
      {failed && <p role="alert">{t('money.cancelVoid.saveError')}</p>}
      <div className="cancel-void__actions">
        <Button type="submit" disabled={pending || !personId || !reason || !note.trim()}>{t(pending ? 'money.cancelVoid.saving' : 'money.cancelVoid.save')}</Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => dirty ? setDiscard(true) : onClose()}>{t('common.cancel')}</Button>
      </div>
    </form>
    <ConfirmDialog open={discard} title={t('leaveGuard.title')} body={t('money.cancelVoid.unsaved')} confirmLabel={t('leaveGuard.discard')} cancelLabel={t('leaveGuard.stay')} tone="destructive" onConfirm={async () => onClose()} onCancel={() => setDiscard(false)} />
  </>
}
