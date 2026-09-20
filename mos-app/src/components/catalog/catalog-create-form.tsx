// ONE create form for Projects & Processes and Objectives — a real field-labelled form (Name →
// Type/Objective/Business Unit → footer), never a bespoke row wedged under a table's column
// headers. Same component, same anatomy (label above control, error under its control, footer
// row) on desktop and phone, mirroring TaskCreateForm's grammar so every collection's create
// flow reads as one system.
import { useId, useRef, useState } from 'react'
import { Picker } from '@/components/ui/picker'
import { TextInput } from '@/components/ui/text-input'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/use-t'
import type { CatalogCreateDraft } from './catalog-collection-actions'
import './catalog-create-form.css'

export function CatalogCreateForm({ draft }: { draft: CatalogCreateDraft }) {
  const t = useT()
  const formId = useId()
  const nameId = `${formId}-name`
  const nameErrorId = `${formId}-name-error`
  const businessUnitErrorId = `${formId}-bu-error`
  const [attempted, setAttempted] = useState(false)
  const businessUnitFieldId = useRef(`${formId}-bu`).current

  const label = draft.kind === 'objective' ? t('catalog.objectives.add') : t('catalog.projects.add')
  const nameMissing = attempted && !draft.name.trim()
  const businessUnitMissing = attempted && Boolean(draft.businessUnitRequired) && !draft.businessUnitId
  const nameError = nameMissing ? t('catalog.nameRequired') : (draft.error || undefined)
  const businessUnitError = businessUnitMissing ? t('catalog.record.businessUnitRequired') : undefined

  const submitLabel = draft.kind === 'objective'
    ? t('catalog.objectives.add')
    : draft.type === 'process' ? t('catalog.create.process') : t('catalog.create.project')
  const submittingLabel = t(draft.kind === 'objective' ? 'catalog.objectives.adding' : 'catalog.projects.adding')

  function trySubmit() {
    setAttempted(true)
    if (!draft.name.trim()) {
      document.getElementById(nameId)?.focus()
      return
    }
    if (draft.businessUnitRequired && !draft.businessUnitId) {
      document.getElementById(businessUnitFieldId)?.focus()
      return
    }
    draft.onSubmit()
  }

  return (
    <form
      className="ccf"
      aria-label={label}
      noValidate
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        if (!draft.adding) draft.onCancel()
      }}
      onSubmit={(event) => {
        event.preventDefault()
        trySubmit()
      }}
    >
      <div className="ccf-field">
        <label className="ccf-label" htmlFor={nameId}>
          {t('catalog.nameLabel')} <span className="ccf-required" aria-hidden="true">*</span>
        </label>
        <TextInput
          id={nameId}
          value={draft.name}
          onChange={(event) => { draft.onNameChange(event.target.value); if (attempted) setAttempted(false) }}
          error={Boolean(nameError)}
          aria-describedby={nameError ? nameErrorId : undefined}
          autoFocus
          fullWidth
          required
          disabled={draft.adding}
          placeholder={t('catalog.namePlaceholder')}
        />
        {nameError && <p id={nameErrorId} role="alert" className="ccf-error">{nameError}</p>}
      </div>

      {(draft.kind === 'work-line' || draft.businessUnitOptions) && (
        <div className="ccf-row">
          {draft.kind === 'work-line' && draft.type && draft.onTypeChange ? (
            <div className="ccf-field">
              <Picker
                label={t('catalog.filter.type')}
                value={draft.type}
                options={[
                  { value: 'project', label: t('catalog.tag.project') },
                  { value: 'process', label: t('catalog.tag.process') },
                ]}
                onChange={(value) => draft.onTypeChange?.(value as 'project' | 'process')}
                disabled={draft.adding}
              />
            </div>
          ) : null}
          {draft.kind === 'work-line' && draft.objectiveOptions && draft.onObjectiveChange ? (
            <div className="ccf-field">
              <Picker
                label={t('catalog.record.objective')}
                value={draft.objectiveId ?? ''}
                placeholder={t('catalog.notSet')}
                options={[{ value: '', label: t('catalog.notSet') }, ...draft.objectiveOptions]}
                onChange={(value) => draft.onObjectiveChange?.(value || null)}
                disabled={draft.adding}
              />
            </div>
          ) : null}
          {draft.businessUnitOptions && draft.onBusinessUnitChange ? (
            <div className="ccf-field">
              <Picker
                id={businessUnitFieldId}
                label={t('catalog.record.businessUnit')}
                value={draft.businessUnitId ?? ''}
                placeholder={draft.businessUnitRequired ? undefined : t('catalog.notSet')}
                options={draft.businessUnitRequired ? draft.businessUnitOptions : [{ value: '', label: t('catalog.notSet') }, ...draft.businessUnitOptions]}
                onChange={(value) => { draft.onBusinessUnitChange?.(value || null); if (attempted) setAttempted(false) }}
                required={draft.businessUnitRequired}
                error={Boolean(businessUnitError)}
                describedBy={businessUnitError ? businessUnitErrorId : undefined}
                disabled={draft.adding}
              />
              {businessUnitError && <p id={businessUnitErrorId} role="alert" className="ccf-error">{businessUnitError}</p>}
            </div>
          ) : null}
        </div>
      )}

      <div className="ccf-foot">
        <Button type="submit" variant="primary" disabled={draft.adding} aria-busy={draft.adding}>
          {draft.adding ? submittingLabel : submitLabel}
        </Button>
        <Button type="button" variant="ghost" disabled={draft.adding} onClick={draft.onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  )
}
