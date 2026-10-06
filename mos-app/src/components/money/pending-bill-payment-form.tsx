import { useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { DateField } from '@/components/ui/date-field'
import { TextInput } from '@/components/ui/text-input'
import { useT } from '@/i18n/use-t'
import { formatIDR } from '@/lib/format/money'
import { wibToday } from '@/lib/home-attention'
import { PendingBillProofError, recordPendingBillPayment, uploadPendingBillProof, type RecordPendingBillPaymentInput } from '@/lib/db/pending-bill-payments'
import { validatePendingBillPaymentForm, type PendingBillPaymentField, type PendingBillPaymentFieldError, type PendingBillView } from '@/lib/pending-bills'
import './pending-bill-payment-form.css'

export interface PendingBillPaymentSaved {
  paymentId: string
  replayed: boolean
  amount: number
  cashInDate: string
  proofPath: string | null
  note: string | null
  reverseOf: string | null
  reversalReason: string | null
}

export type PendingBillPaymentFormProps = {
  bill: PendingBillView
  orgId: string
  onCancel: () => void
  onSaved: (saved: PendingBillPaymentSaved) => void
  reversePayment?: { id: string; amount: number } | null
}

const FIELD_LABEL: Record<PendingBillPaymentField, 'pendingBills.form.amount' | 'pendingBills.form.cashInDate' | 'pendingBills.form.proof'> = {
  amount: 'pendingBills.form.amount',
  cashInDate: 'pendingBills.form.cashInDate',
  proof: 'pendingBills.form.proof',
}

export function PendingBillPaymentForm({ bill, orgId, onCancel, onSaved, reversePayment = null }: PendingBillPaymentFormProps) {
  const t = useT()
  const id = useId()
  const today = wibToday()
  const idempotencyKey = useRef(crypto.randomUUID())
  const [amount, setAmount] = useState('')
  const [cashInDate, setCashInDate] = useState('')
  const [cashInDateInvalid, setCashInDateInvalid] = useState(false)
  const [note, setNote] = useState('')
  const [reversalReason, setReversalReason] = useState('')
  const [proof, setProof] = useState<File | null>(null)
  const [uploadedProofPath, setUploadedProofPath] = useState<string | null>(null)
  const [touched, setTouched] = useState<Partial<Record<PendingBillPaymentField, boolean>>>({})
  const [proofError, setProofError] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const validation = validatePendingBillPaymentForm({
    amount,
    cashInDate,
    hasProof: proof !== null,
    balance: bill.balance,
    today,
  })
  const errors = { ...validation.errors }
  if (cashInDateInvalid && !errors.cashInDate) errors.cashInDate = 'invalid'
  const fieldsWithErrors = (['amount', 'cashInDate', 'proof'] as const).filter((field) => errors[field])
  const canSubmitPayment = validation.canSubmit && !cashInDateInvalid && !submitting && !proofError
  const canSubmitReversal = Boolean(reversalReason.trim()) && reversalReason.trim().length <= 500 && !submitting
  const canSubmit = reversePayment ? canSubmitReversal : canSubmitPayment

  function errorMessage(field: PendingBillPaymentField, error: PendingBillPaymentFieldError): string {
    const label = t(FIELD_LABEL[field])
    if (field === 'amount') {
      if (error === 'required') return t('pendingBills.form.error.amountRequired', { field: label })
      if (error === 'overBalance') return t('pendingBills.form.error.amountOverBalance', { field: label, balance: formatIDR(bill.balance) })
      return t('pendingBills.form.error.amountInvalid', { field: label })
    }
    if (field === 'cashInDate') {
      if (error === 'required') return t('pendingBills.form.error.required', { field: label })
      if (error === 'future') return t('pendingBills.form.error.dateFuture', { field: label })
      return t('pendingBills.form.error.dateInvalid', { field: label })
    }
    return t('pendingBills.form.error.required', { field: label })
  }

  function chooseProof(file: File | null) {
    setProofError(null)
    setUploadedProofPath(null)
    if (!file) {
      setProof(null)
      return
    }
    const isPdf = file.type === 'application/pdf'
    const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    if (!isPdf && !isImage) {
      setProof(null)
      setProofError(t('pendingBills.form.proofUnsupported'))
      setTouched((previous) => ({ ...previous, proof: true }))
      return
    }
    if (isPdf && file.size > 307_200) {
      setProof(null)
      setProofError(t('pendingBills.form.proofTooLarge'))
      setTouched((previous) => ({ ...previous, proof: true }))
      return
    }
    setProof(file)
    setTouched((previous) => ({ ...previous, proof: true }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setRequestError(null)
    if (!canSubmit) return
    setSubmitting(true)
    try {
      let input: RecordPendingBillPaymentInput
      if (reversePayment) {
        input = {
          esbCode: bill.esbCode,
          branchCode: bill.branchCode,
          billNo: bill.billNo,
          amount: null,
          cashInDate: null,
          proofPath: null,
          note: null,
          idempotencyKey: idempotencyKey.current,
          reversePaymentId: reversePayment.id,
          reversalReason: reversalReason.trim(),
        }
      } else {
        let proofPath = uploadedProofPath
        if (!proofPath && proof) {
          proofPath = await uploadPendingBillProof(orgId, proof)
          setUploadedProofPath(proofPath)
        }
        input = {
          esbCode: bill.esbCode,
          branchCode: bill.branchCode,
          billNo: bill.billNo,
          amount: Number(amount),
          cashInDate,
          proofPath,
          note: note.trim() || null,
          idempotencyKey: idempotencyKey.current,
        }
      }
      const result = await recordPendingBillPayment(input)
      const saved: PendingBillPaymentSaved = reversePayment
        ? {
            ...result,
            amount: -reversePayment.amount,
            cashInDate: today,
            proofPath: null,
            note: null,
            reverseOf: reversePayment.id,
            reversalReason: reversalReason.trim(),
          }
        : {
            ...result,
            amount: Number(amount),
            cashInDate,
            proofPath: uploadedProofPath ?? input.proofPath,
            note: note.trim() || null,
            reverseOf: null,
            reversalReason: null,
          }
      onSaved(saved)
    } catch (error) {
      if (error instanceof PendingBillProofError) {
        setProofError(error.code === 'tooLarge'
          ? t('pendingBills.form.proofTooLarge')
          : error.code === 'unsupported' || error.code === 'empty'
            ? t('pendingBills.form.proofUnsupported')
            : t('pendingBills.form.proofUploadFailed'))
      } else {
        setRequestError(t('pendingBills.form.saveError'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const formTitle = reversePayment ? t('pendingBills.form.reverseTitle') : t('pendingBills.form.title')
  const dateError = errors.cashInDate && touched.cashInDate
    ? errorMessage('cashInDate', errors.cashInDate)
    : null
  const amountError = errors.amount && touched.amount
    ? errorMessage('amount', errors.amount)
    : null
  const proofFieldError = errors.proof && touched.proof
    ? errorMessage('proof', errors.proof)
    : null
  const amountHelpId = `${id}-amount-help`
  const dateHelpId = `${id}-date-help`
  const proofHelpId = `${id}-proof-help`

  return (
    <form className="pending-bill-payment-form" aria-label={formTitle} onSubmit={submit} noValidate>
      <div className="pending-bill-payment-form__heading">
        <div>
          <h2>{formTitle}</h2>
          <p>{t('pendingBills.form.billBalance', { billNo: bill.billNo, balance: formatIDR(bill.balance) })}</p>
        </div>
      </div>
      {reversePayment ? (
        <>
          <p className="pending-bill-payment-form__reversal-copy">
            {t('pendingBills.form.reverseCopy', { amount: formatIDR(reversePayment.amount) })}
          </p>
          <label className="pending-bill-payment-form__label" htmlFor={`${id}-reason`}>
            {t('pendingBills.form.reversalReason')} <span aria-hidden="true">*</span>
          </label>
          <textarea
            id={`${id}-reason`}
            className="pending-bill-payment-form__textarea"
            value={reversalReason}
            maxLength={500}
            required
            aria-required="true"
            onChange={(event) => setReversalReason(event.target.value)}
            placeholder={t('pendingBills.form.reversalReasonPlaceholder')}
          />
          {!canSubmitReversal && <p className="pending-bill-payment-form__hint">{t('pendingBills.form.reversalReasonRequired')}</p>}
        </>
      ) : (
        <>
          <TextInput
            label={t('pendingBills.form.amount')}
            type="number"
            inputMode="numeric"
            min="1"
            max={bill.balance}
            step="1"
            required
            value={amount}
            error={Boolean(amountError)}
            aria-required="true"
            aria-invalid={Boolean(errors.amount) || undefined}
            aria-describedby={`${amountHelpId}${amountError ? ` ${amountHelpId}-error` : ''}`}
            onChange={(event) => setAmount(event.target.value)}
            onBlur={() => setTouched((previous) => ({ ...previous, amount: true }))}
          />
          <p id={amountHelpId} className="pending-bill-payment-form__hint">
            {t('pendingBills.form.amountHelp', { balance: formatIDR(bill.balance) })}
          </p>
          {amountError && <p id={`${amountHelpId}-error`} className="pending-bill-payment-form__field-error" role="alert">{amountError}</p>}

          <DateField
            label={t('pendingBills.form.cashInDate')}
            value={cashInDate}
            onChange={setCashInDate}
            onValidityChange={setCashInDateInvalid}
            onBlur={() => setTouched((previous) => ({ ...previous, cashInDate: true }))}
            max={today}
            required
            error={Boolean(dateError)}
            fullWidth
            aria-describedby={`${dateHelpId}${dateError ? ` ${dateHelpId}-error` : ''}`}
          />
          <p id={dateHelpId} className="pending-bill-payment-form__hint">{t('pendingBills.form.cashInDateHelp')}</p>
          {dateError && <p id={`${dateHelpId}-error`} className="pending-bill-payment-form__field-error" role="alert">{dateError}</p>}

          <div className="pending-bill-payment-form__proof">
            <label className="pending-bill-payment-form__label" htmlFor={`${id}-proof`}>
              {t('pendingBills.form.proof')} <span aria-hidden="true">*</span>
            </label>
            <p id={proofHelpId} className="pending-bill-payment-form__hint">{t('pendingBills.form.proofHelp')}</p>
            <input
              id={`${id}-proof`}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              capture="environment"
              required
              aria-required="true"
              aria-invalid={Boolean(proofFieldError || proofError) || undefined}
              aria-describedby={`${proofHelpId}${proofFieldError || proofError ? ` ${proofHelpId}-error` : ''}`}
              onBlur={() => setTouched((previous) => ({ ...previous, proof: true }))}
              onChange={(event) => {
                chooseProof(event.currentTarget.files?.[0] ?? null)
                event.currentTarget.value = ''
              }}
            />
            {proof && <p className="pending-bill-payment-form__selected-proof">{proof.name}</p>}
            {proofFieldError && !proofError && <p id={`${proofHelpId}-error`} className="pending-bill-payment-form__field-error" role="alert">{proofFieldError}</p>}
            {proofError && <p id={`${proofHelpId}-error`} className="pending-bill-payment-form__field-error" role="alert">{t('pendingBills.form.proof')}: {proofError}</p>}
          </div>

          <label className="pending-bill-payment-form__label" htmlFor={`${id}-note`}>{t('pendingBills.form.note')}</label>
          <textarea
            id={`${id}-note`}
            className="pending-bill-payment-form__textarea"
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('pendingBills.form.notePlaceholder')}
          />
        </>
      )}

      {!canSubmit && !reversePayment && fieldsWithErrors.length > 0 && (
        <p className="pending-bill-payment-form__requirements" role="status">
          {t('pendingBills.form.completeFields', {
            fields: fieldsWithErrors.map((field) => t(FIELD_LABEL[field])).join(', '),
          })}
        </p>
      )}
      {requestError && <p className="pending-bill-payment-form__request-error" role="alert">{requestError}</p>}

      <div className="pending-bill-payment-form__actions">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>{t('common.cancel')}</Button>
        <Button type="submit" disabled={!canSubmit} aria-busy={submitting || undefined}>
          {submitting ? t('common.working') : reversePayment ? t('pendingBills.form.reverseSubmit') : t('pendingBills.form.submit')}
        </Button>
      </div>
    </form>
  )
}
