import { useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { TextInput } from '@/components/ui/text-input'
import type { PersonOption } from '@/lib/db/directory'
import { formatDayMonthYear } from '@/lib/format/date'
import { updateKeyResultCurrentValue, type KeyResultRow } from '@/lib/db/objective-key-results'
import { isNumber, numberText, parseNumber, percentOf, useNumberFormat } from './objective-key-result-values'

type CurrentValueEditorProps = {
  row: KeyResultRow
  onSaved: (next: KeyResultRow) => void
  onClose: () => void
}

/** Edits one number in place: validates on blur or Enter, never per keystroke; the typed value stays on failure. */
function CurrentValueEditor({ row, onSaved, onClose }: CurrentValueEditorProps) {
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

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

export type KeyResultRowViewProps = {
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
}

/** One key result, read mode: what, current / target, a thin track, then its due and owner. */
export function KeyResultRowView({ row, people, canManage, canContent, editingCurrent, editRef, onEdit, onEditCurrent, onCurrentSaved, onCurrentClose }: KeyResultRowViewProps) {
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
