import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '@/i18n/I18nProvider'
import { getPeople, type PersonOption } from '@/lib/db/directory'
import { cancelRun, completeRun, listPendingTasks } from '@/lib/db/processes'
import type { PendingTaskRow, ProcessOccurrenceSummary } from '@/lib/db/processes.types'
import { formatDayMonthYear } from '@/lib/format/date'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { ModalShell } from '@/components/ui/modal-shell'
import { TextInput } from '@/components/ui/text-input'
import { OccurrenceAssignDialog } from '@/components/tasks/occurrence-assign-dialog'
import { RecordDisclosure } from '@/components/record/record-page-layout'
import { DueRunsList } from './due-runs-list'
import { useProcessOccurrences, type ProcessOccurrencesData } from './use-process-occurrences'
import './process-occurrence-controls.css'

export type ProcessOccurrenceControlsProps = {
  // The Process work-line id. All occurrence reads and starts are scoped from this id.
  workLineId: string
  // The detail knows whether the Process has an active step definition to materialize.
  setupIncomplete?: boolean
  // Managers can configure the definition; members need to route setup to a manager.
  canManageSetup?: boolean
  // Optional in-app navigation hook; the canonical href remains for refresh/new-tab behavior.
  onViewTasks?: (runId: string) => void
  onChanged?: () => void
  // The occurrence data when the host owns the fetch; without it the controls read their own.
  data?: ProcessOccurrencesData
}

type Confirmation = { kind: 'complete' | 'cancel'; run: ProcessOccurrenceSummary }

export function ProcessOccurrenceControls({ workLineId, setupIncomplete = false, canManageSetup = false, onViewTasks, onChanged, data }: ProcessOccurrenceControlsProps) {
  const t = useT()
  const { locale } = useI18n()
  // A host that lifts the occurrence data (the record header shows the Start primary) passes it in.
  const fetched = useProcessOccurrences(data ? null : workLineId, onChanged)
  const { state, occurrences, startable, startableTeamIds, closableRunIds, authorityError, startingKey, startError, actionError, setActionError, load, retry } = data ?? fetched
  const handleStart = (data ?? fetched).start

  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [confirmationError, setConfirmationError] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [assignRunId, setAssignRunId] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingTaskRow[]>([])
  const [pendingPeople, setPendingPeople] = useState<PersonOption[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingError, setPendingError] = useState(false)
  const mountedRef = useRef(true)
  const assignGenerationRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  function openAssign(runId: string) {
    const generation = ++assignGenerationRef.current
    setAssignRunId(runId)
    setPendingLoading(true)
    setPendingError(false)
    Promise.all([listPendingTasks(runId), getPeople()])
      .then(([rows, people]) => {
        if (!mountedRef.current || assignGenerationRef.current !== generation) return
        setPending(rows)
        setPendingPeople(people)
        setPendingLoading(false)
      })
      .catch(() => {
        if (!mountedRef.current || assignGenerationRef.current !== generation) return
        setPendingError(true)
        setPendingLoading(false)
      })
  }

  function closeAssign() {
    assignGenerationRef.current += 1
    setAssignRunId(null)
  }

  function handlePendingResolved(_taskId: string, pendingId: string) {
    const next = pending.filter((row) => row.id !== pendingId)
    setPending(next)
    if (next.length === 0) closeAssign()
    void load()
    onChanged?.()
  }

  function openConfirmation(kind: Confirmation['kind'], summary: ProcessOccurrenceSummary) {
    setConfirmation({ kind, run: summary })
    setCancelReason('')
    setConfirmationError(false)
    setActionError(false)
  }

  async function confirmAction() {
    if (!confirmation) return
    if (confirmation.kind === 'cancel' && !cancelReason.trim()) {
      setConfirmationError(true)
      return
    }
    setActionBusy(true)
    setConfirmationError(false)
    setActionError(false)
    try {
      if (confirmation.kind === 'complete') await completeRun(confirmation.run.run.id)
      else await cancelRun(confirmation.run.run.id, cancelReason.trim())
      if (!mountedRef.current) return
      setConfirmation(null)
      await load()
      if (mountedRef.current) onChanged?.()
    } catch {
      if (mountedRef.current) setActionError(true)
    } finally {
      if (mountedRef.current) setActionBusy(false)
    }
  }

  if (state === 'loading') return <LoadingShell count={2} label={t('processes.occurrence.loading')} />
  if (state === 'error') {
    return <ErrorState message={t('processes.occurrence.error')} onRetry={retry} />
  }

  const current = occurrences.filter(({ run }) => run.status === 'open')
  const past = occurrences.filter(({ run }) => run.status !== 'open')
  const missingNextRun = !setupIncomplete && startable.length === 0 && current.length === 0

  const renderOccurrence = (summary: ProcessOccurrenceSummary) => {
    const { run, rollup } = summary
    const closeAllowed = run.status === 'open' && closableRunIds.has(run.id)
    const statusLabel = run.status === 'open'
      ? t('processes.occurrence.status.open')
      : run.status === 'completed'
        ? t('processes.occurrence.status.completed')
        : t('processes.occurrence.status.cancelled')
    return (
      <li key={run.id} className="process-occurrence-controls__item">
        <div className="process-occurrence-controls__identity">
          <h4>{formatDayMonthYear(run.scheduled_date, locale)}</h4>
          <p>{summary.team_name} · {statusLabel}</p>
        </div>
        <div className="process-occurrence-controls__counts tabular-nums" aria-label={t('processes.occurrence.countsLabel')}>
          <span>{t('processes.occurrence.tasks', { count: rollup.total })}</span>
          <span>{t('processes.occurrence.overdue', { count: rollup.overdue })}</span>
          <span>{t('processes.occurrence.toAssign', { count: rollup.pending_unresolved })}</span>
        </div>
        <div className="process-occurrence-controls__actions">
          <Link
            className="btn btn-outline"
            to={`/work/tasks?occurrence=${encodeURIComponent(run.id)}`}
            onClick={(event) => {
              if (!onViewTasks) return
              event.preventDefault()
              onViewTasks(run.id)
            }}
          >
            {t('processes.occurrence.viewTasks')}
          </Link>
          {run.status === 'open' && startableTeamIds.has(run.owning_team_id) && rollup.pending_unresolved > 0 ? (
            <Button variant="outline" onClick={() => openAssign(run.id)}>
              {t('processes.occurrence.toAssign', { count: rollup.pending_unresolved })}
            </Button>
          ) : null}
          {closeAllowed ? (
            <>
              <Button variant={startable.length === 0 && current.length === 1 ? 'primary' : 'outline'} onClick={() => openConfirmation('complete', summary)}>
                {t('processes.occurrence.complete')}
              </Button>
              <Button variant="destructive" onClick={() => openConfirmation('cancel', summary)}>
                {t('processes.occurrence.cancel')}
              </Button>
            </>
          ) : null}
        </div>
      </li>
    )
  }

  return (
    <div className="process-occurrence-controls">
      {authorityError || actionError ? (
        <div className="process-occurrence-controls__header">
          {authorityError ? <ErrorState message={t('processes.occurrence.authorityError')} onRetry={retry} /> : null}
          {actionError ? <ErrorState message={t('processes.occurrence.actionError')} /> : null}
        </div>
      ) : null}

      {setupIncomplete && !canManageSetup ? (
        <p className="process-occurrence-controls__next-action" role="note">
          {t('processes.occurrence.setupIncomplete.member')}
        </p>
      ) : missingNextRun ? (
        <p className="process-occurrence-controls__next-action" role="note">{t('processes.occurrence.nextActionMissing')}</p>
      ) : null}

      {!setupIncomplete && startable.length > 0 ? (
        <section className="process-occurrence-controls__start" aria-labelledby="process-occurrence-start-title">
          <h4 id="process-occurrence-start-title">{t('processes.occurrence.ready')}</h4>
          <DueRunsList
            due={startable}
            expanded
            startingKey={startingKey}
            startError={startError && !data}
            context="process-record"
            onStart={handleStart}
          />
        </section>
      ) : null}

      {current.length > 0 ? (
        <ul className="process-occurrence-controls__list">
          {current.map(renderOccurrence)}
        </ul>
      ) : null}

      {past.length > 0 ? (
        <RecordDisclosure title={t('processes.occurrence.past')} count={past.length}>
          <ul className="process-occurrence-controls__list">
            {past.map(renderOccurrence)}
          </ul>
        </RecordDisclosure>
      ) : null}

      {assignRunId ? (
        <OccurrenceAssignDialog
          occurrenceCaption={occurrences.find(({ run }) => run.id === assignRunId)?.run.caption}
          pending={pending}
          people={pendingPeople}
          loading={pendingLoading}
          error={pendingError}
          onRetry={() => openAssign(assignRunId)}
          onResolved={handlePendingResolved}
          onClose={closeAssign}
        />
      ) : null}

      <ModalShell
        open={Boolean(confirmation)}
        onClose={() => { if (!actionBusy) setConfirmation(null) }}
        ariaLabel={confirmation?.kind === 'cancel' ? t('processes.occurrence.cancelConfirmTitle') : t('processes.occurrence.completeConfirmTitle')}
        role={confirmation?.kind === 'cancel' ? 'alertdialog' : 'dialog'}
        closeOnBackdrop={false}
      >
        {confirmation ? (
          <div className="process-occurrence-controls__confirm">
            <h3>{confirmation.kind === 'cancel' ? t('processes.occurrence.cancelConfirmTitle') : t('processes.occurrence.completeConfirmTitle')}</h3>
            <p>{confirmation.kind === 'cancel' ? t('processes.occurrence.cancelConfirmCopy') : t('processes.occurrence.completeConfirmCopy')}</p>
            {confirmation.kind === 'cancel' ? (
              <TextInput
                label={t('processes.occurrence.cancelReason')}
                placeholder={t('processes.occurrence.cancelReasonPlaceholder')}
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                error={confirmationError}
                fullWidth
                disabled={actionBusy}
              />
            ) : null}
            {confirmationError ? <p className="process-occurrence-controls__confirm-error" role="alert">{t('processes.occurrence.cancelReasonError')}</p> : null}
            <div className="process-occurrence-controls__confirm-actions">
              <Button
                variant={confirmation.kind === 'cancel' ? 'destructive' : 'primary'}
                disabled={actionBusy}
                aria-busy={actionBusy}
                onClick={() => { void confirmAction() }}
              >
                {confirmation.kind === 'cancel' ? t('processes.occurrence.cancel') : t('processes.occurrence.complete')}
              </Button>
              <Button variant="ghost" disabled={actionBusy} onClick={() => setConfirmation(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : null}
      </ModalShell>
    </div>
  )
}
