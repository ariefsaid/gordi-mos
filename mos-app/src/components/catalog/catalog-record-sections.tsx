// The body sections of an Objective or Project/Process record. Each is a RecordSection over rows;
// the record document decides which to show, what is missing, and who may act.
import { Suspense, lazy, useEffect, useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import { Picker, type PickerOption } from '@/components/ui/picker'
import { TextInput } from '@/components/ui/text-input'
import { useFocusRestore } from '@/components/ui/use-focus-restore'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { RecordDisclosure, RecordSection } from '@/components/record/record-page-layout'
import { RecordMenu } from '@/components/record/record-menu'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import type { CountRollup } from '@/lib/cascade/count-rollup'
import { readWriteUp, sanitizeWriteUp } from '@/lib/db/objective-writeup'
import { createProcessStep } from '@/lib/db/process-steps'
import { getPeople, type PersonOption } from '@/lib/db/directory'
import type { ProcessRecordData } from '@/lib/db/work-records'
import type { WorkWriteScopes } from '@/lib/db/work-authority'
import type { CatalogRelationGroup, CatalogRelationTask } from './catalog-collection-adapter'
import type { CatalogWorkLineFact } from './catalog-record-loader'
import { writeUpExcerpt } from './write-up-excerpt'
import { canManageForScope } from './use-work-write-authority'

const ObjectiveWriteupEditor = lazy(() => import('./objective-writeup-editor').then((m) => ({ default: m.ObjectiveWriteupEditor })))

type Translate = ReturnType<typeof useT>
export type CatalogRelatedKind = 'objective' | 'work-line' | 'task'
type OpenRelated = ((kind: CatalogRelatedKind, id: string) => void) | undefined

function relatedPath(kind: CatalogRelatedKind, id: string): string {
  if (kind === 'task') return `/work/tasks/${id}`
  if (kind === 'objective') return `/work/objectives/${id}`
  return `/work/projects/${id}`
}

export type RelatedLinkProps = {
  kind: CatalogRelatedKind
  id: string
  children: string
  onOpenRelated?: OpenRelated
  className?: string
}

/** A link that opens in the same panel stack on a plain click and keeps its href for the rest. */
export function RelatedLink({ kind, id, children, onOpenRelated, className = 'rp-row__name' }: RelatedLinkProps) {
  return (
    <Link
      className={className}
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

function statusLabel(status: string, t: Translate): string {
  const keys: Record<string, 'open' | 'inProgress' | 'blocked' | 'done'> = {
    Open: 'open', 'In Progress': 'inProgress', Blocked: 'blocked', Done: 'done',
  }
  const key = keys[status]
  return key ? t(`tasks.status.${key}`) : status
}

const STATUS_TONE: Record<string, string> = { Open: 'open', 'In Progress': 'progress', Blocked: 'blocked', Done: 'done' }
const STATUS_ORDER: Record<string, number> = { Blocked: 0, 'In Progress': 1, Open: 2, Done: 3 }

const firstName = (name: string | undefined) => (name ?? '').split(/\s+/)[0] ?? ''
const initialsOf = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return (words.length < 2 ? (words[0] ?? '').slice(0, 2) : words[0][0] + words[words.length - 1][0]).toUpperCase()
}

// ── Inline chooser ────────────────────────────────────────────────────────────

export type InlineChooserProps = {
  label: string
  options: readonly PickerOption[]
  onPick: (value: string) => void
  onCancel: () => void
  status?: ReactNode
}

/** A type-to-find picker opened by the action that asked for it; Escape or outside click withdraws it. */
export function InlineChooser({ label, options, onPick, onCancel, status }: InlineChooserProps) {
  return (
    <div className="rp-chooser" role="group" aria-label={label}>
      {status ?? (
        <Picker
          label={label}
          value=""
          options={options}
          placeholder={label}
          hideLabel
          defaultOpen
          autoFocus
          fullWidth
          onChange={onPick}
          onOpenChange={(open, reason) => { if (!open && reason !== 'select') onCancel() }}
        />
      )}
    </div>
  )
}

// ── Projects & Processes ──────────────────────────────────────────────────────

export type LinkedWorkSectionProps = {
  objectiveId: string
  groups: readonly CatalogRelationGroup[]
  workLines: ReadonlyMap<string, CatalogWorkLineFact>
  people: ReadonlyMap<string, string>
  scopes: WorkWriteScopes
  archived: boolean
  canLink: boolean
  /** The Get started region owns the action while nothing is linked. */
  hidden: boolean
  onLink: () => void
  onOpenRelated: OpenRelated
  onUnlink: (workLine: CatalogWorkLineFact) => void
}

export function LinkedWorkSection({ objectiveId, groups, workLines, people, scopes, archived, canLink, hidden, onLink, onOpenRelated, onUnlink }: LinkedWorkSectionProps) {
  const t = useT()
  const rows = groups.filter((group) => !group.synthetic && group.entity === 'work-line')
  if (rows.length === 0 && (hidden || !canLink)) return null
  const count = rows.length > 0 ? rows.length : undefined
  return (
    <RecordSection
      id="linked-work"
      title={t('catalog.record.linkedProjectsProcesses')}
      count={count}
      action={canLink && !archived ? { label: t('catalog.link.action'), onClick: onLink } : undefined}
    >
      <ul className="rp-rows">
        {rows.map((group) => {
          const workLine = workLines.get(group.id)
          const direct = group.relationship === 'direct' && workLine?.objectiveId === objectiveId
          const responsible = workLine?.responsiblePersonId ? people.get(workLine.responsiblePersonId) : undefined
          const canUnlink = direct && !archived && workLine !== undefined && canManageForScope('work-line', workLine.businessUnitId, scopes)
          return (
            <li key={`${group.relationship ?? 'related'}:${group.id}`} className="rp-row rp-wl">
              {workLine ? <span className="pill pill--neutral">{t(workLine.type === 'project' ? 'catalog.tag.project' : 'catalog.tag.process')}</span> : <span />}
              <span className="rp-wl__name">
                <RelatedLink kind="work-line" id={group.id} onOpenRelated={onOpenRelated}>{group.name}</RelatedLink>
                {group.relationship === 'contribution' ? <span className="rp-row__meta">{t('catalog.record.viaTasks')}</span> : null}
              </span>
              {group.total > 0
                ? <span className="rp-row__meta rp-wl__count tabular-nums">{t('catalog.record.rollup', { done: String(group.done), total: String(group.total) })}</span>
                : <span />}
              {responsible ? <span className="rp-avatar rp-wl__who" data-initials={initialsOf(responsible)} title={responsible} role="img" aria-label={`${t('catalog.record.responsible')}: ${responsible}`} /> : <span />}
              {canUnlink && workLine ? (
                <span className="rp-wl__menu">
                  <RecordMenu
                    label={t('catalog.link.rowActions', { name: group.name })}
                    minItems={1}
                    items={[{ id: 'unlink', label: t('catalog.link.unlink'), onSelect: () => onUnlink(workLine) }]}
                  />
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </RecordSection>
  )
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

const VISIBLE_TASKS = 5

export type TasksSectionProps = {
  title: string
  tasks: readonly CatalogRelationTask[]
  /** Objective counts include linked work; task rows remain the record's direct task list. */
  rollup?: CountRollup
  people: ReadonlyMap<string, string>
  canAdd: boolean
  /** The record header owns Add task when it is the page's primary action. */
  actionInHeader?: boolean
  /** The Get started region owns the action while there are no tasks. */
  hidden: boolean
  /** Objective progress includes Tasks under linked Projects and Processes. */
  objectiveRollup?: boolean
  onAdd: () => void
  onOpenRelated: OpenRelated
  today: string
}

export function TasksSection({ title, tasks, rollup, people, canAdd, actionInHeader = false, hidden, objectiveRollup = false, onAdd, onOpenRelated, today }: TasksSectionProps) {
  const t = useT()
  const { locale } = useI18n()
  const [all, setAll] = useState(false)
  if (tasks.length === 0 && (hidden || !canAdd)) return null
  const done = rollup?.done ?? tasks.filter((task) => task.status === 'Done').length
  const total = rollup?.total ?? tasks.length
  const ordered = [...tasks].sort((a, b) =>
    (STATUS_ORDER[a.status ?? ''] ?? 2) - (STATUS_ORDER[b.status ?? ''] ?? 2)
    || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
  const shown = all ? ordered : ordered.slice(0, VISIBLE_TASKS)
  const soon = (iso: string) => { const days = (Date.parse(iso) - Date.parse(today)) / 86_400_000; return days >= 0 && days <= 3 }
  return (
    <RecordSection
      id="tasks"
      title={title}
      count={total > 0 ? t(objectiveRollup ? 'catalog.objectives.taskProgress' : 'catalog.record.rollup', { done: String(done), total: String(total) }) : undefined}
      action={canAdd && !actionInHeader ? { label: t('catalog.record.addTask'), onClick: onAdd } : undefined}
    >
      <ul className="rp-rows">
        {shown.map((task) => {
          const overdue = task.dueDate && task.status !== 'Done' && task.dueDate < today
          return (
            <li key={task.id} className="rp-row rp-task">
              <span className={`rp-status rp-status--${STATUS_TONE[task.status ?? ''] ?? 'open'}`}>{task.status ? statusLabel(task.status, t) : ''}</span>
              <RelatedLink kind="task" id={task.id} onOpenRelated={onOpenRelated}>{task.title}</RelatedLink>
              <span className="rp-person">{firstName(task.picPersonId ? people.get(task.picPersonId) : undefined)}</span>
              {task.dueDate ? (
                <span className={`rp-due tabular-nums${overdue ? ' rp-due--overdue' : task.status !== 'Done' && soon(task.dueDate) ? ' rp-due--soon' : ''}`}>
                  {formatWeekdayDayMonth(task.dueDate, locale)}
                </span>
              ) : <span />}
            </li>
          )
        })}
      </ul>
      {tasks.length > VISIBLE_TASKS ? (
        <div className="rp-more">
          <button type="button" className="rp-link-btn" onClick={() => setAll((value) => !value)} aria-expanded={all}>
            {all ? t('catalog.tasks.showFewer') : t('catalog.tasks.showAll', { count: String(tasks.length) })}
          </button>
        </div>
      ) : null}
    </RecordSection>
  )
}

// ── Steps (Process) ───────────────────────────────────────────────────────────

const STEP_DISCLOSURE_AFTER = 6

function processOwner(personId: string | null, roleId: string | null, people: ReadonlyMap<string, string>, roles: ReadonlyMap<string, string>, t: Translate): string {
  const person = personId ? people.get(personId) ?? t('catalog.notAvailable') : null
  const role = roleId ? roles.get(roleId) ?? t('catalog.notAvailable') : null
  if (person && role && role !== t('catalog.notAvailable')) return `${person} · ${role}`
  return person ?? role ?? t('catalog.notSet')
}

type StepFormProps = {
  workLineId: string
  position: number
  onSaved: () => void
  onCancel: () => void
}

function StepForm({ workLineId, position, onSaved, onCancel }: StepFormProps) {
  const t = useT()
  const [title, setTitle] = useState('')
  const [pic, setPic] = useState('')
  const [people, setPeople] = useState<PersonOption[]>([])
  const [touched, setTouched] = useState(false)
  const [state, setState] = useState<'idle' | 'saving' | 'failed'>('idle')
  const [peopleFailed, setPeopleFailed] = useState(false)
  const [peopleReload, setPeopleReload] = useState(0)
  const formRef = useFocusRestore<HTMLFormElement>(state === 'saving', state === 'failed', { includeFormControls: true })
  useEffect(() => {
    let live = true
    setPeopleFailed(false)
    getPeople().then((next) => { if (live) setPeople(next) }, () => { if (live) setPeopleFailed(true) })
    return () => { live = false }
  }, [peopleReload])
  const titleError = touched && title.trim() === ''
  const picError = touched && pic === ''
  const titleErrorId = useId()
  const picErrorId = useId()
  const submit = async () => {
    setTouched(true)
    if (state === 'saving' || title.trim() === '' || pic === '') {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.catalog-step-form [aria-invalid="true"]')?.focus())
      return
    }
    setState('saving')
    try {
      await createProcessStep({ workLineId, title, picPersonId: pic, position })
      onSaved()
    } catch {
      setState('failed')
    }
  }
  return (
    <form
      ref={formRef}
      noValidate
      className="catalog-step-form form-grid"
      aria-label={t('catalog.steps.add')}
      onSubmit={(event) => { event.preventDefault(); void submit() }}
      onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel() } }}
    >
      <div className="form-grid__field form-grid__field--full">
        <TextInput
          autoFocus
          label={t('catalog.steps.name')}
          value={title}
          maxLength={200}
          required
          error={titleError}
          aria-describedby={titleError ? titleErrorId : undefined}
          fullWidth
          disabled={state === 'saving'}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => setTouched(true)}
        />
        {titleError ? <span id={titleErrorId} className="objective-key-results__error" role="alert">{t('catalog.steps.nameRequired')}</span> : null}
      </div>
      {peopleFailed ? (
        <div className="form-grid__field form-grid__field--full">
          <ErrorState message={t('objective.keyResults.peopleError')} onRetry={() => setPeopleReload((n) => n + 1)} />
        </div>
      ) : null}
      <div className="form-grid__field form-grid__field--full">
        <Picker
          label={t('catalog.steps.pic')}
          value={pic}
          options={people.map((person) => ({ value: person.id, label: person.full_name }))}
          placeholder={t('catalog.steps.pic')}
          error={picError}
          describedBy={picError ? picErrorId : undefined}
          fullWidth
          disabled={state === 'saving'}
          onChange={setPic}
        />
        {picError ? <span id={picErrorId} className="objective-key-results__error" role="alert">{t('catalog.steps.picRequired')}</span> : null}
      </div>
      <div className="form-grid__field form-grid__field--full objective-key-results__actions">
        <Button type="submit" variant="outline" disabled={state === 'saving'} aria-busy={state === 'saving' || undefined}>
          {state === 'saving' ? t('record.field.saving') : t('catalog.steps.save')}
        </Button>
        <Button type="button" variant="ghost" disabled={state === 'saving'} onClick={onCancel}>{t('common.cancel')}</Button>
        {state === 'failed' ? (
          <span className="objective-key-results__error" role="alert">
            {t('objective.keyResults.saveFailed')}{' · '}
            <button type="button" className="objective-key-results__retry" onClick={() => { void submit() }}>{t('record.field.retry')}</button>
          </span>
        ) : null}
      </div>
    </form>
  )
}

export type StepsSectionProps = {
  workLineId: string
  process: ProcessRecordData
  people: ReadonlyMap<string, string>
  roles: ReadonlyMap<string, string>
  owningTeams: ReadonlyMap<string, string | null>
  canManage: boolean
  archived: boolean
  adding: boolean
  /** The Get started region owns the action while the Process has no steps. */
  hidden: boolean
  onAdd: () => void
  onCancelAdd: () => void
  onAdded: () => void
}

export function StepsSection({ workLineId, process, people, roles, owningTeams, canManage, archived, adding, hidden, onAdd, onCancelAdd, onAdded }: StepsSectionProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  // Adding a step opens the folded list and leaves it open, so the Add control is there afterwards.
  useEffect(() => { if (adding) setOpen(true) }, [adding])
  const steps = process.steps
  if (steps.length === 0 && !adding && (hidden || !canManage)) return null
  const list = steps.length > 0 ? (
    <ol className="catalog-record-document__steps">
      {steps.map((step) => {
        const items = Array.isArray((step as { checklist_items?: unknown }).checklist_items)
          ? (step as { checklist_items: unknown[] }).checklist_items.filter((item): item is string => typeof item === 'string')
          : []
        return (
          <li key={step.id}>
            <span className="catalog-record-document__step-title">{step.title}</span>
            {step.description ? <span className="catalog-record-document__step-copy">{step.description}</span> : null}
            <dl className="catalog-record-document__step-meta">
              {/* A step shows what it has: its PIC and due always, a Team or Supervisor only when one is set. */}
              <div><dt>{t('tasks.pic')}</dt><dd>{processOwner(step.pic_person_id, step.pic_role_id, people, roles, t)}</dd></div>
              {owningTeams.get(`${step.id}:pic`) ? <div><dt>{t('catalog.record.picTeam')}</dt><dd>{owningTeams.get(`${step.id}:pic`)}</dd></div> : null}
              {step.supervisor_person_id || step.supervisor_role_id ? <div><dt>{t('tasks.supervisor')}</dt><dd>{processOwner(step.supervisor_person_id, step.supervisor_role_id, people, roles, t)}</dd></div> : null}
              {owningTeams.get(`${step.id}:supervisor`) ? <div><dt>{t('catalog.record.supervisorTeam')}</dt><dd>{owningTeams.get(`${step.id}:supervisor`)}</dd></div> : null}
              <div><dt>{t('catalog.record.due')}</dt><dd>{t('catalog.record.dueOffset', { count: String(step.due_offset_days) })}</dd></div>
            </dl>
            {items.length > 0 ? <ul className="catalog-record-document__checklist">{items.map((item) => <li key={item}>{item}</li>)}</ul> : null}
          </li>
        )
      })}
    </ol>
  ) : null
  const form = adding ? <StepForm workLineId={workLineId} position={steps.length} onSaved={onAdded} onCancel={onCancelAdd} /> : null
  const canAdd = canManage && !archived
  if (steps.length > STEP_DISCLOSURE_AFTER) {
    // A long list folds away; adding a step stays one click inside it, and an open form keeps it open.
    return (
      <RecordDisclosure title={t('catalog.record.steps')} count={steps.length} open={open} onToggle={setOpen}>
        <div className="catalog-record-document__steps-slot" data-record-section="steps">
          {list}
          {form}
          {canAdd && !adding ? <button type="button" className="rp-link-btn catalog-step-add" onClick={onAdd}><span aria-hidden="true">+ </span>{t('catalog.steps.add')}</button> : null}
        </div>
      </RecordDisclosure>
    )
  }
  return (
    <RecordSection
      id="steps"
      title={t('catalog.record.steps')}
      count={steps.length > 0 ? steps.length : undefined}
      action={canAdd && !adding ? { label: t('catalog.steps.add'), onClick: onAdd } : undefined}
    >
      <div className="catalog-record-document__steps-slot">{list}{form}</div>
    </RecordSection>
  )
}

// ── Write-up ──────────────────────────────────────────────────────────────────

export type WriteUpSectionProps = {
  objectiveId: string
  canEdit: boolean
  archived: boolean
  onDirtyChange: (dirty: boolean) => void
  onSaved?: () => void
}

/**
 * Collapsed to a short excerpt (or one ghost prompt); opening it loads the editor. The editor
 * module is imported only then, so a record that never opens its write-up never pays for it.
 */
export function WriteUpSection({ objectiveId, canEdit, archived, onDirtyChange, onSaved }: WriteUpSectionProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [excerpt, setExcerpt] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (open) return
    let live = true
    readWriteUp(objectiveId)
      .then((next) => { if (live) setExcerpt(next ? writeUpExcerpt(sanitizeWriteUp(next.writeUp)) : null) })
      .catch(() => { if (live) setExcerpt(null) })
    return () => { live = false }
  }, [objectiveId, open])
  const writable = canEdit && !archived
  if (!open && excerpt === undefined) return null
  if (!open && !excerpt && !writable) return null
  return (
    <RecordSection id="write-up" title={t('objective.writeUp.tab')}>
      {open ? (
        <>
          <Suspense fallback={<LoadingShell label={t('objective.writeUp.loading')} />}>
            <ObjectiveWriteupEditor
              objectiveId={objectiveId}
              canEdit={canEdit}
              archived={archived}
              onDirtyChange={(next) => { setDirty(next); onDirtyChange(next) }}
              onSaved={onSaved}
            />
          </Suspense>
          <div className="rp-more">
            <button type="button" className="rp-link-btn" disabled={dirty} onClick={() => setOpen(false)}>{t('catalog.writeup.close')}</button>
          </div>
        </>
      ) : excerpt ? (
        <>
          <p className="rp-doc rp-doc--excerpt">{excerpt}</p>
          <button type="button" className="rp-link-btn" onClick={() => setOpen(true)}>{t(writable ? 'catalog.writeup.edit' : 'catalog.writeup.read')}</button>
        </>
      ) : (
        <button type="button" className="rp-link-btn" onClick={() => setOpen(true)}><span aria-hidden="true">+ </span>{t('catalog.writeup.write')}</button>
      )}
    </RecordSection>
  )
}
