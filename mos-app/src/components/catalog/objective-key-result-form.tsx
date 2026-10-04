import { useId, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { DateField } from '@/components/ui/date-field'
import { TextInput } from '@/components/ui/text-input'
import { useFocusRestore } from '@/components/ui/use-focus-restore'
import { PersonPicker } from '@/components/tasks/person-picker'
import type { PersonOption } from '@/lib/db/directory'
import type { KeyResultRow } from '@/lib/db/objective-key-results'
import '@/styles/form-grid.css'
import { isNumber, valuesOf, type FormValues } from './objective-key-result-values'

export type KeyResultFormProps = {
  row: KeyResultRow | null
  people: PersonOption[]
  onSubmit: (values: FormValues, saved: FormValues) => Promise<void>
  onCancel: () => void
  onRemove?: () => void
}

/** The inline editor for one key result: edit in place, or a blank row when adding. */
export function KeyResultForm({ row, people, onSubmit, onCancel, onRemove }: KeyResultFormProps) {
  const t = useT()
  const saved = valuesOf(row)
  const [values, setValues] = useState<FormValues>(saved)
  const [touched, setTouched] = useState<{ what: boolean; target: boolean }>({ what: false, target: false })
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pickingOwner, setPickingOwner] = useState(false)
  // Typed Due text that is not a usable date: Save refuses it instead of keeping the old date.
  const [dueInvalid, setDueInvalid] = useState(false)
  const [dueTried, setDueTried] = useState(false)
  const set = (patch: Partial<FormValues>) => setValues((current) => ({ ...current, ...patch }))
  const formRef = useFocusRestore<HTMLFormElement>(saving, failed, { includeFormControls: true })
  const whatErrorId = useId()
  const targetErrorId = useId()
  const whatError = touched.what && values.what.trim() === ''
  const targetError = touched.target && !isNumber(values.target)
  const ownerName = values.owner ? people.find((person) => person.id === values.owner)?.full_name ?? t('catalog.notAvailable') : t('catalog.notSet')

  const submit = async () => {
    if (saving) return
    setTouched({ what: true, target: true })
    setDueTried(true)
    if (values.what.trim() === '' || !isNumber(values.target) || dueInvalid) {
      // A refused submit takes the person to the first field that needs attention.
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setSaving(true)
    setFailed(false)
    try {
      await onSubmit(values, saved)
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      ref={formRef}
      noValidate
      className="objective-key-results__form form-grid"
      aria-label={row ? t('objective.keyResults.editA11y', { what: row.what }) : t('objective.keyResults.newWhat')}
      onSubmit={(event) => { event.preventDefault(); void submit() }}
      onKeyDown={(event) => { if (event.key === 'Escape' && !pickingOwner) { event.preventDefault(); event.stopPropagation(); onCancel() } }}
    >
      <div className="form-grid__field form-grid__field--full">
        <TextInput
          // Mounted by the click that asks for it (Edit, Add key result, a Get started row).
          autoFocus
          label={t('objective.keyResults.what')}
          value={values.what}
          maxLength={200}
          required
          error={whatError}
          aria-describedby={whatError ? whatErrorId : undefined}
          fullWidth
          disabled={saving}
          onChange={(event) => set({ what: event.target.value })}
          onBlur={() => setTouched((current) => ({ ...current, what: true }))}
        />
        {whatError ? <span id={whatErrorId} className="objective-key-results__error" role="alert">{t('objective.keyResults.whatRequired')}</span> : null}
      </div>
      <div className="form-grid__field">
        <TextInput
          label={t('objective.keyResults.target')}
          value={values.target}
          inputMode="decimal"
          error={targetError}
          aria-describedby={targetError ? targetErrorId : undefined}
          fullWidth
          disabled={saving}
          onChange={(event) => set({ target: event.target.value })}
          onBlur={() => setTouched((current) => ({ ...current, target: true }))}
        />
        {targetError ? <span id={targetErrorId} className="objective-key-results__error" role="alert">{t('objective.keyResults.numberInvalid')}</span> : null}
      </div>
      <div className="form-grid__field">
        <TextInput
          label={t('objective.keyResults.unit')}
          value={values.unit}
          maxLength={20}
          fullWidth
          disabled={saving}
          onChange={(event) => set({ unit: event.target.value })}
        />
      </div>
      <div className="form-grid__field">
        <DateField label={t('objective.keyResults.due')} value={values.due} fullWidth disabled={saving} reveal={dueTried} onChange={(due) => set({ due })} onValidityChange={setDueInvalid} />
      </div>
      <div className="form-grid__field">
        <span className="objective-key-results__label">{t('objective.keyResults.responsible')}</span>
        <div className="objective-key-results__owner">
          <Button type="button" variant="outline" disabled={saving} onClick={() => setPickingOwner(true)}>{ownerName}</Button>
          {values.owner ? (
            <Button type="button" variant="ghost" disabled={saving} onClick={() => set({ owner: null })}>{t('objective.keyResults.clearResponsible')}</Button>
          ) : null}
        </div>
        {pickingOwner ? (
          <PersonPicker people={people} onSelect={(owner) => set({ owner })} onClose={() => setPickingOwner(false)} />
        ) : null}
      </div>
      <div className="form-grid__field form-grid__field--full objective-key-results__actions">
        <Button type="submit" variant="outline" disabled={saving} aria-busy={saving || undefined}>
          {saving ? t('record.field.saving') : t('objective.keyResults.save')}
        </Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>{t('common.cancel')}</Button>
        {failed ? (
          <span className="objective-key-results__error" role="alert">
            {t('objective.keyResults.saveFailed')}{' · '}
            <button type="button" className="objective-key-results__retry" onClick={() => { void submit() }}>{t('record.field.retry')}</button>
          </span>
        ) : null}
        {onRemove ? (
          <button type="button" className="objective-key-results__remove" disabled={saving} onClick={onRemove}>
            {t('objective.keyResults.remove')}
          </button>
        ) : null}
      </div>
    </form>
  )
}
