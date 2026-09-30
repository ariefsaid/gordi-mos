import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DateField } from '@/components/ui/date-field'
import { TextInput } from '@/components/ui/text-input'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { PersonPicker } from '@/components/tasks/person-picker'
import { getPeople, type PersonOption } from '@/lib/db/directory'
import { formatDayMonthYear } from '@/lib/format/date'
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
}

type Translate = ReturnType<typeof useT>
type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

/** Empty text is null (never zero); anything not a finite number is rejected before it is sent. */
function parseNumber(raw: string): number | null {
  const text = raw.trim()
  if (text === '') return null
  const value = Number(text)
  if (!Number.isFinite(value)) throw new Error('not a finite number')
  return value
}

const numberText = (value: number | null) => (value === null ? '' : String(value))

/** The percentage exists only when both figures are set and the target is non-zero. */
function percentOf(row: KeyResultRow): number | null {
  const { current_value: current, target_value: target } = row
  if (current === null || target === null || target === 0) return null
  return Math.round(Math.min(100, Math.max(0, (current / target) * 100)))
}

function progressText(row: KeyResultRow, t: Translate): string | null {
  const current = row.current_value
  const target = row.target_value
  const unit = row.unit?.trim() ? ` ${row.unit.trim()}` : ''
  if (current !== null && target !== null) {
    return t('objective.keyResults.progress', { current: String(current), target: String(target) }) + unit
  }
  if (current !== null) return t('objective.keyResults.progressCurrent', { current: String(current) }) + unit
  if (target !== null) return t('objective.keyResults.progressTarget', { target: String(target) }) + unit
  return null
}

function useCommitStatus() {
  const [state, setState] = useState<SaveState>('idle')
  const attempt = useRef<(() => Promise<void>) | null>(null)
  const run = useCallback(async (action: () => Promise<void>) => {
    attempt.current = action
    setState('saving')
    try {
      await action()
      attempt.current = null
      setState('saved')
    } catch {
      setState('failed')
    }
  }, [])
  const retry = useCallback(() => { if (attempt.current) void run(attempt.current) }, [run])
  return { state, run, retry }
}

function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const t = useT()
  return (
    <span className="objective-key-results__status" role="status" data-state={state}>
      {state === 'saving' ? t('record.field.saving') : null}
      {state === 'saved' ? t('record.field.saved') : null}
      {state === 'failed' ? (
        <>
          {t('record.field.saveError')}{' '}
          <button type="button" className="objective-key-results__retry" onClick={onRetry}>{t('record.field.retry')}</button>
        </>
      ) : null}
    </span>
  )
}

/** Eager text commit on blur/Enter; the typed value stays put when the save fails. */
function CommitField({ label, saved, onCommit, inputMode }: {
  label: string
  saved: string
  onCommit: (raw: string) => Promise<void>
  inputMode?: 'decimal'
}) {
  const [draft, setDraft] = useState(saved)
  const { state, run, retry } = useCommitStatus()
  useEffect(() => { setDraft(saved) }, [saved])
  const commit = () => { if (draft !== saved) void run(() => onCommit(draft)) }
  return (
    <div className="form-grid__field objective-key-results__field">
      <TextInput
        label={label}
        value={draft}
        inputMode={inputMode}
        error={state === 'failed'}
        fullWidth
        disabled={state === 'saving'}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); commit() }
          if (event.key === 'Escape') { event.preventDefault(); setDraft(saved) }
        }}
      />
      <SaveStatus state={state} onRetry={retry} />
    </div>
  )
}

function DueField({ row, onPatch }: { row: KeyResultRow; onPatch: (patch: KeyResultTargetsPatch) => Promise<void> }) {
  const t = useT()
  const { state, run, retry } = useCommitStatus()
  const [draft, setDraft] = useState(row.due_date ?? '')
  useEffect(() => { setDraft(row.due_date ?? '') }, [row.due_date])
  return (
    <div className="form-grid__field objective-key-results__field">
      <DateField
        label={t('objective.keyResults.due')}
        value={draft}
        fullWidth
        onChange={(value) => { setDraft(value); void run(() => onPatch({ due_date: value || null })) }}
      />
      <SaveStatus state={state} onRetry={retry} />
    </div>
  )
}

function OwnerField({ row, people, onPatch }: {
  row: KeyResultRow
  people: PersonOption[]
  onPatch: (patch: KeyResultTargetsPatch) => Promise<void>
}) {
  const t = useT()
  const { state, run, retry } = useCommitStatus()
  const [open, setOpen] = useState(false)
  const name = row.owner_person_id
    ? people.find((person) => person.id === row.owner_person_id)?.full_name ?? t('catalog.notAvailable')
    : t('catalog.notSet')
  return (
    <div className="form-grid__field objective-key-results__field">
      <span className="objective-key-results__label">{t('objective.keyResults.owner')}</span>
      <div className="objective-key-results__owner">
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>{name}</Button>
        {row.owner_person_id ? (
          <Button type="button" variant="ghost" onClick={() => { void run(() => onPatch({ owner_person_id: null })) }}>
            {t('objective.keyResults.clearOwner')}
          </Button>
        ) : null}
      </div>
      {open ? (
        <PersonPicker
          people={people}
          onSelect={(id) => { void run(() => onPatch({ owner_person_id: id })) }}
          onClose={() => setOpen(false)}
        />
      ) : null}
      <SaveStatus state={state} onRetry={retry} />
    </div>
  )
}

function Progress({ row }: { row: KeyResultRow }) {
  const t = useT()
  const text = progressText(row, t)
  const percent = percentOf(row)
  if (text === null) return null
  return (
    <div className="objective-key-results__progress">
      <span data-testid="key-result-progress">{text}</span>
      {percent !== null ? (
        <div
          className="objective-key-results__track"
          role="progressbar"
          aria-label={t('objective.keyResults.percent', { percent: String(percent) })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="objective-key-results__fill" style={{ width: `${percent}%` }} />
        </div>
      ) : null}
    </div>
  )
}

function ReadOnlyFacts({ row, people }: { row: KeyResultRow; people: PersonOption[] }) {
  const t = useT()
  const owner = row.owner_person_id
    ? people.find((person) => person.id === row.owner_person_id)?.full_name ?? t('catalog.notAvailable')
    : null
  const facts = [
    row.due_date ? `${t('objective.keyResults.due')} ${formatDayMonthYear(row.due_date)}` : null,
    owner ? `${t('objective.keyResults.owner')} ${owner}` : null,
  ].filter(Boolean)
  return facts.length ? <p className="objective-key-results__facts">{facts.join(' · ')}</p> : null
}

function KeyResultItem({ row, people, canManage, canContent, onChange, onRemove }: {
  row: KeyResultRow
  people: PersonOption[]
  canManage: boolean
  canContent: boolean
  onChange: (next: KeyResultRow) => void
  onRemove: (row: KeyResultRow) => void
}) {
  const t = useT()
  const patch = async (change: KeyResultTargetsPatch) => onChange(await updateKeyResultTargets(row.id, change))
  return (
    <li className="objective-key-results__item" data-testid="key-result-row">
      {canManage ? (
        <div className="form-grid objective-key-results__grid">
          <div className="form-grid__field--full form-grid__field">
            <CommitField
              label={t('objective.keyResults.what')}
              saved={row.what}
              onCommit={async (raw) => {
                if (!raw.trim()) throw new Error('blank')
                await patch({ what: raw.trim() })
              }}
            />
          </div>
          <CommitField label={t('objective.keyResults.target')} saved={numberText(row.target_value)} inputMode="decimal"
            onCommit={async (raw) => patch({ target_value: parseNumber(raw) })} />
          <CommitField label={t('objective.keyResults.unit')} saved={row.unit ?? ''}
            onCommit={async (raw) => patch({ unit: raw.trim() || null })} />
          <DueField row={row} onPatch={patch} />
          <OwnerField row={row} people={people} onPatch={patch} />
        </div>
      ) : (
        <>
          <p className="objective-key-results__what">{row.what}</p>
          <ReadOnlyFacts row={row} people={people} />
        </>
      )}
      {canContent ? (
        <div className="form-grid objective-key-results__grid">
          <CommitField label={t('objective.keyResults.current')} saved={numberText(row.current_value)} inputMode="decimal"
            onCommit={async (raw) => onChange(await updateKeyResultCurrentValue(row.id, parseNumber(raw)))} />
        </div>
      ) : null}
      <Progress row={row} />
      {canManage ? (
        <Button type="button" variant="ghost" aria-label={`${t('objective.keyResults.remove')}: ${row.what}`} onClick={() => onRemove(row)}>
          {t('objective.keyResults.remove')}
        </Button>
      ) : null}
    </li>
  )
}

/**
 * Key results of one Objective. Admin adds/edits/removes; content writers (ops lead, the head of
 * the Objective's own unit) update only the current value; everyone else reads. Each row shows its
 * own figures — nothing is summed across rows.
 */
export function ObjectiveKeyResultsSection({ objectiveId, businessUnitId, isCompanyWide, archived, scopes }: ObjectiveKeyResultsSectionProps) {
  const t = useT()
  const [rows, setRows] = useState<KeyResultRow[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [people, setPeople] = useState<PersonOption[]>([])
  const [reload, setReload] = useState(0)
  const [newWhat, setNewWhat] = useState('')
  const [addError, setAddError] = useState(false)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<KeyResultRow | null>(null)

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
    getPeople().then((next) => { if (live) setPeople(next) }).catch(() => {})
    return () => { live = false }
  }, [])

  const replaceRow = (next: KeyResultRow) => setRows((current) => current.map((row) => (row.id === next.id ? next : row)))

  const add = async () => {
    const what = newWhat.trim()
    if (!what || adding) return
    setAdding(true)
    setAddError(false)
    try {
      const created = await createKeyResult(objectiveId, what)
      setRows((current) => [...current, created])
      setNewWhat('')
    } catch {
      setAddError(true)
    } finally {
      setAdding(false)
    }
  }

  const note = !canManage && !canContent
    ? t('objective.keyResults.readOnly')
    : !canManage ? t('objective.keyResults.currentOnly') : null

  return (
    <section className="objective-key-results" aria-labelledby={`kr-title-${objectiveId}`}>
      <h3 id={`kr-title-${objectiveId}`}>{t('objective.keyResults.title')}</h3>
      {note ? <p className="record-viewer__permission-note" role="note">{note}</p> : null}
      {status === 'loading' ? <LoadingShell label={t('catalog.record.loading')} count={1} /> : null}
      {status === 'error' ? <ErrorState message={t('objective.keyResults.loadError')} onRetry={() => setReload((n) => n + 1)} /> : null}
      {status === 'ready' ? (
        rows.length > 0 ? (
          <ul className="objective-key-results__list">
            {rows.map((row) => (
              <KeyResultItem
                key={row.id}
                row={row}
                people={people}
                canManage={canManage}
                canContent={canContent}
                onChange={replaceRow}
                onRemove={setRemoving}
              />
            ))}
          </ul>
        ) : <p className="catalog-record-document__muted">{t('objective.keyResults.empty')}</p>
      ) : null}
      {canManage && status === 'ready' ? (
        <form
          className="objective-key-results__add"
          onSubmit={(event) => { event.preventDefault(); void add() }}
        >
          <TextInput
            label={t('objective.keyResults.newWhat')}
            value={newWhat}
            error={addError}
            fullWidth
            onChange={(event) => setNewWhat(event.target.value)}
          />
          <Button type="submit" variant="primary" disabled={adding || !newWhat.trim()}>{t('objective.keyResults.add')}</Button>
          {addError ? <span role="alert">{t('record.field.saveError')}</span> : null}
        </form>
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
        }}
        onCancel={() => setRemoving(null)}
      />
    </section>
  )
}
