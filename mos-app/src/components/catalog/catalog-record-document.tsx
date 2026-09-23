import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useHref } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ModalShell } from '@/components/ui/modal-shell'
import { TextInput } from '@/components/ui/text-input'
import { RecordFieldList, RecordViewer } from '@/components/records/record-viewer'
import type {
  RecordAction,
  RecordFieldSpec,
  RecordViewerAdapter,
  RecordViewerTab,
  RecordValue,
} from '@/components/records/record-viewer.types'
import type { OverlayLeaveDecision, OverlayLeaveGuard, OverlayLeaveIntent } from '@/shell/overlay-navigation'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { updateObjective } from '@/lib/db/objectives'
import { updateWorkLine } from '@/lib/db/work-lines'
import type { ProcessRecordData } from '@/lib/db/work-records'
import { ProcessOccurrenceControls } from '@/components/processes/process-occurrence-controls'
import {
  objectivesCatalogActions,
  projectsProcessesCatalogActions,
  type CatalogCollectionContext,
  type CatalogRelationGroup,
  type CatalogRow,
} from './catalog-collection-adapter'
import { loadCatalogRecordData, loadCatalogRecordEditDirectory, type CatalogRecordEditDirectory } from './catalog-record-loader'
import './catalog-record-document.css'
import { allowedBusinessUnitIds, canManageForScope, useWorkWriteAuthority } from './use-work-write-authority'

export type CatalogRecordKind = 'work-line' | 'objective'
export type CatalogRelatedKind = CatalogRecordKind | 'task'

export interface CatalogRecordDocumentProps {
  kind: CatalogRecordKind
  id: string
  mode: 'panel' | 'page'
  onOpenRelated?: (kind: CatalogRelatedKind, id: string) => void
  onOpenPage?: () => void
  onCreateTask?: () => void
  onTitleResolved?: (title: string) => void
  onChanged?: () => void
  onLeaveGuardChange?: (guard: OverlayLeaveGuard | undefined) => void
}

type CatalogRecordState = {
  row: CatalogRow
  context: CatalogCollectionContext
  process: ProcessRecordData | null
  peopleById: ReadonlyMap<string, string>
  roleNamesById: ReadonlyMap<string, string>
  owningTeams: ReadonlyMap<string, string | null>
}

function cadenceLabel(kind: string, t: ReturnType<typeof useT>): string {
  const labels = {
    manual: t('catalog.record.cadence.manual'),
    daily: t('catalog.record.cadence.daily'),
    weekly: t('catalog.record.cadence.weekly'),
    monthly: t('catalog.record.cadence.monthly'),
  }
  return kind in labels ? labels[kind as keyof typeof labels] : kind
}

function statusLabel(status: string, t: ReturnType<typeof useT>): string {
  const keys: Record<string, 'open' | 'inProgress' | 'blocked' | 'done'> = {
    Open: 'open',
    'In Progress': 'inProgress',
    Blocked: 'blocked',
    Done: 'done',
  }
  const key = keys[status]
  return key ? t(`tasks.status.${key}`) : status
}

function relatedPath(kind: CatalogRelatedKind, id: string): string {
  if (kind === 'task') return `/work/tasks/${id}`
  if (kind === 'objective') return `/work/objectives/${id}`
  return `/work/projects/${id}`
}

function RelatedLink({
  kind,
  id,
  children,
  onOpenRelated,
}: {
  kind: CatalogRelatedKind
  id: string
  children: string
  onOpenRelated?: (kind: CatalogRelatedKind, id: string) => void
}) {
  return (
    <Link
      className="catalog-record-document__related-link"
      to={relatedPath(kind, id)}
      onClick={(event) => {
        if (!onOpenRelated || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        onOpenRelated(kind, id)
      }}
    >
      {children}
    </Link>
  )
}

function recordTypeLabel(row: CatalogRow, t: ReturnType<typeof useT>): string {
  if (!row.type) return t('catalog.record.objective')
  return t(row.type === 'project' ? 'catalog.tag.project' : 'catalog.tag.process')
}

function directoryName(
  id: string | null | undefined,
  names: ReadonlyMap<string, string> | undefined,
  t: ReturnType<typeof useT>,
): string {
  if (!id) return t('catalog.notSet')
  return names?.get(id) ?? t('catalog.notAvailable')
}

function processOwner(
  personId: string | null,
  roleId: string | null,
  people: ReadonlyMap<string, string>,
  roles: ReadonlyMap<string, string>,
  t: ReturnType<typeof useT>,
): string {
  const person = directoryName(personId, people, t)
  const role = roleId ? roles.get(roleId) ?? t('catalog.notAvailable') : ''
  if (person === t('catalog.notSet') && !role) return person
  if (person === t('catalog.notSet')) return role
  if (!role || role === t('catalog.notAvailable')) return person
  return `${person} · ${role}`
}

async function recordDataFor(
  kind: CatalogRecordKind,
  id: string,
  viewerId: string | null,
): Promise<CatalogRecordState | null> {
  return loadCatalogRecordData(kind, id, viewerId)
}

type CatalogTask = CatalogRecordState['context']['relationsById'] extends ReadonlyMap<string, infer R>
  ? R extends { tasks: readonly (infer T)[] } ? T : never
  : never

function taskSlot(
  tasks: readonly CatalogTask[],
  kind: CatalogRecordKind,
  id: string,
  onOpenRelated: CatalogRecordDocumentProps['onOpenRelated'],
  onCreateTask: CatalogRecordDocumentProps['onCreateTask'],
  t: ReturnType<typeof useT>,
) {
  return (
    <div className="catalog-record-document__task-slot">
      {tasks.length > 0 ? (
        <ul className="catalog-record-document__task-list">
          {tasks.map((task) => (
            <li key={task.id}>
              <RelatedLink kind="task" id={task.id} onOpenRelated={onOpenRelated}>{task.title}</RelatedLink>
              {task.status ? <span className="catalog-record-document__task-status">{statusLabel(task.status, t)}</span> : null}
            </li>
          ))}
        </ul>
      ) : <p className="catalog-record-document__muted">{t('catalog.record.noTasks')}</p>}
      {kind === 'work-line' ? (
        onCreateTask ? (
          <Button type="button" variant="outline" onClick={onCreateTask}>{t('catalog.record.createTask')}</Button>
        ) : (
          <Link className="btn btn-outline" to={`/work/tasks?create=1&work_line=${encodeURIComponent(id)}`}>
            {t('catalog.record.createTask')}
          </Link>
        )
      ) : null}
    </div>
  )
}

function linkedWorkSlot(
  groups: readonly CatalogRelationGroup[],
  tasks: readonly CatalogTask[],
  kind: CatalogRecordKind,
  id: string,
  progress: { done: number; total: number },
  onOpenRelated: CatalogRecordDocumentProps['onOpenRelated'],
  onCreateTask: CatalogRecordDocumentProps['onCreateTask'],
  t: ReturnType<typeof useT>,
) {
  const linkable = groups.filter((group) => group.entity === 'work-line' || group.entity === 'objective')
  return (
    <div className="catalog-record-document__work-slot">
      <p className="catalog-record-document__progress" data-testid="catalog-record-progress">
        {t('catalog.record.progress', { done: String(progress.done), total: String(progress.total) })}
      </p>
      <h3>{t('catalog.record.linkedWork')}</h3>
      {linkable.length > 0 ? (
        <ul className="catalog-record-document__related-list" data-testid="catalog-record-links">
          {linkable.map((group, index) => {
            const relationship = group.relationship === 'contribution'
              ? t(kind === 'work-line' ? 'catalog.relations.contributesTo' : 'catalog.relations.viaTask', { name: group.name })
              : group.name
            const targetKind = group.entity === 'objective' ? 'objective' : 'work-line'
            const label = group.synthetic ? group.name : relationship
            return (
              <li key={`${group.relationship ?? 'related'}:${group.id}:${index}`}>
                {group.synthetic ? <span>{label}</span> : (
                  <RelatedLink kind={targetKind} id={group.id} onOpenRelated={onOpenRelated}>{label}</RelatedLink>
                )}
                <span className="catalog-record-document__task-status">
                  {t('catalog.relations.progress', { done: String(group.done), total: String(group.total) })}
                </span>
              </li>
            )
          })}
        </ul>
      ) : <p className="catalog-record-document__muted">{t(kind === 'work-line' ? 'catalog.record.noRelatedObjective' : 'catalog.record.noRelatedWork')}</p>}
      <h3>{t('catalog.record.tasks')}</h3>
      {taskSlot(tasks, kind, id, onOpenRelated, onCreateTask, t)}
    </div>
  )
}

export function CatalogRecordDocument({
  kind,
  id,
  mode,
  onOpenRelated,
  onOpenPage,
  onCreateTask,
  onTitleResolved,
  onChanged,
  onLeaveGuardChange,
}: CatalogRecordDocumentProps) {
  const t = useT()
  const canonicalHref = useHref(relatedPath(kind, id))
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const { scopes } = useWorkWriteAuthority()
  const canRead = auth.status === 'authenticated'
  const [state, setState] = useState<CatalogRecordState | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'not-found'>('loading')
  const [mutationError, setMutationError] = useState('')
  const [busy, setBusy] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [reloadNonce, setReloadNonce] = useState(0)
  const [editDirectory, setEditDirectory] = useState<CatalogRecordEditDirectory | null>(null)
  const [editDirectoryError, setEditDirectoryError] = useState(false)
  const [editDirectoryRetry, setEditDirectoryRetry] = useState(0)
  const [fieldDirty, setFieldDirty] = useState(false)
  const [pendingLeave, setPendingLeave] = useState<OverlayLeaveIntent | null>(null)
  const resolverRef = useRef<((decision: OverlayLeaveDecision) => void) | null>(null)
  const canManage = state
    ? canManageForScope(kind, state.row.businessUnitId, scopes)
    : false

  useEffect(() => {
    let live = true
    setStatus('loading')
    setState(null)
    if (!canRead) return () => { live = false }
    void recordDataFor(kind, id, viewerId)
      .then((next) => {
        if (!live) return
        if (!next) {
          setStatus('not-found')
          return
        }
        setState(next)
        setStatus('ready')
        onTitleResolved?.(next.row.name)
      })
      .catch(() => {
        if (live) setStatus('error')
      })
    return () => { live = false }
  }, [id, kind, onTitleResolved, viewerId, reloadNonce, canRead])

  useEffect(() => {
    setEditDirectory(null)
    setEditDirectoryError(false)
    if (!canRead || !canManage || !state) return
    let live = true
    void loadCatalogRecordEditDirectory(kind)
      .then((directory) => {
        if (live) setEditDirectory(directory)
      })
      .catch(() => { if (live) setEditDirectoryError(true) })
    return () => { live = false }
  }, [canManage, canRead, id, kind, state, editDirectoryRetry])

  const dirtyRef = useRef(false)
  dirtyRef.current = fieldDirty
  const leaveGuard = useCallback<OverlayLeaveGuard>(async (intent) => (
    new Promise<OverlayLeaveDecision>((resolve) => {
      resolverRef.current = resolve
      setPendingLeave(intent)
    })
  ), [])

  useEffect(() => {
    onLeaveGuardChange?.(dirtyRef.current ? leaveGuard : undefined)
    return () => onLeaveGuardChange?.(undefined)
  }, [fieldDirty, leaveGuard, onLeaveGuardChange])

  const renameRecord = useCallback(async (value: RecordValue) => {
    const name = String(value ?? '').trim()
    if (!name) throw new Error(t('catalog.nameRequired'))
    setBusy(true)
    setMutationError('')
    try {
      if (kind === 'objective') await objectivesCatalogActions.rename(id, name)
      else await projectsProcessesCatalogActions.rename(id, name)
      setState((current) => current ? { ...current, row: { ...current.row, name } } : current)
      onChanged?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : t('catalog.saveFailed')
      setMutationError(message)
      throw error
    } finally {
      setBusy(false)
    }
  }, [id, kind, onChanged, t])

  const commitProperty = useCallback(async (key: string, value: RecordValue) => {
    if (!canManage || state?.row.archived_at) throw new Error(t('catalog.record.readOnly'))
    if (key === 'name') return renameRecord(value)
    const text = value == null || value === '' ? null : String(value)
    const common = { businessUnit: 'business_unit_id', accountable: 'accountable_person_id' } as const
    setMutationError('')
    try {
      if (key in common) {
        const column = common[key as keyof typeof common]
        if (kind === 'objective') await updateObjective(id, { [column]: text })
        else await updateWorkLine(id, { [column]: text })
      } else if (kind === 'objective' && key === 'period') {
        if (text !== null && !/^\d{4}$/.test(text)) throw new Error(t('catalog.record.periodInvalid'))
        await updateObjective(id, { period_year: text === null ? null : Number(text) })
      } else if (kind === 'work-line' && key === 'objective') {
        await updateWorkLine(id, { objective_id: text })
      } else if (kind === 'work-line' && key === 'responsible') {
        await updateWorkLine(id, { responsible_person_id: text })
      } else throw new Error(t('catalog.saveFailed'))
      const refreshed = await recordDataFor(kind, id, viewerId)
      if (refreshed) setState(refreshed)
      onChanged?.()
    } catch (error) {
      setMutationError(t('catalog.saveFailed'))
      throw error
    }
  }, [canManage, id, kind, onChanged, renameRecord, state?.row.archived_at, t, viewerId])

  const setArchived = useCallback(async (archived: boolean) => {
    if (!canManage) throw new Error(t('catalog.record.readOnly'))
    setBusy(true)
    setMutationError('')
    try {
      if (kind === 'objective') await objectivesCatalogActions.setArchived(id, archived)
      else await projectsProcessesCatalogActions.setArchived(id, archived)
      setState((current) => current ? {
        ...current,
        row: { ...current.row, archived_at: archived ? new Date().toISOString() : null },
      } : current)
      onChanged?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : t('catalog.saveFailed')
      setMutationError(message)
      throw error
    } finally {
      setBusy(false)
    }
  }, [canManage, id, kind, onChanged, t])

  const adapter = useMemo<RecordViewerAdapter | null>(() => {
    if (!state) return null
    const { row, context, process, peopleById, roleNamesById, owningTeams } = state
    const businessUnitsById = new Map(context.businessUnitsById ?? [])
    const allPeopleById = new Map(peopleById)
    for (const [personId, name] of editDirectory?.peopleById ?? []) allPeopleById.set(personId, name)
    for (const [businessUnitId, name] of editDirectory?.businessUnitsById ?? []) businessUnitsById.set(businessUnitId, name)
    const objectiveOptionsById = new Map((context.objectiveOptions ?? []).map((option) => [option.value, option.label] as const))
    for (const option of editDirectory?.objectiveOptions ?? []) objectiveOptionsById.set(option.value, option.label)
    const objectiveOptions = [...objectiveOptionsById].map(([value, label]) => ({ value, label }))
    const allowedBuIds = allowedBusinessUnitIds(kind, scopes)
    const businessUnitOptions = [...businessUnitsById]
      .filter(([value]) => allowedBuIds === null || allowedBuIds.includes(value))
      .map(([value, label]) => ({ value, label }))
    const emptyOption = { value: '', label: t('catalog.notSet') }
    const businessUnitEditOptions = allowedBuIds === null
      ? [emptyOption, ...businessUnitOptions]
      : businessUnitOptions
    const allRelationGroups = context.relationsById.get(id)?.groups ?? []
    const relationGroups = allRelationGroups.filter((group) => !group.synthetic)
    const parentRelation = relationGroups.find((group) => group.relationship === 'direct' && group.entity === 'objective')
    const relation = kind === 'work-line' ? parentRelation : relationGroups[0]
    const relationTasks = context.relationsById.get(id)?.tasks ?? []
    const fields: RecordFieldSpec[] = kind === 'objective'
      ? [
          { key: 'businessUnit', label: t('catalog.record.businessUnit'), control: 'relation', value: row.businessUnitId ?? null, displayValue: directoryName(row.businessUnitId, businessUnitsById, t), editable: false },
          { key: 'accountable', label: t('catalog.record.accountable'), control: 'person', value: row.accountablePersonId ?? null, displayValue: directoryName(row.accountablePersonId, allPeopleById, t), editable: false },
          { key: 'period', label: t('catalog.record.period'), control: 'text', value: row.periodYear ?? null, displayValue: row.periodYear == null ? t('catalog.notSet') : String(row.periodYear), editable: false },
        ]
      : [
          {
            key: 'objective',
            label: t('catalog.record.objective'),
            control: 'relation',
            value: row.objectiveId ?? null,
            displayValue: relation?.name ?? t('catalog.notSet'),
            editable: false,
          },
          { key: 'businessUnit', label: t('catalog.record.businessUnit'), control: 'relation', value: row.businessUnitId ?? null, displayValue: directoryName(row.businessUnitId, businessUnitsById, t), editable: false },
          { key: 'accountable', label: t('catalog.record.accountable'), control: 'person', value: row.accountablePersonId ?? null, displayValue: directoryName(row.accountablePersonId, allPeopleById, t), editable: false },
          { key: 'responsible', label: t('catalog.record.responsible'), control: 'person', value: row.responsiblePersonId ?? null, displayValue: directoryName(row.responsiblePersonId, allPeopleById, t), editable: false },
          ...(row.type === 'process' ? [{ key: 'owningTeam', label: t('catalog.record.owningTeam'), control: 'text' as const, value: null, displayValue: t('catalog.record.teamPerOccurrence'), editable: false } satisfies RecordFieldSpec, { key: 'cadence', label: t('catalog.record.cadence'), control: 'text' as const, value: process?.cadence?.cadence_kind ?? null, displayValue: process?.cadence ? cadenceLabel(process.cadence.cadence_kind, t) : t('catalog.notSet'), editable: false } satisfies RecordFieldSpec] : []),
        ]

    for (const field of fields) {
      if (field.key === 'cadence' || field.key === 'owningTeam') continue
      field.editable = canManage && row.archived_at === null && (field.key === 'period' || editDirectory !== null)
      if (canManage && field.key !== 'period' && !editDirectory) field.readOnlyReason = t(editDirectoryError ? 'catalog.record.editChoicesError' : 'catalog.record.editChoicesLoading')
      if (field.key === 'businessUnit') field.options = businessUnitEditOptions
      if (field.key === 'accountable' || field.key === 'responsible') field.options = [emptyOption, ...[...allPeopleById].map(([value, label]) => ({ value, label }))]
      if (field.key === 'objective') field.options = [emptyOption, ...objectiveOptions]
      }

    const tabs: RecordViewerTab[] = [
      { id: 'work', label: t('catalog.record.tabs.work') },
      { id: 'facts', label: t('catalog.record.tabs.details') },
      ...(row.type === 'process' ? [{ id: 'steps', label: t('catalog.record.tabs.steps') }] : []),
    ]

    const actions: RecordAction[] = canManage ? [{
      id: 'rename',
      label: t('catalog.rename'),
      intent: 'secondary',
      disabled: busy || row.archived_at !== null,
      run: () => { setRenameDraft(row.name); setRenameOpen(true) },
    }, {
      id: 'archive',
      label: row.archived_at ? t('catalog.unarchive') : t('catalog.archive'),
      intent: row.archived_at ? 'secondary' : 'danger',
      disabled: busy,
      run: () => setArchived(!row.archived_at),
    }] : []

    return {
      kind,
      id,
      title: row.name,
      typeLabel: recordTypeLabel(row, t),
      tabs,
      metadata: [],
      relations: [],
      contentSlots: [
        ...(kind === 'objective' || row.type === 'project' ? [{
          id: 'work',
          label: t('catalog.record.tabs.work'),
          render: () => linkedWorkSlot(
            allRelationGroups, relationTasks, kind, id,
            context.progressById.get(id) ?? { done: 0, total: 0 }, onOpenRelated, onCreateTask, t,
          ),
        }] : []),
        ...(row.type === 'process' ? [{
          id: 'work',
          label: t('catalog.record.currentNextAction'),
          render: () => <ProcessOccurrenceControls workLineId={id} setupIncomplete={!process?.steps.length} canManageSetup={canManage} onChanged={() => { setReloadNonce((nonce) => nonce + 1); onChanged?.() }} />,
        }, {
          id: 'steps',
          label: t('catalog.record.steps'),
          render: () => (
            <div className="catalog-record-document__steps-slot">
              {process?.steps.length ? (
                <ol className="catalog-record-document__steps">
                  {process.steps.map((step) => {
                    const checklistItems = Array.isArray((step as { checklist_items?: unknown }).checklist_items)
                      ? (step as { checklist_items: unknown[] }).checklist_items.filter((item): item is string => typeof item === 'string')
                      : []
                    return (
                      <li key={step.id}>
                        <span className="catalog-record-document__step-title">{step.title}</span>
                        {step.description ? <span className="catalog-record-document__step-copy">{step.description}</span> : null}
                        <dl className="catalog-record-document__step-meta">
                          <div><dt>{t('tasks.pic')}</dt><dd>{processOwner(step.pic_person_id, step.pic_role_id, peopleById, roleNamesById, t)}</dd></div>
                          <div><dt>{t('catalog.record.picTeam')}</dt><dd>{owningTeams.get(`${step.id}:pic`) ?? t('catalog.notSet')}</dd></div>
                          <div><dt>{t('tasks.supervisor')}</dt><dd>{processOwner(step.supervisor_person_id, step.supervisor_role_id, peopleById, roleNamesById, t)}</dd></div>
                          <div><dt>{t('catalog.record.supervisorTeam')}</dt><dd>{owningTeams.get(`${step.id}:supervisor`) ?? t('catalog.notSet')}</dd></div>
                          <div><dt>{t('catalog.record.due')}</dt><dd>{t('catalog.record.dueOffset', { count: String(step.due_offset_days) })}</dd></div>
                        </dl>
                        {checklistItems.length > 0 ? <ul className="catalog-record-document__checklist">{checklistItems.map((item) => <li key={item}>{item}</li>)}</ul> : null}
                      </li>
                    )
                  })}
                </ol>
              ) : <p className="catalog-record-document__muted">{t('catalog.record.noSteps')}</p>}
            </div>
          ),
        }] : []),
        {
          id: 'facts',
          label: t('catalog.record.details'),
          section: { id: 'facts', label: t('catalog.record.details'), fields },
          render: (slotContext) => (
            <>
              {!canManage ? <p className="record-viewer__permission-note" role="note">{t('catalog.record.readOnly')}</p> : null}
              <RecordFieldList
                section={{ id: 'facts', label: t('catalog.record.details'), fields }}
                onCommitField={slotContext.onCommitField}
                onDirtyChange={slotContext.onDirtyChange}
                fieldCommitsFrozen={slotContext.fieldCommitsFrozen}
                headingLevel={slotContext.headingLevel}
              />
            </>
          ),
        },
      ],
      activity: [],
      actions,
      headerOverflowActionIds: canManage ? ['rename', 'archive'] : [],
      permission: {
        readOnly: !canManage,
        reason: canManage ? undefined : t('catalog.record.readOnly'),
        allowedActionIds: actions.map((action) => action.id),
      },
      state: 'ready',
    } satisfies RecordViewerAdapter
  }, [busy, canManage, editDirectory, editDirectoryError, id, kind, onChanged, onCreateTask, onOpenRelated, scopes, setArchived, state, t])

  const discardAndLeave = useCallback(async () => {
    resolverRef.current?.({ decision: 'allow' })
    resolverRef.current = null
    setPendingLeave(null)
    setFieldDirty(false)
  }, [])
  const retainDraft = useCallback(() => {
    resolverRef.current?.({ decision: 'deny' })
    resolverRef.current = null
    setPendingLeave(null)
  }, [])

  if (!canRead) return <EmptyState variant="blank" title={t('catalog.record.accessDeniedTitle')} copy={t('catalog.record.accessDeniedBody')} headingLevel={2} />
  if (status === 'loading') return <LoadingShell label={t('catalog.record.loading')} />
  if (status === 'error') return <ErrorState message={t('catalog.record.error')} onRetry={() => setReloadNonce((nonce) => nonce + 1)} />
  if (status === 'not-found' || !state || !adapter) return <EmptyState variant="blank" title={t('catalog.record.notFound')} />

  return (
    <>
      {mode === 'page' ? <RouteLeaveGuard when={fieldDirty} message={t('catalog.record.unsaved.copy')} /> : null}
      {mutationError ? <p className="catalog-record-document__error" role="alert">{mutationError}</p> : null}
      {editDirectoryError ? <ErrorState message={t('catalog.record.editChoicesError')} onRetry={() => setEditDirectoryRetry((value) => value + 1)} /> : null}
      {state.row.archived_at ? <p className="catalog-record-document__archived" role="status">{t('catalog.record.archived')}</p> : null}
      <RecordViewer
        adapter={adapter}
        mode={mode}
        canonicalHref={canonicalHref}
        headingLevel={mode === 'page' ? 1 : 2}
        onOpenPage={onOpenPage}
        onOpenRelated={onOpenRelated ? (relation) => onOpenRelated(relation.kind as CatalogRelatedKind, relation.id) : undefined}
        onDirtyChange={setFieldDirty}
        onCommitField={commitProperty}
        onRetry={() => setReloadNonce((nonce) => nonce + 1)}
        fieldCommitsFrozen={pendingLeave !== null}
      />
      <ConfirmDialog
        open={pendingLeave !== null}
        title={t('catalog.record.unsaved.title')}
        body={t('catalog.record.unsaved.copy')}
        confirmLabel={t('catalog.record.unsaved.discard')}
        tone="destructive"
        onConfirm={discardAndLeave}
        onCancel={retainDraft}
      />
      <ModalShell open={renameOpen} onClose={() => setRenameOpen(false)} ariaLabelledBy="catalog-record-rename-title">
        <form
          className="catalog-record-document__rename"
          onSubmit={(event) => {
            event.preventDefault()
            void renameRecord(renameDraft).then(() => setRenameOpen(false)).catch(() => {})
          }}
        >
          <h2 id="catalog-record-rename-title">{t('catalog.rename')}</h2>
          <TextInput label={t('catalog.nameLabel')} value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} autoFocus fullWidth />
          <div className="catalog-record-document__rename-actions">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setRenameOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="primary" disabled={busy || !renameDraft.trim()}>{busy ? t('record.field.saving') : t('catalog.rename')}</Button>
          </div>
        </form>
      </ModalShell>
    </>
  )
}
