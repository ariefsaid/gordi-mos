// TaskCreateForm — Create task as a blank Task page: an "Untitled" title to type into, the Task's
// properties with defaults filled (PIC = me, Supervisor = the PIC's one manager, Team from my
// membership, Business Unit derived), then the description. Missing Team/Supervisor read "Needed";
// after a Create attempt they turn into the existing messages. Rendered by the Tasks workspace's
// capture page; one validation contract, one a11y contract.
import { ActionBar } from '@/components/ui/action-bar'
import { useIsOffline } from '@/shell/use-is-offline'
import { usePhoneActionBar } from '@/shell/page-action-bar'
import { lazy, Suspense, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Picker } from '@/components/ui/picker'
import { PillIcon } from '@/components/ui/pill'
import { DateField } from '@/components/ui/date-field'
import { useFocusRestore } from '@/components/ui/use-focus-restore'
import { RecordProperties, type RecordPropertyRow } from '@/components/record/record-properties'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { LoadingShell } from '@/components/ui/state-kit'
import { blockDocumentHasContent, type BlockDocument } from '@/lib/db/block-document'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { useTaskCreateContext } from './task-create-context'
import { picLockMessage } from './task-permissions'
import { TASK_TITLE_MAX_LENGTH } from './task-formatters'
import type { TaskTeamOption } from './task-row'
import './task-create-form.css'

// The editor loads on demand, as on the Task page.
const TaskDraftDescription = lazy(() => import('./task-draft-description').then((m) => ({ default: m.TaskDraftDescription })))

export type TaskCreateFormProps = {
  task: TaskListRow
  businessUnitName: string
  teamOptions: readonly TaskTeamOption[]
  personOptions: readonly { id: string; full_name: string }[]
  supervisorOptions: readonly { id: string; full_name: string }[]
  ownerName: string
  supervisorName: string
  onEditTeam: (taskId: string, teamId: string) => Promise<void>
  onEditPic: (taskId: string, personId: string) => Promise<void>
  onEditSupervisor: (taskId: string, personId: string) => Promise<void>
  /** Persist the draft with this title. Reject to keep the form open with every value preserved
   * and Retry offered (existing behaviour — preserved, not reinvented). */
  onCreate: (title: string, body: BlockDocument | null) => Promise<void>
  /** Escape / Cancel — discards the whole draft. */
  onCancel: () => void
  /** A distinct after-create failure (e.g. linking the new Task to a Signal) — the task row/card
   * already exists; only the follow-up step failed. Rendered separately from an ordinary
   * create failure, which this form tracks itself. */
  linkError?: boolean
  onRetryLink?: (title: string) => void
  /** #742 AC-060: the viewer has nobody reporting to them, so PIC is fixed to self. */
  viewerHasNoDownline?: boolean
}

export function TaskCreateForm({
  task, businessUnitName, teamOptions, personOptions, supervisorOptions, ownerName, supervisorName,
  onEditTeam, onEditPic, onEditSupervisor, onCreate, onCancel, linkError = false, onRetryLink,
  viewerHasNoDownline = false,
}: TaskCreateFormProps) {
  const t = useT()
  const { locale } = useI18n()
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : ''
  const offline = useIsOffline()
  const phoneBar = usePhoneActionBar()
  const formId = useId()
  const titleId = `${formId}-title`
  const titleErrorId = `${formId}-title-error`
  const teamFieldId = `${formId}-team`
  const teamErrorId = `${formId}-team-error`
  const picFieldId = `${formId}-pic`
  const supervisorFieldId = `${formId}-supervisor`
  const supervisorErrorId = `${formId}-supervisor-error`
  const dueFieldId = `${formId}-due`
  const workLineFieldId = `${formId}-workline`
  const offlineReasonId = `${formId}-offline`
  const { workLineOptions, onEditDue, onEditWorkLine, onTitleChange, formState, onFormStateChange, supervisorHint } = useTaskCreateContext()

  const [localTitle, setLocalTitle] = useState(task.title)
  const [localBody, setLocalBody] = useState<BlockDocument | null>(null)
  const body = formState?.body ?? localBody
  const setBody = (next: BlockDocument) => { setLocalBody(next); onFormStateChange?.({ body: next }) }
  const title = onTitleChange ? task.title : localTitle
  const setTitle = (next: string) => { setLocalTitle(next); onTitleChange?.(next) }
  const [titleTouched, setTitleTouched] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [localPending, setLocalPending] = useState(false)
  const pending = formState?.pending ?? localPending
  const setPending = (next: boolean) => { setLocalPending(next); onFormStateChange?.({ pending: next }) }
  // A link retry only links the already-created Task; draft edits, Title included, would never be saved.
  const fieldsLocked = pending || linkError
  const [localSaveError, setLocalSaveError] = useState(false)
  const saveError = formState?.saveError ?? localSaveError
  const setSaveError = (next: boolean) => { setLocalSaveError(next); onFormStateChange?.({ saveError: next }) }
  // Typed Due text that is not a usable date: Create refuses it rather than saving the old value.
  const [dueInvalid, setDueInvalid] = useState(false)
  // A Create attempt with something missing unfolds the properties so nothing stays hidden.
  const [unfold, setUnfold] = useState(0)
  const titleRef = useRef<HTMLTextAreaElement | null>(null)

  // Multi-line-safe title (never clips a long EN/ID title): a plain autosizing textarea — no new
  // dependency, the standard scrollHeight technique.
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [title])
  useEffect(() => { titleRef.current?.focus() }, [])

  const titleError = (attempted || titleTouched) && !title.trim() ? t('tasks.create.titleRequired') : undefined
  const teamMissing = !task.team_id || !task.business_unit_id
  const supervisorMissing = !task.accountable_person_id
  const teamError = attempted && teamMissing ? t('tasks.create.teamRequired') : undefined
  const supervisorError = attempted && supervisorMissing ? t('tasks.create.supervisorRequired') : undefined
  const lockMessage = picLockMessage(!viewerHasNoDownline, locale)
  // Create stays outlined until the three required values are in place, then becomes the page's one filled action.
  const ready = title.trim() !== '' && !teamMissing && !supervisorMissing

  const teamPickerOptions = teamOptions.length > 0
    ? [
        { value: '', label: t('tasks.create.teamPlaceholder') },
        ...teamOptions.map((team) => ({ value: team.id, label: team.name })),
      ]
    : [{ value: '', label: t('tasks.field.teamUnassigned') }]
  const supervisorPickerOptions = [
    { value: '', label: t('tasks.create.supervisorPlaceholder') },
    ...(task.accountable_person_id && !supervisorOptions.some((person) => person.id === task.accountable_person_id)
      ? [{ value: task.accountable_person_id, label: supervisorName || task.accountable_person_id }]
      : []),
    ...supervisorOptions.map((person) => ({ value: person.id, label: person.full_name })),
  ]
  const picPickerOptions = [
    ...(personOptions.some((person) => person.id === task.responsible_person_id)
      ? []
      : [{ value: task.responsible_person_id, label: ownerName || task.responsible_person_id }]),
    ...personOptions.map((person) => ({ value: person.id, label: person.full_name })),
  ].map((option) => (option.value === viewerId ? { ...option, label: `${option.label} ${t('tasks.create.you')}` } : option))

  const workLinePickerOptions = [
    { value: '', label: t('tasks.create.none') },
    ...workLineOptions.map((workLine) => ({
      value: workLine.id,
      label: `${workLine.name} (${workLine.type === 'project' ? t('tasks.type.project') : t('tasks.type.daily')})`,
    })),
  ]

  const formRef = useFocusRestore<HTMLFormElement>(pending, saveError, { includeFormControls: true })

  const trySubmit = () => {
    setAttempted(true)
    if (teamMissing || supervisorMissing) setUnfold((n) => n + 1)
    const trimmed = title.trim()
    if (!trimmed) { titleRef.current?.focus(); return }
    if (teamMissing) { window.setTimeout(() => document.getElementById(teamFieldId)?.focus(), 0); return }
    if (supervisorMissing) { window.setTimeout(() => document.getElementById(supervisorFieldId)?.focus(), 0); return }
    if (dueInvalid) { document.getElementById(dueFieldId)?.focus(); return }
    if (pending) return
    setSaveError(false)
    setPending(true)
    void onCreate(trimmed, body && blockDocumentHasContent(body) ? body : null).then(
      () => setPending(false),
      () => { setPending(false); setSaveError(true) },
    )
  }

  // A required value that is not set yet: "Needed" first, the existing message once Create was tried.
  const neededNote = (missing: boolean, error: string | undefined, errorId: string): ReactNode => {
    if (error) return <p id={errorId} role="alert" className="tcf-error">{error}</p>
    return missing ? <p className="tcf-needed">{t('tasks.create.needed')}</p> : null
  }

  const rows: RecordPropertyRow[] = [
    {
      key: 'status', label: t('tasks.status.label'),
      children: <span className="rp-props__plain"><span className="pill pill--neutral"><PillIcon tone="neutral" />{t('tasks.status.open')}</span></span>,
    },
    {
      key: 'pic', label: t('tasks.pic'), note: lockMessage,
      children: (
        <Picker
          id={picFieldId}
          label={t('tasks.pic')}
          hideLabel
          triggerClassName="tcf-value"
          value={task.responsible_person_id}
          options={picPickerOptions}
          disabled={fieldsLocked}
          onChange={(value) => { void onEditPic(task.id, value) }}
        />
      ),
    },
    {
      key: 'supervisor', label: t('tasks.supervisor'),
      note: (
        <>
          {neededNote(supervisorMissing, supervisorError, supervisorErrorId)}
          {supervisorHint === 'missing' && <p role="status" className="tcf-hint">{t('tasks.create.noManager')}</p>}
          {supervisorHint === 'error' && <p role="status" className="tcf-hint">{t('tasks.create.managerLookupFailed')}</p>}
          <p className="tcf-hint">{t('tasks.create.picSupervisorHint')}</p>
        </>
      ),
      children: (
        <Picker
          id={supervisorFieldId}
          label={t('tasks.supervisor')}
          hideLabel
          triggerClassName="tcf-value"
          value={task.accountable_person_id}
          options={supervisorPickerOptions}
          placeholder={t('tasks.create.supervisorPlaceholder')}
          disabled={fieldsLocked}
          required
          error={Boolean(supervisorError)}
          describedBy={supervisorError ? supervisorErrorId : undefined}
          onChange={(value) => { void onEditSupervisor(task.id, value) }}
        />
      ),
    },
    {
      key: 'team', label: t('tasks.team'), note: neededNote(teamMissing, teamError, teamErrorId),
      children: (
        <Picker
          id={teamFieldId}
          label={t('tasks.team')}
          hideLabel
          triggerClassName="tcf-value"
          value={task.team_id ?? ''}
          options={teamPickerOptions}
          placeholder={t('tasks.create.teamPlaceholder')}
          disabled={fieldsLocked || teamOptions.length === 0}
          required
          error={Boolean(teamError)}
          describedBy={teamError ? teamErrorId : undefined}
          onChange={(value) => { void onEditTeam(task.id, value) }}
        />
      ),
    },
    {
      key: 'businessUnit', label: t('tasks.filter.businessUnit'),
      children: (
        <span className="rp-props__plain" data-testid="task-create-derived-bu">
          {businessUnitName || <span className="tcf-muted">{t('tasks.create.buFromTeam')}</span>}
        </span>
      ),
    },
    {
      key: 'dueDate', label: t('tasks.create.dueDate'),
      children: (
        <DateField
          draftText={formState?.dueText}
          onDraftTextChange={(dueText) => onFormStateChange?.({ dueText })}
          id={dueFieldId}
          aria-label={t('tasks.create.dueDate')}
          className="tcf-value"
          value={task.due_date ?? ''}
          placeholder={t('tasks.due.set')}
          disabled={fieldsLocked}
          reveal={attempted}
          onChange={(value) => { void onEditDue(task.id, value || null) }}
          onValidityChange={setDueInvalid}
        />
      ),
    },
    ...(workLineOptions.length > 0 ? [{
      key: 'workLine', label: t('tasks.filter.projectProcess'),
      children: (
        <Picker
          id={workLineFieldId}
          label={t('tasks.filter.projectProcess')}
          hideLabel
          triggerClassName="tcf-value"
          value={task.work_line_id ?? ''}
          options={workLinePickerOptions}
          disabled={fieldsLocked}
          onChange={(value) => { void onEditWorkLine(task.id, value || null) }}
        />
      ),
    }] : []),
    {
      key: 'objective', label: t('tasks.objective'),
      children: <span className="rp-props__plain"><span className="tcf-muted">{t('tasks.create.objectiveFromWork')}</span></span>,
    },
  ]
  const needed = <span className="tcf-needed">{t('tasks.create.needed')}</span>
  const summary = (
    <>
      <span>{picPickerOptions.find((option) => option.value === task.responsible_person_id)?.label}</span>
      <span>{teamMissing ? needed : teamPickerOptions.find((option) => option.value === task.team_id)?.label}</span>
      <span>{supervisorMissing ? needed : supervisorPickerOptions.find((option) => option.value === task.accountable_person_id)?.label}</span>
    </>
  )

  const cancelButton = <button type="button" className="btn btn-outline" disabled={pending} onClick={onCancel}>{t('common.cancel')}</button>
  const createButton = (
    <button
      type="submit"
      form={formId}
      className={`btn ${ready ? 'btn-primary' : 'btn-outline'}`}
      disabled={pending || offline}
      aria-busy={pending || undefined}
      aria-describedby={offline ? offlineReasonId : undefined}
    >
      {pending ? t('tasks.create.submitting') : t('tasks.create.submit')}
    </button>
  )

  return (
    <>
    <form
      id={formId}
      ref={formRef}
      className="tcf rp rp--page"
      data-record-kind="task"
      aria-label={t('tasks.create.form')}
      onSubmit={(event) => { event.preventDefault(); trySubmit() }}
    >
      <div className="rp-head tcf-head">
        <div className="rp-title tcf-title-field">
          <label htmlFor={titleId} className="sr-only">{t('tasks.create.title')}</label>
          <textarea
            id={titleId}
            ref={titleRef}
            className="tcf-title"
            data-escape-layer="nested"
            rows={1}
            maxLength={TASK_TITLE_MAX_LENGTH}
            value={title}
            placeholder={t('tasks.create.untitled')}
            disabled={fieldsLocked}
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? titleErrorId : undefined}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => setTitleTouched(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                // Enter moves to the next entry (EN7); it never submits. Create is the button.
                event.preventDefault()
                event.stopPropagation()
                document.getElementById(teamFieldId)?.focus()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                if (!pending) onCancel()
              }
              // Tab is left to native focus movement.
            }}
          />
          {titleError && <p id={titleErrorId} role="alert" className="tcf-error">{titleError}</p>}
        </div>
        {phoneBar ? null : <div className="rp-head__primary tcf-actions">{cancelButton}{createButton}</div>}
      </div>
      <p className="tcf-draftnote">{t('tasks.create.draftNote')}</p>
      {offline && !phoneBar ? <p id={offlineReasonId} role="status" className="tcf-error">{t('tasks.create.offline')}</p> : null}

      {linkError && (
        <p role="alert" className="tcf-error tcf-save-error">
          {t('tasks.create.linkFailed')}
          <button type="button" className="task-row-retry" onClick={() => onRetryLink?.(title.trim())}>{t('record.field.retry')}</button>
        </p>
      )}
      {saveError && (
        <p role="alert" className="tcf-error tcf-save-error">
          {t('record.field.saveError')}
          <button type="button" className="task-row-retry" onClick={trySubmit}>{t('record.field.retry')}</button>
        </p>
      )}

      <RecordProperties rows={rows} summary={summary} unfold={unfold} />

      {/* The document slot: unboxed, no heading, one element another editor can replace. */}
      <section className="task-description-section" aria-label={t('tasks.description.title')}>
        <Suspense fallback={<LoadingShell label={t('tasks.document.loading')} />}>
          <TaskDraftDescription body={body} canEdit={!fieldsLocked} onChange={setBody} />
        </Suspense>
      </section>
    </form>
    {phoneBar ? (
      <ActionBar
        reason={offline ? t('tasks.create.offline') : undefined}
        reasonId={offlineReasonId}
        secondary={cancelButton}
        primary={createButton}
      />
    ) : null}
    </>
  )
}
