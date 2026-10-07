import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { DateField } from '@/components/ui/date-field'
import { QuantityField } from '@/components/ui/quantity-field'
import { useT } from '@/i18n/use-t'
import { formatIDRExact } from '@/lib/format/money'
import { wibToday } from '@/lib/home-attention'
import { PendingBillProofError, paySeveralPendingBills, recordPendingBillPayment, uploadPendingBillProof, type PaidPendingBill, type RecordPendingBillPaymentInput } from '@/lib/db/pending-bill-payments'
import { summarizePendingBillSelection, validatePendingBillPaymentForm, type PendingBillPaymentField, type PendingBillPaymentFieldError, type PendingBillView } from '@/lib/pending-bills'
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
  payments?: PaidPendingBill[]
}

type PaymentDraft = { amount: string; cashInDate: string; cashInDateText: string; note: string; proof: File | null; reversalReason: string }

export type PendingBillPaymentFormProps = {
  bill: PendingBillView
  bills?: readonly PendingBillView[]
  orgId: string
  onCancel: () => void
  onSaved: (saved: PendingBillPaymentSaved) => void
  onDirtyChange?: (dirty: boolean) => void
  onBusyChange?: (busy: boolean) => void
  reversePayment?: { id: string; amount: number } | null
}

const FIELD_LABEL: Record<PendingBillPaymentField, 'pendingBills.form.amount' | 'pendingBills.form.cashInDate' | 'pendingBills.form.proof'> = {
  amount: 'pendingBills.form.amount',
  cashInDate: 'pendingBills.form.cashInDate',
  proof: 'pendingBills.form.proof',
}

export function PendingBillPaymentForm({ bill, bills, orgId, onCancel, onSaved, onDirtyChange, onBusyChange, reversePayment = null }: PendingBillPaymentFormProps) {
  // The panel's own buttons give way to this form, so focus moves into it when it opens.
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => { formRef.current?.focus() }, [])
  const t = useT()
  const id = useId()
  const today = wibToday()
  const multiSelection = bills === undefined ? null : summarizePendingBillSelection(bills, bills.map((selected) => selected.id))
  const multiMode = multiSelection !== null
  const idempotencyKey = useRef(crypto.randomUUID())
  const [amount, setAmount] = useState('')
  const [amountInvalid, setAmountInvalid] = useState(false)
  const [cashInDate, setCashInDate] = useState('')
  const [cashInDateText, setCashInDateText] = useState('')
  const [cashInDateInvalid, setCashInDateInvalid] = useState(false)
  const [note, setNote] = useState('')
  const [reversalReason, setReversalReason] = useState('')
  const [proof, setProof] = useState<File | null>(null)
  const [uploadedProofPath, setUploadedProofPath] = useState<string | null>(null)
  const [touched, setTouched] = useState<Partial<Record<PendingBillPaymentField, boolean>>>({})
  const [proofError, setProofError] = useState<string | null>(null)
  const draftRef = useRef<PaymentDraft>({ amount: '', cashInDate: '', cashInDateText: '', note: '', proof: null, reversalReason: '' })
  const invalidProofDraft = useRef(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function reportDirty(overrides: Partial<PaymentDraft> = {}) {
    const next = { ...draftRef.current, ...overrides }
    draftRef.current = next
    onDirtyChange?.(reversePayment
      ? Boolean(next.reversalReason.trim())
      : Boolean(next.amount || next.cashInDate || next.cashInDateText || next.note || next.proof || invalidProofDraft.current))
  }

  const validation = validatePendingBillPaymentForm({
    amount: multiMode ? String(bill.balance) : amount,
    cashInDate,
    hasProof: proof !== null,
    balance: bill.balance,
    today,
  })
  const errors = { ...validation.errors }
  if (cashInDateInvalid && !errors.cashInDate) errors.cashInDate = 'invalid'
  const fieldsWithErrors = (multiMode ? ['cashInDate', 'proof'] as const : ['amount', 'cashInDate', 'proof'] as const)
    .filter((field) => errors[field])
  const canSubmitPayment = validation.canSubmit && (!multiMode || multiSelection.count > 0)
    && (multiMode || !amountInvalid) && !cashInDateInvalid && !submitting && !proofError
  const canSubmitReversal = Boolean(reversalReason.trim()) && reversalReason.trim().length <= 500 && !submitting
  const canSubmit = reversePayment ? canSubmitReversal : canSubmitPayment

  function errorMessage(field: PendingBillPaymentField, error: PendingBillPaymentFieldError): string {
    const label = t(FIELD_LABEL[field])
    if (field === 'amount') {
      if (error === 'required') return t('pendingBills.form.error.amountRequired', { field: label })
      if (error === 'overBalance') return t('pendingBills.form.error.amountOverBalance', { field: label, balance: formatIDRExact(bill.balance) })
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
      invalidProofDraft.current = false
      setProof(null)
      reportDirty({ proof: null })
      return
    }
    const isPdf = file.type === 'application/pdf'
    const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    if (!isPdf && !isImage) {
      invalidProofDraft.current = true
      setProof(null)
      setProofError(t('pendingBills.form.proofUnsupported'))
      reportDirty({ proof: null })
      setTouched((previous) => ({ ...previous, proof: true }))
      return
    }
    if (isPdf && file.size > 307_200) {
      invalidProofDraft.current = true
      setProof(null)
      setProofError(t('pendingBills.form.proofTooLarge'))
      reportDirty({ proof: null })
      setTouched((previous) => ({ ...previous, proof: true }))
      return
    }
    invalidProofDraft.current = false
    setProof(file)
    reportDirty({ proof: file })
    setTouched((previous) => ({ ...previous, proof: true }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setRequestError(null)
    if (!canSubmit) return
    setSubmitting(true)
    onBusyChange?.(true)
    try {
      let saved: PendingBillPaymentSaved
      if (reversePayment) {
        const result = await recordPendingBillPayment({
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
        })
        saved = {
          ...result,
          amount: -reversePayment.amount,
          cashInDate: today,
          proofPath: null,
          note: null,
          reverseOf: reversePayment.id,
          reversalReason: reversalReason.trim(),
        }
      } else {
        let proofPath = uploadedProofPath
        if (!proofPath && proof) {
          proofPath = await uploadPendingBillProof(orgId, proof)
          setUploadedProofPath(proofPath)
        }
        if (multiMode && multiSelection && proofPath) {
          const payments = await paySeveralPendingBills({
            billIds: multiSelection.bills.map((selected) => selected.id),
            cashInDate,
            proofPath,
            idempotencyKey: idempotencyKey.current,
          })
          const totalCents = payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0)
          saved = {
            paymentId: payments[0].paymentId,
            replayed: payments.every((payment) => payment.replayed),
            amount: totalCents / 100,
            cashInDate,
            proofPath,
            note: null,
            reverseOf: null,
            reversalReason: null,
            payments,
          }
        } else {
          const input: RecordPendingBillPaymentInput = {
            esbCode: bill.esbCode,
            branchCode: bill.branchCode,
            billNo: bill.billNo,
            amount: Number(amount),
            cashInDate,
            proofPath,
            note: note.trim() || null,
            idempotencyKey: idempotencyKey.current,
          }
          const result = await recordPendingBillPayment(input)
          saved = {
            ...result,
            amount: Number(amount),
            cashInDate,
            proofPath,
            note: note.trim() || null,
            reverseOf: null,
            reversalReason: null,
          }
        }
      }
      onDirtyChange?.(false)
      onSaved(saved)
    } catch (error) {
      if (error instanceof PendingBillProofError) {
        setProofError(error.code === 'tooLarge'
          ? t('pendingBills.form.proofTooLarge')
          : error.code === 'unsupported' || error.code === 'empty'
            ? t('pendingBills.form.proofUnsupported')
            : t('pendingBills.form.proofUploadFailed'))
      } else {
        setRequestError(multiMode
          ? t('pendingBills.form.multiSaveError', { reason: error instanceof Error ? error.message : String(error) })
          : t('pendingBills.form.saveError'))
      }
    } finally {
      setSubmitting(false)
      onBusyChange?.(false)
    }
  }

  const formTitle = reversePayment ? t('pendingBills.form.reverseTitle') : t('pendingBills.form.title')
  // The date field states its own typed-value problem; the form speaks only for an empty date.
  const dateError = errors.cashInDate && touched.cashInDate && !cashInDateInvalid
    ? errorMessage('cashInDate', errors.cashInDate)
    : null
  const amountError = !amountInvalid && errors.amount && touched.amount
    ? errorMessage('amount', errors.amount)
    : null
  const proofFieldError = errors.proof && touched.proof
    ? errorMessage('proof', errors.proof)
    : null
  const amountHelpId = `${id}-amount-help`
  const dateHelpId = `${id}-date-help`
  const proofHelpId = `${id}-proof-help`

  return (
    <form ref={formRef} tabIndex={-1} className="pending-bill-payment-form" aria-label={formTitle} onSubmit={submit} noValidate>
      <div className="pending-bill-payment-form__heading">
        <div>
          <h2>{formTitle}</h2>
          <p>{multiMode && multiSelection
            ? t('pendingBills.form.multiBalance', { count: String(multiSelection.count), total: formatIDRExact(multiSelection.total) })
            : t('pendingBills.form.billBalance', { balance: formatIDRExact(bill.balance) })}</p>
        </div>
      </div>
      {reversePayment ? (
        <>
          <p className="pending-bill-payment-form__reversal-copy">
            {t('pendingBills.form.reverseCopy', { amount: formatIDRExact(reversePayment.amount) })}
          </p>
          <label className="mk-textinput__label" htmlFor={`${id}-reason`}>
            {t('pendingBills.form.reversalReason')} <span aria-hidden="true">*</span>
          </label>
          <textarea
            id={`${id}-reason`}
            className="pending-bill-payment-form__textarea"
            value={reversalReason}
            maxLength={500}
            required
            aria-required="true"
            onChange={(event) => {
              setReversalReason(event.target.value)
              reportDirty({ reversalReason: event.target.value })
            }}
            placeholder={t('pendingBills.form.reversalReasonPlaceholder')}
          />
          {!canSubmitReversal && <p className="pending-bill-payment-form__hint">{t('pendingBills.form.reversalReasonRequired')}</p>}
        </>
      ) : (
        <>
          {multiMode && multiSelection ? (
            <div className="pending-bill-payment-form__locked-amounts" aria-label={t('pendingBills.form.multiAmounts')}>
              <p className="pending-bill-payment-form__hint">{t('pendingBills.form.multiLocked')}</p>
              {multiSelection.bills.map((selected) => (
                <div key={selected.id} className="pending-bill-payment-form__locked-row">
                  <span>{selected.billNo}</span>
                  <span className="tabular">{formatIDRExact(selected.balance)}</span>
                </div>
              ))}
              <div className="pending-bill-payment-form__locked-row pending-bill-payment-form__locked-total">
                <strong>{t('pendingBills.form.multiTotal')}</strong>
                <strong className="tabular">{formatIDRExact(multiSelection.total)}</strong>
              </div>
            </div>
          ) : (
            <>
              <div className={`mk-textinput mk-textinput--full${amountInvalid || amountError ? ' mk-textinput--error' : ''} pending-bill-payment-form__amount`}>
                <label className="mk-textinput__label" htmlFor={`${id}-amount`}>
                  {t('pendingBills.form.amount')} <span aria-hidden="true">*</span>
                </label>
                <QuantityField
                  id={`${id}-amount`}
                  label={t('pendingBills.form.amount')}
                  value={Number(amount) || 0}
                  onChange={(value) => {
                    const next = value === 0 ? '' : String(value)
                    setAmount(next)
                    setAmountInvalid(false)
                    reportDirty({ amount: next })
                  }}
                  onInvalid={(_reason, raw) => {
                    setAmount(raw)
                    setAmountInvalid(true)
                    setTouched((previous) => ({ ...previous, amount: true }))
                    reportDirty({ amount: raw })
                  }}
                  onValidityChange={(valid) => setAmountInvalid(!valid)}
                  onBlur={() => setTouched((previous) => ({ ...previous, amount: true }))}
                  min={0}
                  maxFractionDigits={2}
                  required
                  error={Boolean(amountError)}
                  describedBy={`${amountHelpId}${amountError ? ` ${amountHelpId}-error` : ''}`}
                  controlClassName="mk-textinput__box"
                  className="mk-textinput__field"
                  suffixPosition="inline"
                />
              </div>
              <p id={amountHelpId} className="pending-bill-payment-form__hint">
                {t('pendingBills.form.amountHelp', { balance: formatIDRExact(bill.balance) })}
              </p>
              {amountError && <p id={`${amountHelpId}-error`} className="pending-bill-payment-form__field-error" role="alert">{amountError}</p>}
            </>
          )}

          <DateField
            label={t('pendingBills.form.cashInDate')}
            value={cashInDate}
            onChange={(date) => {
              setCashInDate(date)
              reportDirty({ cashInDate: date })
            }}
            draftText={cashInDateText}
            onDraftTextChange={(text) => {
              setCashInDateText(text)
              reportDirty({ cashInDateText: text })
            }}
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
            <label className="mk-textinput__label" htmlFor={`${id}-proof`}>
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

          {!multiMode && (
            <>
              <label className="mk-textinput__label" htmlFor={`${id}-note`}>{t('pendingBills.form.note')}</label>
              <textarea
                id={`${id}-note`}
                className="pending-bill-payment-form__textarea"
                value={note}
                maxLength={500}
                onChange={(event) => {
                  setNote(event.target.value)
                  reportDirty({ note: event.target.value })
                }}
                placeholder={t('pendingBills.form.notePlaceholder')}
              />
            </>
          )}
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
        <Button type="submit" variant="primary" disabled={!canSubmit} aria-busy={submitting || undefined}>
          {submitting ? t('common.working') : reversePayment ? t('pendingBills.form.reverseSubmit') : t('pendingBills.form.submit')}
        </Button>
      </div>
    </form>
  )
}
