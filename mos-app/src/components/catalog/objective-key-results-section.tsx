import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DateField } from '@/components/ui/date-field'
import { TextInput } from '@/components/ui/text-input'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { PersonPicker } from '@/components/tasks/person-picker'
import { RecordSection } from '@/components/record/record-page-layout'
import { getPeople, type PersonOption } from '@/lib/db/directory'
import { dateLocaleTag, formatDayMonthYear } from '@/lib/format/date'
import type { WorkWriteScopes } from '@/lib/db/work-authority'
import {
  createKeyResult,
  deleteKeyResult,
  listKeyResults,
  updateKeyResultCurrentValue,
  updateKeyResultTargets,
  type KeyResultRow,
  type KeyResultTargetsPatch,
} from '@/lib/db/objective-key-results'
import '@/styles/form-grid.css'
import './objective-key-results-section.css'
import { canEditObjectiveContentForScope, canManageForScope } from './use-work-write-authority'

export interface ObjectiveKeyResultsSectionProps {
  objectiveId: string
  businessUnitId?: string | null
  isCompanyWide?: boolean
  archived: boolean
  scopes: WorkWriteScopes
  /** Where the viewer's write-scope lookup stands; a person who may edit is never shown read-only copy while it is unknown. */
  scopesStatus?: 'loading' | 'ready' | 'error'
  onRetryScopes?: () => void
  /** The record's Get started region owns an empty section's action; the section stays out of the way. */
  hideWhenEmpty?: boolean
  /** Reports the loaded count (null while loading or failed) so the record can decide what is still missing. */
  onCount?: (count: number | null) => void
  /** Each increase opens a blank key-result row for an admin. */
  openAddToken?: number
}

/**
 * Empty text is null (never zero). A value the database would refuse is rejected before it is sent:
 * not a finite number, 1e15 or larger in size, or more than 6 decimal places.
 */
function parseNumber(raw: string): number | null {
  const text = raw.trim()
  if (text === '') return null
  const value = Number(text)
  if (!Number.isFinite(value)) throw new Error('not a finite number')
  if (Math.abs(value) >= 1e15 || !/^-?\d+(\.\d{1,6})?$/.test(String(value))) throw new Error('number out of range')
  return value
}

const numberText = (value: number | null) => (value === null ? '' : String(value))

function isNumber(raw: string): boolean {
  try { parseNumber(raw); return true } catch { return false }
}

/** The percentage exists only when both figures are set and the target is non-zero. */
function percentOf(row: KeyResultRow): number | null {
  const { current_value: current, target_value: target } = row
  if (current === null || target === null || target === 0) return null
  return Math.round(Math.min(100, Math.max(0, (current / target) * 100)))
}

function useNumberFormat() {
  const { locale } = useI18n()
  const format = new Intl.NumberFormat(dateLocaleTag(locale) === 'id-ID' ? 'id-ID' : 'en-US', { maximumFractionDigits: 6 })
  return (value: number) => format.format(value)
}

/** Edits one number in place: validates on blur or Enter, never per keystroke; the typed value stays on failure. */
function CurrentValueEditor({ row, onSaved, onClose }: {
  row: KeyResultRow
  onSaved: (next: KeyResultRow) => void
  onClose: () => void
}) {
  const t = useT()
  const [draft, setDraft] = useState(numberText(row.current_value))
  const [state, setState] = useState<'idle' | 'saving' | 'invalid' | 'failed'>('idle')
  const closing = useRef(false)
  const commit = async () => {
    if (closing.current || state === 'saving') return
    if (draft.trim() === numberText(row.current_value)) { closing.current = true; onClose(); return }
    if (!isNumber(draft)) { setState('invalid'); return }
    setState('saving')
    try {
      const next = await updateKeyResultCurrentValue(row.id, parseNumber(draft))
      closing.current = true
      onSaved(next)
      onClose()
    } catch {
      setState('failed')
    }
  }
  return (
    <span className="objective-key-results__current-edit">
      <TextInput
        // The field is mounted by the click that asks to edit it, so it takes focus at once.
        autoFocus
        label={t('objective.keyResults.current')}
        value={draft}
        inputMode="decimal"
        error={state === 'invalid' || state === 'failed'}
        disabled={state === 'saving'}
        onChange={(event) => { setDraft(event.target.value); if (state === 'invalid') setState('idle') }}
        onBlur={() => { void commit() }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); void commit() }
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closing.current = true; onClose() }
        }}
      />
      {state === 'invalid' ? <span className="objective-key-results__error" role="alert">{t('objective.keyResults.numberInvalid')}</span> : null}
      {state === 'failed' ? (
        <span className="objective-key-results__error" role="alert">
          {t('record.field.saveError')}{' '}
          <button type="button" className="objective-key-results__retry" onClick={() => { void commit() }}>{t('record.field.retry')}</button>
        </span>
      ) : null}
    </span>
  )
}

interface FormValues { what: string; target: string; unit: string; due: string; owner: string | null }

function valuesOf(row: KeyResultRow | null): FormValues {
  return {
    what: row?.what ?? '',
    target: numberText(row?.target_value ?? null),
    unit: row?.unit ?? '',
    due: row?.due_date ?? '',
    owner: row?.owner_person_id ?? null,
  }
}

/** The inline editor for one key result: edit in place, or a blank row when adding. */
function KeyResultForm({ row, people, onSubmit, onCancel, onRemove }: {
  row: KeyResultRow | null
  people: PersonOption[]
  onSubmit: (values: FormValues, saved: FormValues) => Promise<void>
  onCancel: () => void
  onRemove?: () => void
}) {
  const t = useT()
  const saved = valuesOf(row)
  const [values, setValues] = useState<FormValues>(saved)
  const [touched, setTouched] = useState<{ what: boolean; target: boolean }>({ what: false, target: false })
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pickingOwner, setPickingOwner] = useState(false)
  const set = (patch: Partial<FormValues>) => setValues((current) => ({ ...current, ...patch }))
  const formRef = useRef<HTMLFormElement>(null)
  const whatErrorId = useId()
  const targetErrorId = useId()
  const whatError = touched.what && values.what.trim() === ''
  const targetError = touched.target && !isNumber(values.target)
  const ownerName = values.owner ? people.find((person) => person.id === values.owner)?.full_name ?? t('catalog.notAvailable') : t('catalog.notSet')

  const submit = async () => {
    if (saving) return
    setTouched({ what: true, target: true })
    if (values.what.trim() === '' || !isNumber(values.target)) {
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
        <DateField label={t('objective.keyResults.due')} value={values.due} fullWidth disabled={saving} onChange={(due) => set({ due })} />
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

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

/** One key result, read mode: what, current / target, a thin track, then its due and owner. */
function KeyResultRowView({ row, people, canManage, canContent, editingCurrent, editRef, onEdit, onEditCurrent, onCurrentSaved, onCurrentClose }: {
  row: KeyResultRow
  people: PersonOption[]
  canManage: boolean
  canContent: boolean
  editingCurrent: boolean
  editRef: (element: HTMLButtonElement | null) => void
  onEdit: () => void
  onEditCurrent: () => void
  onCurrentSaved: (next: KeyResultRow) => void
  onCurrentClose: () => void
}) {
  const t = useT()
  const number = useNumberFormat()
  const percent = percentOf(row)
  const unitText = row.unit?.trim() ?? ''
  const unit = unitText === '' ? '' : unitText === '%' ? '%' : ` ${unitText}`
  const owner = row.owner_person_id ? people.find((person) => person.id === row.owner_person_id)?.full_name ?? t('catalog.notAvailable') : null
  const meta = [row.due_date ? `${t('objective.keyResults.due')} ${formatDayMonthYear(row.due_date)}` : null, owner].filter(Boolean).join(' · ')
  const target = row.target_value !== null ? number(row.target_value) : null
  // Closing the in-place editor hands focus back to the control that opened it.
  const openerRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)
  useEffect(() => {
    if (wasEditing.current && !editingCurrent) openerRef.current?.focus()
    wasEditing.current = editingCurrent
  }, [editingCurrent])

  let figure
  if (editingCurrent) {
    figure = <CurrentValueEditor row={row} onSaved={onCurrentSaved} onClose={onCurrentClose} />
  } else if (row.current_value !== null) {
    const current = number(row.current_value)
    figure = (
      <>
        {canContent ? (
          <button ref={openerRef} type="button" className="rp-link-btn rp-kr__current" aria-label={t('objective.keyResults.editCurrent', { what: row.what })} onClick={onEditCurrent}>{current}</button>
        ) : <span className="rp-kr__current">{current}</span>}
        {target !== null ? <span className="rp-kr__of"> / {target}{unit}</span> : <span className="rp-kr__of">{unit}</span>}
        {percent !== null ? <span className="rp-kr__pct tabular-nums">{percent}%</span> : null}
      </>
    )
  } else {
    figure = target !== null
      ? <span className="rp-kr__of">{t('objective.keyResults.progressTarget', { target: `${target}${unit}` })}</span>
      : null
  }

  return (
    <li className="rp-row rp-kr" data-testid="key-result-row">
      <span className="rp-row__name rp-kr__what">{row.what}</span>
      <span className="rp-kr__fig tabular-nums" data-testid="key-result-progress">{figure}</span>
      {canManage ? (
        <button ref={editRef} type="button" className="rp-icon-btn rp-icon-btn--quiet rp-kr__edit" aria-label={t('objective.keyResults.editA11y', { what: row.what })} onClick={onEdit}>
          <PencilIcon />
        </button>
      ) : null}
      {percent !== null ? (
        <div className="rp-kr__track">
          <div className="rp-track" role="progressbar" aria-label={t('objective.keyResults.percentOf', { what: row.what, percent: String(percent) })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>
      ) : null}
      {row.current_value === null && canContent && !editingCurrent ? (
        <button ref={openerRef} type="button" className="rp-link-btn rp-kr__add-current" onClick={onEditCurrent}>+ {t('objective.keyResults.addCurrent')}</button>
      ) : null}
      {meta ? <p className="rp-row__meta rp-kr__meta">{meta}</p> : null}
    </li>
  )
}

/**
 * Key results of one Objective. Admin adds/edits/removes; content writers (ops lead, the head of
 * the Objective's own unit) update only the current value; everyone else reads. Each row shows its
 * own figures — nothing is summed across rows.
 */
export function ObjectiveKeyResultsSection({
  objectiveId, businessUnitId, isCompanyWide, archived, scopes, scopesStatus = 'ready', onRetryScopes,
  hideWhenEmpty = false, onCount, openAddToken = 0,
}: ObjectiveKeyResultsSectionProps) {
  const t = useT()
  const [rows, setRows] = useState<KeyResultRow[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [people, setPeople] = useState<PersonOption[]>([])
  const [peopleFailed, setPeopleFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const [peopleReload, setPeopleReload] = useState(0)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [removing, setRemoving] = useState<KeyResultRow | null>(null)
  const editButtons = useRef(new Map<string, HTMLButtonElement | null>())
  const returnFocusTo = useRef<string | null>(null)
  const created = useRef<KeyResultRow | null>(null)
  const wasAdding = useRef(false)
  const focusAction = useCallback(() => {
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-record-section="key-results"] .rp-section__action')?.focus())
  }, [])

  const canManage = !archived && canManageForScope('objective', businessUnitId, scopes)
  const canContent = !archived && canEditObjectiveContentForScope({ businessUnitId, isCompanyWide }, scopes)

  useEffect(() => {
    let live = true
    setStatus('loading')
    listKeyResults(objectiveId)
      .then((next) => { if (live) { setRows(next); setStatus('ready') } })
      .catch(() => { if (live) setStatus('error') })
    return () => { live = false }
  }, [objectiveId, reload])

  useEffect(() => {
    let live = true
    setPeopleFailed(false)
    getPeople()
      .then((next) => { if (live) setPeople(next) })
      .catch(() => { if (live) setPeopleFailed(true) })
    return () => { live = false }
  }, [peopleReload])

  useEffect(() => { onCount?.(status === 'ready' ? rows.length : null) }, [onCount, rows.length, status])

  // Closing the blank row (saved or cancelled) hands focus to the section's Add action.
  useEffect(() => {
    if (wasAdding.current && !adding) focusAction()
    wasAdding.current = adding
  }, [adding, focusAction])

  // A Get started row (or this section's own action) asks for a blank row.
  useEffect(() => {
    if (openAddToken > 0 && canManage) { setEditingId(null); setAdding(true) }
  }, [openAddToken, canManage])

  // Closing an editor hands focus back to the Edit button of the row it belonged to.
  useEffect(() => {
    if (editingId === null && returnFocusTo.current) {
      editButtons.current.get(returnFocusTo.current)?.focus()
      returnFocusTo.current = null
    }
  })

  const replaceRow = useCallback((next: KeyResultRow) => setRows((current) => current.map((row) => (row.id === next.id ? next : row))), [])

  const patchOf = (values: FormValues, base: FormValues): KeyResultTargetsPatch => {
    const patch: KeyResultTargetsPatch = {}
    if (values.what.trim() !== base.what) patch.what = values.what.trim()
    if (values.target.trim() !== base.target) patch.target_value = parseNumber(values.target)
    if (values.unit.trim() !== base.unit) patch.unit = values.unit.trim() || null
    if (values.due !== base.due) patch.due_date = values.due || null
    if (values.owner !== base.owner) patch.owner_person_id = values.owner
    return patch
  }

  const saveEdit = async (row: KeyResultRow, values: FormValues, base: FormValues) => {
    const patch = patchOf(values, base)
    if (Object.keys(patch).length > 0) replaceRow(await updateKeyResultTargets(row.id, patch))
    returnFocusTo.current = row.id
    setEditingId(null)
  }

  const saveNew = async (values: FormValues) => {
    // A retry after a failed second step must not create the row twice.
    if (!created.current) {
      created.current = await createKeyResult(objectiveId, values.what.trim())
      setRows((current) => [...current, created.current as KeyResultRow])
    }
    const patch = patchOf(values, valuesOf(null))
    delete patch.what
    if (Object.keys(patch).length > 0) {
      const next = await updateKeyResultTargets(created.current.id, patch)
      created.current = next
      replaceRow(next)
    }
    created.current = null
    setAdding(false)
  }

  const visible = !hideWhenEmpty || rows.length > 0 || adding || status !== 'ready'
  if (!visible) return null

  // A viewer who can neither add nor edit has nothing to add to an empty section: the header says so, once.
  if (status === 'ready' && rows.length === 0 && !adding && !canManage) return null

  return (
    <RecordSection
      id="key-results"
      title={t('objective.keyResults.title')}
      count={status === 'ready' && rows.length > 0 ? rows.length : undefined}
      action={canManage && status === 'ready' && !adding ? { label: t('objective.keyResults.add'), onClick: () => { setEditingId(null); setAdding(true) } } : undefined}
    >
      {scopesStatus === 'error' ? <ErrorState message={t('objective.keyResults.permissionsError')} onRetry={onRetryScopes} /> : null}
      {status === 'loading' ? <LoadingShell label={t('catalog.record.loading')} count={1} /> : null}
      {status === 'error' ? <ErrorState message={t('objective.keyResults.loadError')} onRetry={() => setReload((n) => n + 1)} /> : null}
      {peopleFailed ? <ErrorState message={t('objective.keyResults.peopleError')} onRetry={() => setPeopleReload((n) => n + 1)} /> : null}
      {status === 'ready' ? (
        <ul className="rp-rows objective-key-results__list">
          {rows.map((row) => (
            row.id === editingId ? (
              <li key={row.id} className="rp-row objective-key-results__editing">
                <KeyResultForm
                  row={row}
                  people={people}
                  onSubmit={(values, base) => saveEdit(row, values, base)}
                  onCancel={() => { returnFocusTo.current = row.id; setEditingId(null) }}
                  onRemove={() => setRemoving(row)}
                />
              </li>
            ) : (
              <KeyResultRowView
                key={row.id}
                row={row}
                people={people}
                canManage={canManage}
                canContent={canContent}
                editingCurrent={currentId === row.id}
                editRef={(element) => { editButtons.current.set(row.id, element) }}
                onEdit={() => { setAdding(false); setEditingId(row.id) }}
                onEditCurrent={() => setCurrentId(row.id)}
                onCurrentSaved={replaceRow}
                onCurrentClose={() => setCurrentId(null)}
              />
            )
          ))}
          {adding ? (
            <li className="rp-row objective-key-results__editing">
              <KeyResultForm row={null} people={people} onSubmit={saveNew} onCancel={() => { created.current = null; setAdding(false) }} />
            </li>
          ) : null}
        </ul>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={t('objective.keyResults.removeTitle')}
        body={t('objective.keyResults.removeBody')}
        confirmLabel={t('objective.keyResults.remove')}
        tone="destructive"
        onConfirm={async () => {
          if (!removing) return
          await deleteKeyResult(removing.id)
          setRows((current) => current.filter((row) => row.id !== removing.id))
          setRemoving(null)
          setEditingId(null)
          focusAction()
        }}
        onCancel={() => setRemoving(null)}
      />
    </RecordSection>
  )
}
