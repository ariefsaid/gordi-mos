// TaskCreateForm — the ONE task-creation form: a real form, read top-to-bottom (Title →
// Team/PIC/Supervisor → Due/Project-Process → derived Business unit → footer actions), rendered IDENTICALLY by the
// desktop table (inside a full-width colSpan row, task-row.tsx) and the phone card
// (mobile-grouped-cards.tsx). One component, one validation contract, one a11y contract.
import { useEffect, useId, useRef, useState } from 'react'
import { Picker } from '@/components/ui/picker'
import { DateField } from '@/components/ui/date-field'
import { useFocusRestore } from '@/components/ui/use-focus-restore'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { useTaskCreateContext } from './task-create-context'
import { picLockMessage } from './task-permissions'
import { TASK_TITLE_MAX_LENGTH } from './task-formatters'
import type { TaskTeamOption } from './task-row'
import './task-create-form.css'

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
  onCreate: (title: string) => Promise<void>
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
  const { workLineOptions, onEditDue, onEditWorkLine, onTitleChange, formState, onFormStateChange } = useTaskCreateContext()

  const [localTitle, setLocalTitle] = useState(task.title)
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
  const teamError = attempted && (!task.team_id || !task.business_unit_id) ? t('tasks.create.teamRequired') : undefined
  const supervisorError = attempted && !task.accountable_person_id ? t('tasks.create.supervisorRequired') : undefined
  const lockMessage = picLockMessage(!viewerHasNoDownline, locale)

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
  ]

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
    const trimmed = title.trim()
    if (!trimmed) { titleRef.current?.focus(); return }
    if (!task.team_id || !task.business_unit_id) { document.getElementById(teamFieldId)?.focus(); return }
    if (!task.accountable_person_id) { document.getElementById(supervisorFieldId)?.focus(); return }
    if (dueInvalid) { document.getElementById(dueFieldId)?.focus(); return }
    if (pending) return
    setSaveError(false)
    setPending(true)
    void onCreate(trimmed).then(
      () => setPending(false),
      () => { setPending(false); setSaveError(true) },
    )
  }

  return (
    <form
      ref={formRef}
      className="tcf"
      aria-label={t('tasks.create.form')}
      onSubmit={(event) => { event.preventDefault(); trySubmit() }}
    >
      <div className="tcf-field tcf-field--title">
        <label htmlFor={titleId} className="tcf-label">{t('tasks.create.title')}</label>
        <textarea
          id={titleId}
          ref={titleRef}
          className="tcf-title tap-floor"
          data-escape-layer="nested"
          rows={1}
          maxLength={TASK_TITLE_MAX_LENGTH}
          value={title}
          placeholder={t('tasks.create.titlePlaceholder')}
          disabled={fieldsLocked}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? titleErrorId : undefined}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => setTitleTouched(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              event.stopPropagation()
              trySubmit()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              if (!pending) onCancel()
            }
            // Tab is left to native focus movement.
          }}
        />
        <div className="tcf-title-error-slot">
          {titleError && <p id={titleErrorId} role="alert" className="tcf-error">{titleError}</p>}
        </div>
      </div>

      <div className="tcf-row">
        <div className="tcf-field">
          <label htmlFor={teamFieldId} className="tcf-label">
            <span>{t('tasks.team')}</span> <span className="tcf-required" aria-hidden="true">*</span>
          </label>
          <Picker
            id={teamFieldId}
            label={t('tasks.team')}
            hideLabel
            value={task.team_id ?? ''}
            options={teamPickerOptions}
            placeholder={t('tasks.create.teamPlaceholder')}
            disabled={fieldsLocked || teamOptions.length === 0}
            required
            error={Boolean(teamError)}
            describedBy={teamError ? teamErrorId : undefined}
            onChange={(value) => { void onEditTeam(task.id, value) }}
          />
          {teamError && <p id={teamErrorId} role="alert" className="tcf-error">{teamError}</p>}
          <p className="tcf-hint" data-testid="task-create-derived-bu">
            {t('tasks.filter.businessUnit')}: {businessUnitName || '—'}
          </p>
        </div>
        <div className="tcf-field">
          <label htmlFor={picFieldId} className="tcf-label">{t('tasks.pic')}</label>
          <Picker
            id={picFieldId}
            label={t('tasks.pic')}
            hideLabel
            value={task.responsible_person_id}
            options={picPickerOptions}
            disabled={fieldsLocked}
            onChange={(value) => { void onEditPic(task.id, value) }}
          />
          {lockMessage && <p className="tcf-hint">{lockMessage}</p>}
        </div>
        <div className="tcf-field">
          <label htmlFor={supervisorFieldId} className="tcf-label">
            <span>{t('tasks.supervisor')}</span> <span className="tcf-required" aria-hidden="true">*</span>
          </label>
          <Picker
            id={supervisorFieldId}
            label={t('tasks.supervisor')}
            hideLabel
            value={task.accountable_person_id}
            options={supervisorPickerOptions}
            placeholder={t('tasks.create.supervisorPlaceholder')}
            disabled={fieldsLocked}
            required
            error={Boolean(supervisorError)}
            describedBy={supervisorError ? supervisorErrorId : undefined}
            onChange={(value) => { void onEditSupervisor(task.id, value) }}
          />
          {supervisorError && <p id={supervisorErrorId} role="alert" className="tcf-error">{supervisorError}</p>}
        </div>
      </div>

      <div className="tcf-row tcf-row--pair">
        <div className="tcf-field">
          <label htmlFor={dueFieldId} className="tcf-label">{t('tasks.create.dueDate')}</label>
          <DateField
            draftText={formState?.dueText}
            onDraftTextChange={(dueText) => onFormStateChange?.({ dueText })}
            id={dueFieldId}
            fullWidth
            value={task.due_date ?? ''}
            disabled={fieldsLocked}
            reveal={attempted}
            onChange={(value) => { void onEditDue(task.id, value || null) }}
            onValidityChange={setDueInvalid}
          />
        </div>
        {workLineOptions.length > 0 && (
          <div className="tcf-field">
            <label htmlFor={workLineFieldId} className="tcf-label">{t('tasks.filter.projectProcess')}</label>
            <Picker
              id={workLineFieldId}
              label={t('tasks.filter.projectProcess')}
              hideLabel
              value={task.work_line_id ?? ''}
              options={workLinePickerOptions}
              disabled={fieldsLocked}
              onChange={(value) => { void onEditWorkLine(task.id, value || null) }}
            />
          </div>
        )}
      </div>

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

      <div className="tcf-foot">
        <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending || undefined}>
          {pending ? t('tasks.create.submitting') : t('tasks.create.submit')}
        </button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={onCancel}>{t('common.cancel')}</button>
      </div>
    </form>
  )
}
