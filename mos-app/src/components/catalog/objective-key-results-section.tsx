import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { RecordSection } from '@/components/record/record-page-layout'
import { getPeople, type PersonOption } from '@/lib/db/directory'
import type { WorkWriteScopes } from '@/lib/db/work-authority'
import {
  createKeyResult,
  deleteKeyResult,
  listKeyResults,
  updateKeyResultTargets,
  type KeyResultRow,
  type KeyResultTargetsPatch,
} from '@/lib/db/objective-key-results'
import './objective-key-results-section.css'
import { KeyResultForm } from './objective-key-result-form'
import { KeyResultRowView } from './objective-key-result-row'
import { parseNumber, valuesOf, type FormValues } from './objective-key-result-values'
import { canEditObjectiveContentForScope, canManageForScope } from './use-work-write-authority'

export type ObjectiveKeyResultsSectionProps = {
  objectiveId: string
  businessUnitId?: string | null
  isCompanyWide?: boolean
  archived: boolean
  scopes: WorkWriteScopes
  /** Where the viewer's write-scope lookup stands; a person who may edit is never shown read-only copy while it is unknown. */
  scopesStatus?: 'loading' | 'ready' | 'error'
  onRetryScopes?: () => void
}

/**
 * Key results of one Objective. Admin adds/edits/removes; content writers (ops lead, the head of
 * the Objective's own unit) update only the current value; everyone else reads. Each row shows its
 * own figures — nothing is summed across rows.
 */
export function ObjectiveKeyResultsSection({
  objectiveId, businessUnitId, isCompanyWide, archived, scopes, scopesStatus = 'ready', onRetryScopes,
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
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-record-section="key-results"] .rp-section__action')?.focus()
    })
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

  // Closing the blank row (saved or cancelled) hands focus to the section's Add action.
  useEffect(() => {
    if (wasAdding.current && !adding) focusAction()
    wasAdding.current = adding
  }, [adding, focusAction])

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
      {status === 'ready' && rows.length === 0 && !adding ? (
        <p className="objective-key-results__empty">{t('objective.keyResults.empty')}</p>
      ) : null}
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
