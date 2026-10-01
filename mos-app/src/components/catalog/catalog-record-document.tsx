// An Objective or a Project/Process as one record page (panel and full page). The shared record
// components (components/record) own the anatomy; this file adapts a catalog record to them:
// which facts the header carries, what is still missing, who may act, and which sections follow.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useHref, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { saveErrorMessage } from '@/lib/save-error'
import { EmptyState, ErrorState } from '@/components/ui/state-kit'
import { Button } from '@/components/ui/button'
import type { PickerOption } from '@/components/ui/picker'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RecordField } from '@/components/records/record-field'
import type { RecordFieldSpec, RecordValue } from '@/components/records/record-viewer.types'
import { RecordPageHeader, type RecordFact, type RecordPrimaryAction } from '@/components/record/record-page-header'
import { RecordAbout, RecordGetStarted, RecordPageLayout, RecordPageSkeleton, RecordSection, type RecordSetupItem } from '@/components/record/record-page-layout'
import type { RecordMenuItem } from '@/components/record/record-menu'
import { useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import type { OverlayLeaveDecision, OverlayLeaveGuard, OverlayLeaveIntent } from '@/shell/overlay-navigation'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { listObjectivesAll, updateObjective } from '@/lib/db/objectives'
import { listWorkLinesAll, updateWorkLine } from '@/lib/db/work-lines'
import { wibToday } from '@/lib/db/cafe-opening'
import { ProcessOccurrenceControls } from '@/components/processes/process-occurrence-controls'
import { useProcessOccurrences } from '@/components/processes/use-process-occurrences'
import { COMPANY_WIDE_OPTION, objectivesCatalogActions, projectsProcessesCatalogActions } from './catalog-collection-adapter'
import { loadCatalogRecordData, loadCatalogRecordEditDirectory, type CatalogRecordData, type CatalogRecordEditDirectory, type CatalogWorkLineFact } from './catalog-record-loader'
import './catalog-record-document.css'
import { ObjectiveKeyResultsSection } from './objective-key-results-section'
import { RecordHistory } from './record-history'
import { withLinkedWorkLine, withoutLinkedWorkLine } from './catalog-record-optimistic'
import {
  InlineChooser, LinkedWorkSection, StepsSection, TasksSection, WriteUpSection,
  type CatalogRelatedKind,
} from './catalog-record-sections'
import {
  canCreateForScope, canEditObjectiveContentForScope, canManageForScope, useWorkWriteAuthority,
} from './use-work-write-authority'

export type CatalogRecordKind = 'work-line' | 'objective'
export type { CatalogRelatedKind }

export type CatalogRecordDocumentProps = {
  kind: CatalogRecordKind
  id: string
  mode: 'panel' | 'page'
  onOpenRelated?: (kind: CatalogRelatedKind, id: string) => void
  onOpenPage?: () => void
  /** Opens task creation for one Project/Process. */
  onCreateTask?: (workLineId: string) => void
  /** Raised by the create frame that just popped back to this record; read once for the "Task added" notice. */
  taskAddedRef?: { current: boolean }
  onTitleResolved?: (title: string) => void
  onChanged?: () => void
  onLeaveGuardChange?: (guard: OverlayLeaveGuard | undefined) => void
}

const STEPS_ADD_CONTROL = '[data-record-section="steps"] .rp-section__action, [data-record-section="steps"] .catalog-step-add'

type Notice = { message: string; undo?: () => Promise<void> }
type Chooser =
  | { purpose: 'link'; status: 'loading' | 'error' | 'empty' | 'ready'; options: PickerOption[]; objectiveOf: Map<string, string | null>; names: Map<string, string>; facts: Map<string, CatalogWorkLineFact> }
  | { purpose: 'task'; options: PickerOption[] }

function cadenceLabel(kind: string, t: ReturnType<typeof useT>): string {
  const labels = {
    manual: t('catalog.record.cadence.manual'),
    daily: t('catalog.record.cadence.daily'),
    weekly: t('catalog.record.cadence.weekly'),
    monthly: t('catalog.record.cadence.monthly'),
  }
  return kind in labels ? labels[kind as keyof typeof labels] : kind
}

function periodQuarterLabel(quarter: number | null | undefined, t: ReturnType<typeof useT>): string {
  if (quarter === 1) return t('catalog.period.q1')
  if (quarter === 2) return t('catalog.period.q2')
  if (quarter === 3) return t('catalog.period.q3')
  if (quarter === 4) return t('catalog.period.q4')
  return t('catalog.period.wholeYear')
}

export function CatalogRecordDocument({
  kind,
  id,
  mode,
  onOpenRelated,
  onOpenPage,
  onCreateTask,
  taskAddedRef,
  onTitleResolved,
  onChanged,
  onLeaveGuardChange,
}: CatalogRecordDocumentProps) {
  const t = useT()
  const navigate = useNavigate()
  const canonicalHref = useHref(kind === 'objective' ? `/work/objectives/${id}` : `/work/projects/${id}`)
  const auth = useAuth()
  const { runtime, openPanel } = useAgentRuntime()
  const isDesktop = useIsDesktop()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const { scopes, loading: scopesLoading, error: scopesError, retry: retryScopes } = useWorkWriteAuthority()
  const canRead = auth.status === 'authenticated'
  const [state, setState] = useState<CatalogRecordData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'not-found'>('loading')
  const [mutationError, setMutationError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  // Bumped after every successful write so History re-reads the row the trigger just added.
  const [historyVersion, setHistoryVersion] = useState(0)
  const [editDirectory, setEditDirectory] = useState<CatalogRecordEditDirectory | null>(null)
  const [editDirectoryError, setEditDirectoryError] = useState(false)
  const [editDirectoryRetry, setEditDirectoryRetry] = useState(0)
  const [fieldDirty, setFieldDirty] = useState(false)
  const [pendingLeave, setPendingLeave] = useState<OverlayLeaveIntent | null>(null)
  const [krCount, setKrCount] = useState<number | null>(null)
  const [addKeyResultToken, setAddKeyResultToken] = useState(0)
  const [addingStep, setAddingStep] = useState(false)
  const [chooser, setChooser] = useState<Chooser | null>(null)
  const [moving, setMoving] = useState<{ id: string; name: string; from: string; fact?: CatalogWorkLineFact } | null>(null)
  const [linkError, setLinkError] = useState<(() => Promise<void>) | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const resolverRef = useRef<((decision: OverlayLeaveDecision) => void) | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // The control that opened a chooser or form, so withdrawing it puts focus back where the person was.
  const openerRef = useRef<HTMLElement | null>(null)
  const canManage = state ? canManageForScope(kind, state.row.businessUnitId, scopes) : false

  useEffect(() => {
    let live = true
    setStatus('loading')
    setState(null)
    if (!canRead) return () => { live = false }
    void loadCatalogRecordData(kind, id, viewerId)
      .then((next) => {
        if (!live) return
        if (!next) { setStatus('not-found'); return }
        setState(next)
        setStatus('ready')
        onTitleResolved?.(next.row.name)
      })
      .catch(() => { if (live) setStatus('error') })
    return () => { live = false }
  }, [id, kind, onTitleResolved, viewerId, reloadNonce, canRead])

  // The choices load once per record: a save refreshes `state` but must not blank them, or the
  // field a keyboard user just edited is unmounted and focus falls to the page.
  const hasState = state !== null
  useEffect(() => {
    setEditDirectory(null)
    setEditDirectoryError(false)
    if (!canRead || !canManage || !hasState) return
    let live = true
    void loadCatalogRecordEditDirectory(kind)
      .then((directory) => { if (live) setEditDirectory(directory) })
      .catch(() => { if (live) setEditDirectoryError(true) })
    return () => { live = false }
  }, [canManage, canRead, id, kind, hasState, editDirectoryRetry])

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

  useEffect(() => () => clearTimeout(noticeTimer.current), [])
  const announce = useCallback((next: Notice | null) => {
    clearTimeout(noticeTimer.current)
    setNotice(next)
    if (next) noticeTimer.current = setTimeout(() => setNotice(null), 10_000)
  }, [])
  useEffect(() => {
    if (!taskAddedRef?.current) return
    taskAddedRef.current = false
    announce({ message: t('catalog.record.taskAdded') })
  }, [announce, t, taskAddedRef])

  /** Re-read the record without blanking the page (a link, an unlink, a new step). */
  const refresh = useCallback(async () => {
    const next = await loadCatalogRecordData(kind, id, viewerId)
    if (next) setState(next)
    setHistoryVersion((v) => v + 1)
    onChanged?.()
  }, [id, kind, onChanged, viewerId])

  const renameRecord = useCallback(async (value: RecordValue) => {
    const name = String(value ?? '').trim()
    if (!name) throw new Error(t('catalog.nameRequired'))
    setBusy(true)
    setMutationError('')
    try {
      if (kind === 'objective') await objectivesCatalogActions.rename(id, name)
      else await projectsProcessesCatalogActions.rename(id, name)
      setState((current) => current ? { ...current, row: { ...current.row, name } } : current)
      setHistoryVersion((v) => v + 1)
      onChanged?.()
    } catch (error) {
      setMutationError(saveErrorMessage(error, t))
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
      if (kind === 'objective' && key === 'businessUnit') {
        // One of: a unit, Company-wide, or neither. Picking one clears the other.
        await updateObjective(id, text === COMPANY_WIDE_OPTION
          ? { is_company_wide: true, business_unit_id: null }
          : { business_unit_id: text, is_company_wide: false })
      } else if (key in common) {
        const column = common[key as keyof typeof common]
        if (kind === 'objective') await updateObjective(id, { [column]: text })
        else await updateWorkLine(id, { [column]: text })
      } else if (kind === 'objective' && key === 'period') {
        if (text !== null && !/^\d{4}$/.test(text)) throw new Error(t('catalog.record.periodInvalid'))
        // A quarter needs a year, so clearing the year clears the quarter in the same write.
        await updateObjective(id, text === null ? { period_year: null, period_quarter: null } : { period_year: Number(text) })
      } else if (kind === 'objective' && key === 'periodQuarter') {
        await updateObjective(id, { period_quarter: text === null ? null : Number(text) })
      } else if (kind === 'work-line' && key === 'objective') {
        await updateWorkLine(id, { objective_id: text })
      } else if (kind === 'work-line' && key === 'responsible') {
        await updateWorkLine(id, { responsible_person_id: text })
      } else throw new Error(t('catalog.saveFailed'))
      const refreshed = await loadCatalogRecordData(kind, id, viewerId)
      if (refreshed) setState(refreshed)
      setHistoryVersion((v) => v + 1)
      onChanged?.()
    } catch (error) {
      setMutationError(t('catalog.saveFailed'))
      throw error
    }
  }, [canManage, id, kind, onChanged, renameRecord, state?.row.archived_at, t, viewerId])

  const setArchived = useCallback(async (archived: boolean, name: string) => {
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
      setHistoryVersion((v) => v + 1)
      onChanged?.()
      // Archiving is reversible, so it acts at once and offers the way back.
      announce(archived ? { message: t('catalog.record.archivedNotice', { name }), undo: () => setArchived(false, name) } : null)
    } catch (error) {
      setMutationError(saveErrorMessage(error, t))
      throw error
    } finally {
      setBusy(false)
    }
  }, [announce, canManage, id, kind, onChanged, t])

  const createTask = useCallback((workLineId: string) => {
    if (onCreateTask) onCreateTask(workLineId)
    else navigate({ pathname: '/work/tasks', search: `?create=1&work_line=${encodeURIComponent(workLineId)}` })
  }, [navigate, onCreateTask])

  // The occurrence reads live here, not in the section, so the header can carry the Start primary.
  const onOccurrencesChanged = useCallback(() => { setReloadNonce((nonce) => nonce + 1); onChanged?.() }, [onChanged])
  const occurrences = useProcessOccurrences(kind === 'work-line' && state?.row.type === 'process' ? id : null, onOccurrencesChanged)

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

  // ── Derived record facts ────────────────────────────────────────────────────
  const derived = useMemo(() => {
    if (!state) return null
    const { row, context, process, peopleById, workLinesById } = state
    const archived = row.archived_at !== null
    const groups = context.relationsById.get(id)?.groups ?? []
    const relationTasks = context.relationsById.get(id)?.tasks ?? []
    const linkedWork = groups.filter((group) => !group.synthetic && group.entity === 'work-line')
    const parent = groups.find((group) => !group.synthetic && group.relationship === 'direct' && group.entity === 'objective')
    const allPeople = new Map(peopleById)
    for (const [personId, name] of editDirectory?.peopleById ?? []) allPeople.set(personId, name)
    const businessUnits = new Map(context.businessUnitsById ?? [])
    for (const [unitId, name] of editDirectory?.businessUnitsById ?? []) businessUnits.set(unitId, name)
    return { row, archived, groups, relationTasks, linkedWork, parent, allPeople, businessUnits, process, workLinesById, context }
  }, [editDirectory, id, state])

  if (!canRead) return <EmptyState variant="blank" title={t('catalog.record.accessDeniedTitle')} copy={t('catalog.record.accessDeniedBody')} headingLevel={2} />
  if (status === 'loading') return <RecordPageSkeleton label={t('catalog.record.loading')} />
  if (status === 'error') return <ErrorState message={t('catalog.record.error')} onRetry={() => setReloadNonce((nonce) => nonce + 1)} />
  if (status === 'not-found' || !state || !derived) return <EmptyState variant="blank" title={t('catalog.record.notFound')} />

  const { row, archived, linkedWork, parent, allPeople, businessUnits, process, workLinesById, context } = derived
  const isObjective = kind === 'objective'
  const isProcess = row.type === 'process'
  const canContent = isObjective && canEditObjectiveContentForScope(row, scopes)
  const canLink = isObjective && !archived && canCreateForScope('work-line', scopes)
  const isWriter = canManage || canContent || canLink
  const scopesKnown = !scopesLoading && !scopesError
  const emptyOption = { value: '', label: t('catalog.notSet') }
  const editable = (needsDirectory: boolean) => canManage && !archived && (!needsDirectory || editDirectory !== null)
  const readOnlyReason = (needsDirectory: boolean) => (canManage && needsDirectory && !editDirectory
    ? t(editDirectoryError ? 'catalog.record.editChoicesError' : 'catalog.record.editChoicesLoading')
    : undefined)
  const people = [...allPeople].map(([value, label]) => ({ value, label }))
  const today = wibToday()

  const personField = (key: 'accountable' | 'responsible', label: string, personId: string | null | undefined): RecordFieldSpec => ({
    key, label, control: 'person', value: personId ?? null,
    displayValue: personId ? allPeople.get(personId) ?? t('catalog.notAvailable') : t('record.page.setField', { field: label }),
    editable: editable(true), readOnlyReason: readOnlyReason(true),
    options: [emptyOption, ...people],
  })
  const personFact = (key: 'accountable' | 'responsible', role: 'accountable' | 'responsible', label: string, personId: string | null | undefined): RecordFact | null => {
    const field = personField(key, label, personId)
    return !personId && !field.editable ? null : { type: 'person', key, role, field }
  }

  const businessUnitOptions = (() => {
    const allowed = isObjective
      ? (scopes.objective_org ? null : scopes.objective_bu_ids)
      : (scopes.workline_org ? null : scopes.workline_bu_ids)
    const units = [...businessUnits].filter(([value]) => allowed === null || allowed.includes(value)).map(([value, label]) => ({ value, label }))
    return allowed === null ? [emptyOption, ...(isObjective ? [{ value: COMPANY_WIDE_OPTION, label: t('catalog.companyWide') }] : []), ...units] : units
  })()
  const businessUnitField: RecordFieldSpec = {
    key: 'businessUnit', label: t('catalog.record.businessUnit'), control: 'relation',
    value: row.isCompanyWide ? COMPANY_WIDE_OPTION : row.businessUnitId ?? null,
    displayValue: row.isCompanyWide ? t('catalog.companyWide') : row.businessUnitId ? businessUnits.get(row.businessUnitId) ?? t('catalog.notAvailable') : t('record.page.setField', { field: t('catalog.record.businessUnit') }),
    editable: editable(true), readOnlyReason: readOnlyReason(true), options: businessUnitOptions,
  }

  const titleField: RecordFieldSpec = {
    key: 'name', label: t('catalog.nameLabel'), control: 'text', value: row.name, displayValue: row.name,
    editable: canManage && !archived, required: true, maxLength: 200,
  }

  const facts: RecordFact[] = [
    ...(isObjective ? [] : [{ type: 'state', key: 'type', label: t(isProcess ? 'catalog.tag.process' : 'catalog.tag.project'), tone: 'neutral', dot: false } satisfies RecordFact]),
    archived ? { type: 'state', key: 'state', label: t('catalog.record.archived'), tone: 'warning' } : { type: 'state', key: 'state', label: t('catalog.record.active'), tone: 'neutral' },
  ]
  if (isObjective) {
    const owner = personFact('accountable', 'accountable', t('catalog.record.accountable'), row.accountablePersonId)
    if (owner) facts.push(owner)
    const yearEditable = editable(false)
    const yearField: RecordFieldSpec = {
      key: 'period', label: t('catalog.record.period'), control: 'text', value: row.periodYear ?? null,
      placeholder: t('catalog.record.periodPlaceholder'),
      displayValue: row.periodYear == null ? t('record.page.setField', { field: t('catalog.record.period').toLowerCase() }) : String(row.periodYear),
      editable: yearEditable,
    }
    if (row.periodYear != null || yearEditable) {
      const quarterField: RecordFieldSpec = {
        key: 'periodQuarter', label: t('catalog.record.periodQuarter'), control: 'select',
        value: row.periodQuarter == null ? null : String(row.periodQuarter),
        displayValue: periodQuarterLabel(row.periodQuarter, t), editable: yearEditable && row.periodYear != null,
        options: [
          { value: '', label: t('catalog.period.wholeYear') }, { value: '1', label: t('catalog.period.q1') },
          { value: '2', label: t('catalog.period.q2') }, { value: '3', label: t('catalog.period.q3') }, { value: '4', label: t('catalog.period.q4') },
        ],
      }
      facts.push({ type: 'group', key: 'period', label: t('catalog.record.period'), fields: row.periodYear == null ? [yearField] : [quarterField, yearField] })
    }
    if (row.businessUnitId || row.isCompanyWide || businessUnitField.editable) facts.push({ type: 'field', key: 'businessUnit', field: businessUnitField })
  } else {
    const responsible = personFact('responsible', 'responsible', t('catalog.record.responsible'), row.responsiblePersonId)
    const accountable = personFact('accountable', 'accountable', t('catalog.record.accountable'), row.accountablePersonId)
    if (responsible) facts.push(responsible)
    if (accountable) facts.push(accountable)
    if (isProcess && process?.cadence) {
      facts.push({ type: 'field', key: 'cadence', field: { key: 'cadence', label: t('catalog.record.cadence'), control: 'text', value: process.cadence.cadence_kind, displayValue: cadenceLabel(process.cadence.cadence_kind, t), editable: false } })
    }
    const objectiveField: RecordFieldSpec = {
      key: 'objective', label: t('catalog.record.objective'), control: 'relation', value: row.objectiveId ?? null,
      displayValue: parent?.name ?? t('record.page.setField', { field: t('catalog.record.objective') }),
      href: parent ? `/work/objectives/${parent.id}` : undefined,
      onOpen: parent && onOpenRelated ? () => onOpenRelated('objective', parent.id) : undefined,
      editable: editable(true), readOnlyReason: readOnlyReason(true),
      options: [emptyOption, ...(editDirectory?.objectiveOptions ?? context.objectiveOptions ?? [])],
    }
    if (parent || objectiveField.editable) facts.push({ type: 'field', key: 'objective', field: objectiveField })
  }

  // ── What is still missing, for a viewer who can add it ─────────────────────
  const ownTaskTargets = isObjective ? linkedWork.map((group) => group.id) : [id]
  const rememberOpener = () => { openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null }
  // Back to the control that opened it; when that control was replaced meanwhile, to the Steps add control.
  const restoreOpener = (fallback?: string) => requestAnimationFrame(() => {
    if (openerRef.current?.isConnected) openerRef.current.focus()
    else if (fallback) document.querySelector<HTMLElement>(fallback)?.focus()
  })
  const closeChooser = () => { setChooser(null); restoreOpener() }
  const startAddTask = () => {
    if (isObjective && linkedWork.length > 1) {
      rememberOpener()
      setChooser({ purpose: 'task', options: linkedWork.map((group) => ({ value: group.id, label: group.name })) })
      return
    }
    if (ownTaskTargets[0]) createTask(ownTaskTargets[0])
  }
  const openStepForm = () => { rememberOpener(); setAddingStep(true) }
  const cancelStepForm = () => { setAddingStep(false); restoreOpener(STEPS_ADD_CONTROL) }
  const startLink = async () => {
    rememberOpener()
    setLinkError(null)
    setChooser({ purpose: 'link', status: 'loading', options: [], objectiveOf: new Map(), names: new Map(), facts: new Map() })
    try {
      const [workLines, objectives] = await Promise.all([listWorkLinesAll(), listObjectivesAll()])
      const objectiveNames = new Map(objectives.map((objective) => [objective.id, objective.name]))
      const candidates = workLines
        .filter((workLine) => workLine.archived_at === null && workLine.objective_id !== id && canManageForScope('work-line', workLine.business_unit_id, scopes))
        .sort((a, b) => Number(a.objective_id !== null && a.objective_id !== undefined) - Number(b.objective_id !== null && b.objective_id !== undefined) || a.name.localeCompare(b.name))
      setChooser({
        purpose: 'link',
        status: candidates.length === 0 ? 'empty' : 'ready',
        options: candidates.map((workLine) => workLine.objective_id
          ? {
              value: workLine.id,
              label: t('catalog.link.optionOther', { name: workLine.name, parent: objectiveNames.get(workLine.objective_id) ?? t('catalog.notAvailable') }),
              group: t('catalog.link.groupOther'),
            }
          : { value: workLine.id, label: workLine.name, group: t('catalog.link.groupFree') }),
        objectiveOf: new Map(candidates.map((workLine) => [workLine.id, workLine.objective_id ?? null])),
        names: new Map(candidates.map((workLine) => [workLine.id, workLine.name])),
        facts: new Map(candidates.map((workLine) => [workLine.id, {
          id: workLine.id, name: workLine.name, type: workLine.type, objectiveId: id,
          businessUnitId: workLine.business_unit_id ?? null, responsiblePersonId: workLine.responsible_person_id ?? null,
        }])),
      })
    } catch {
      setChooser({ purpose: 'link', status: 'error', options: [], objectiveOf: new Map(), names: new Map(), facts: new Map() })
    }
  }
  /**
   * True once the link is written; a failure keeps its retry and reports nothing as done. With
   * `shown`, the row is listed before the write and taken out again if the write fails; a re-read
   * that fails after a good write leaves the (true) row in place.
   */
  const link = async (workLineId: string, objectiveId: string | null, shown?: CatalogWorkLineFact): Promise<boolean> => {
    const attempt = async () => {
      if (shown) setState((current) => current ? withLinkedWorkLine(current, id, shown) : current)
      try {
        await updateWorkLine(workLineId, { objective_id: objectiveId })
      } catch (error) {
        if (shown) setState((current) => current ? withoutLinkedWorkLine(current, id, workLineId) : current)
        throw error
      }
      setLinkError(null)
      if (shown) await refresh().catch(() => {})
      else await refresh()
    }
    try { await attempt(); return true } catch { setLinkError(() => attempt); return false }
  }
  const unlink = async (workLine: CatalogWorkLineFact) => {
    if (!(await link(workLine.id, null))) return
    announce({ message: t('catalog.link.unlinkedNotice', { name: workLine.name }), undo: async () => { await link(workLine.id, id) } })
  }

  // A writer's Get started region waits for the key-result count, so it never shows a half-known list.
  const settled = !isObjective || !isWriter || krCount !== null
  const setup: RecordSetupItem[] = []
  if (!archived && isWriter && settled) {
    if (isObjective) {
      if (canManage && krCount === 0) {
        setup.push({ id: 'targets', label: t('catalog.setup.targets.label'), reason: t('catalog.setup.targets.reason'), action: { label: t('objective.keyResults.add'), onClick: () => { rememberOpener(); setAddKeyResultToken((n) => n + 1) } } })
      }
      if (canLink && linkedWork.length === 0) {
        setup.push({ id: 'link', label: t('catalog.setup.link.label'), reason: t('catalog.setup.link.reason'), action: { label: t('catalog.link.action'), onClick: () => { void startLink() } } })
      }
      if (linkedWork.length > 0 && context.relationsById.get(id)?.tasks.length === 0) {
        setup.push({ id: 'tasks', label: t('catalog.setup.tasks.label'), reason: t('catalog.setup.tasks.reason'), action: { label: t('catalog.record.addTask'), onClick: startAddTask } })
      }
    } else if (isProcess) {
      if (canManage && process && process.steps.length === 0) {
        setup.push({ id: 'steps', label: t('catalog.setup.steps.label'), reason: t('catalog.setup.steps.reason'), action: { label: t('catalog.steps.addFirst'), onClick: openStepForm } })
      }
    } else if (derived.relationTasks.length === 0) {
      setup.push({ id: 'tasks', label: t('catalog.setup.firstTask.label'), reason: t('catalog.setup.firstTask.reason'), action: { label: t('catalog.setup.firstTask.action'), onClick: startAddTask } })
    }
  }
  const setupTitle = t(isObjective ? 'catalog.setup.title.objective' : isProcess ? 'catalog.setup.title.process' : 'catalog.setup.title.project')
  // One ready run starts as the body's Start button does; with several Teams ready the person picks
  // the Team, so the primary takes them to those buttons rather than choosing for them.
  const startReady = isProcess && process !== null && process.steps.length > 0 && occurrences.state === 'ready' && occurrences.startable.length > 0
  const startFromHeader = () => {
    if (occurrences.startable.length === 1) { void occurrences.start(occurrences.startable[0]); return }
    const first = document.querySelector<HTMLElement>('.process-occurrence-controls__start button')
    first?.scrollIntoView({ block: 'center' })
    first?.focus()
  }
  const primary: RecordPrimaryAction | undefined = archived || !settled || setup.length > 0 ? undefined
    : isProcess ? (startReady ? { label: t('catalog.record.startOccurrence'), onClick: startFromHeader, busy: occurrences.startingKey !== null } : undefined)
      : (isObjective ? linkedWork.length > 0 : true) ? { label: t('catalog.record.addTask'), onClick: startAddTask } : undefined

  const accountableName = row.accountablePersonId ? allPeople.get(row.accountablePersonId) : undefined
  // The line says what the viewer can do: "View only" is for a viewer with nothing to add.
  const canAddTask = !archived && !isProcess && (isObjective ? linkedWork.length > 0 : true)
  const noteKey = isObjective
    ? (canContent
      ? (accountableName ? 'catalog.record.viewOnly.content' : 'catalog.record.viewOnly.contentOnly')
      : canAddTask
        ? (accountableName ? 'catalog.record.viewOnly.objectiveAdd' : 'catalog.record.viewOnly.noneAdd')
        : (accountableName ? 'catalog.record.viewOnly.objective' : 'catalog.record.viewOnly.none'))
    : canAddTask
      ? (accountableName ? 'catalog.record.viewOnly.workLineAdd' : 'catalog.record.viewOnly.noneAdd')
      : (accountableName ? 'catalog.record.viewOnly.workLine' : 'catalog.record.viewOnly.none')
  const note = !scopesKnown || canManage ? undefined : t(noteKey, { name: accountableName ?? '' })

  const menu: RecordMenuItem[] = [
    ...(canonicalHref && typeof navigator !== 'undefined' && navigator.clipboard ? [{
      id: 'copy', label: t('record.copyLink'),
      onSelect: () => { void navigator.clipboard.writeText(new URL(canonicalHref, window.location.origin).href).catch(() => {}) },
    }] : []),
    // Wide panels carry Open full page in their own bar; on a phone the panel is the whole screen and has none.
    ...(mode === 'panel' && onOpenPage && !isDesktop ? [{ id: 'open-page', label: t('record.openFullPage'), onSelect: onOpenPage }] : []),
    ...(runtime ? [{
      id: 'deputy', label: t('assistant.askAboutRecord'),
      onSelect: () => openPanel(`About ${isObjective ? t('catalog.record.objective') : t(isProcess ? 'catalog.tag.process' : 'catalog.tag.project')}: ${row.name}`),
    }] : []),
    ...(canManage ? [{
      id: 'archive', label: archived ? t('catalog.unarchive') : t('catalog.archive'), separatorBefore: true, disabled: busy,
      onSelect: () => { void setArchived(!archived, row.name).catch(() => {}) },
    }] : []),
  ]

  const writeUpEditable = canContent
  const about: { title: string; node: ReactNode } | undefined = isObjective ? undefined : {
    title: t('record.page.about'),
    node: (
      <RecordAbout items={[
        {
          key: 'businessUnit', label: t('catalog.record.businessUnit'),
          value: <span className="rp-about__field"><RecordField spec={businessUnitField} onCommit={(value) => commitProperty('businessUnit', value)} onDirtyChange={setFieldDirty} commitsFrozen={pendingLeave !== null} /></span>,
        },
        ...(isProcess ? [{ key: 'owningTeam', label: t('catalog.record.owningTeam'), value: t('catalog.record.teamPerOccurrence') }] : []),
      ]} />
    ),
  }

  const chooserNode = chooser ? (
    chooser.purpose === 'task' ? (
      <InlineChooser
        label={t('catalog.chooser.taskFor')}
        options={chooser.options}
        onPick={(workLineId) => { setChooser(null); createTask(workLineId) }}
        onCancel={closeChooser}
      />
    ) : (
      <InlineChooser
        label={t('catalog.link.action')}
        options={chooser.options}
        onPick={(workLineId) => {
          const other = chooser.objectiveOf.get(workLineId)
          setChooser(null)
          if (other) setMoving({ id: workLineId, name: chooser.names.get(workLineId) ?? '', from: chooser.options.find((option) => option.value === workLineId)?.label ?? '', fact: chooser.facts.get(workLineId) })
          else void link(workLineId, id, chooser.facts.get(workLineId))
        }}
        onCancel={closeChooser}
        status={chooser.status === 'ready' ? undefined : (
          <p className="rp-chooser__status" role={chooser.status === 'error' ? 'alert' : 'status'}>
            {chooser.status === 'loading' ? t('catalog.link.loading') : chooser.status === 'empty' ? t('catalog.link.empty') : t('catalog.link.error')}
            {' '}
            {chooser.status === 'error' ? <Button variant="ghost" onClick={() => { void startLink() }}>{t('record.field.retry')}</Button> : null}
            <Button variant="ghost" onClick={closeChooser}>{t('common.cancel')}</Button>
          </p>
        )}
      />
    )
  ) : null

  const noticeNode = (
    <>
      {mutationError ? <p className="catalog-record-document__error" role="alert">{mutationError}</p> : null}
      {editDirectoryError ? <ErrorState message={t('catalog.record.editChoicesError')} onRetry={() => setEditDirectoryRetry((value) => value + 1)} /> : null}
      {isProcess && occurrences.startError ? <p className="catalog-record-document__error" role="alert">{t('processes.due.startError')}</p> : null}
      {linkError ? (
        <p className="catalog-record-document__error" role="alert">
          {t('catalog.link.failed')}{' · '}
          <button type="button" className="objective-key-results__retry" onClick={() => { void linkError().catch(() => {}) }}>{t('record.field.retry')}</button>
        </p>
      ) : null}
      {notice ? (
        <p className="rp-notice" role="status">
          <span>{notice.message}</span>
          {notice.undo ? <Button variant="ghost" onClick={() => { const undo = notice.undo; setNotice(null); void undo?.().catch(() => {}) }}>{t('record.undo')}</Button> : null}
        </p>
      ) : null}
    </>
  )

  const stepsSection = isProcess && process ? (
    <StepsSection
      workLineId={id}
      process={process}
      people={allPeople}
      roles={state.roleNamesById}
      owningTeams={state.owningTeams}
      canManage={canManage}
      archived={archived}
      adding={addingStep}
      hidden={setup.some((item) => item.id === 'steps')}
      onAdd={openStepForm}
      onCancelAdd={cancelStepForm}
      onAdded={() => {
        setAddingStep(false)
        void refresh().then(() => requestAnimationFrame(() => document.querySelector<HTMLElement>(STEPS_ADD_CONTROL)?.focus()))
      }}
    />
  ) : null
  // A Process with no steps leads with them: the form the Get started row opens sits right under it.
  const stepsFirst = isProcess && process !== null && process.steps.length === 0

  return (
    <>
      {mode === 'page' ? <RouteLeaveGuard when={fieldDirty} message={t('catalog.record.unsaved.copy')} /> : null}
      <RecordPageLayout
        label={row.name}
        mode={mode}
        headingLevel={mode === 'page' ? 1 : 2}
        header={(
          <RecordPageHeader
            title={titleField}
            headingLevel={mode === 'page' ? 1 : 2}
            facts={facts}
            primary={primary}
            menu={menu}
            menuLabel={t('record.moreActions')}
            menuMinItems={canManage ? 1 : 2}
            factsLabel={t('record.page.facts')}
            note={note}
            onCommitField={commitProperty}
            onDirtyChange={setFieldDirty}
            fieldCommitsFrozen={pendingLeave !== null}
          />
        )}
        notice={noticeNode}
        setup={(
          <>
            {chooserNode}
            <RecordGetStarted title={setupTitle} why={t(isObjective ? 'catalog.setup.why.objective' : isProcess ? 'catalog.setup.why.process' : 'catalog.setup.why.project')} items={setup} />
          </>
        )}
        about={about}
        history={{
          title: t('catalog.history.title'),
          node: <RecordHistory key={historyVersion} table={isObjective ? 'objectives' : 'work_lines'} recordId={id} headingLevel={mode === 'page' ? 1 : 2} hideHeading />,
        }}
      >
        {isObjective ? (
          <>
            <ObjectiveKeyResultsSection
              objectiveId={id}
              businessUnitId={row.businessUnitId}
              isCompanyWide={row.isCompanyWide}
              archived={archived}
              scopes={scopes}
              scopesStatus={scopesError ? 'error' : scopesLoading ? 'loading' : 'ready'}
              onRetryScopes={retryScopes}
              hideWhenEmpty={setup.some((item) => item.id === 'targets')}
              onCount={setKrCount}
              onAddClosed={() => restoreOpener()}
              openAddToken={addKeyResultToken}
            />
            <LinkedWorkSection
              objectiveId={id}
              groups={linkedWork}
              progress={context.progressById.get(id) ?? { done: 0, total: 0 }}
              workLines={workLinesById}
              people={allPeople}
              scopes={scopes}
              archived={archived}
              canLink={canLink}
              hidden={setup.some((item) => item.id === 'link')}
              onLink={() => { void startLink() }}
              onOpenRelated={onOpenRelated}
              onUnlink={(workLine) => { void unlink(workLine) }}
            />
          </>
        ) : null}
        {stepsFirst ? stepsSection : null}
        {isProcess && process ? (
          <RecordSection id="occurrence" title={t('catalog.record.currentNextAction')}>
            <div data-setup-pending={setup.some((item) => item.id === 'steps') || undefined}>
              <ProcessOccurrenceControls workLineId={id} setupIncomplete={process.steps.length === 0} canManageSetup={canManage} onChanged={onOccurrencesChanged} data={occurrences} />
            </div>
          </RecordSection>
        ) : null}
        <TasksSection
          title={t(isProcess ? 'catalog.record.processTasks' : 'catalog.record.tasks')}
          tasks={derived.relationTasks}
          people={allPeople}
          canAdd={canAddTask}
          hidden={setup.some((item) => item.id === 'tasks')}
          onAdd={startAddTask}
          onOpenRelated={onOpenRelated}
          today={today}
        />
        {stepsFirst ? null : stepsSection}
        {isObjective ? <WriteUpSection objectiveId={id} canEdit={writeUpEditable} archived={archived} onDirtyChange={setFieldDirty} /> : null}
      </RecordPageLayout>
      <ConfirmDialog
        open={pendingLeave !== null}
        title={t('catalog.record.unsaved.title')}
        body={t('catalog.record.unsaved.copy')}
        confirmLabel={t('catalog.record.unsaved.discard')}
        tone="destructive"
        onConfirm={discardAndLeave}
        onCancel={retainDraft}
      />
      <ConfirmDialog
        open={moving !== null}
        title={t('catalog.link.moveTitle', { name: moving?.name ?? '' })}
        body={t('catalog.link.moveBody', { name: moving?.name ?? '' })}
        confirmLabel={t('catalog.link.move')}
        onConfirm={async () => {
          if (!moving) return
          const target = moving
          setMoving(null)
          await link(target.id, id, target.fact)
        }}
        onCancel={() => setMoving(null)}
      />
    </>
  )
}

