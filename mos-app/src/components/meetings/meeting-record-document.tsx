// A Meeting as one record page (panel and full page): title, the properties block, the minutes slot, then
// Details and History. `id` null is a new meeting: a blank page with defaults that becomes the record once created.
// The database decides who can read (a Private Meeting the viewer is not in is simply absent: the generic
// "can't open" message) and who can edit; `canEditMeeting` mirrors that rule only to show or hide controls.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useHref, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { Toast } from '@/components/admin/toast'
import { useToast } from '@/components/admin/use-toast'
import { RecordHistory } from '@/components/catalog/record-history'
import { RecordPageHeader } from '@/components/record/record-page-header'
import { RecordAbout, RecordDisclosure, RecordPageLayout, RecordPageSkeleton } from '@/components/record/record-page-layout'
import type { RecordMenuItem } from '@/components/record/record-menu'
import type { RecordValue } from '@/components/records/record-viewer.types'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { OfflineNotice } from '@/components/ui/offline-notice'
import { EmptyState, ErrorState } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { copyCanonicalLink } from '@/lib/copy-canonical-link'
import {
  addAttendee, createMeeting, getMeeting, removeAttendee, startNextMeeting, updateMeetingFields,
} from '@/lib/db/meetings'
import type { MeetingDetail } from '@/lib/db/meetings.types'
import { countRecordHistory } from '@/lib/db/record-history'
import { useIsOffline } from '@/shell/use-is-offline'
import { loadMeetingContext, nameOf, pickableTeams, type MeetingContext } from './meeting-context'
import { canChangeMeetingPrivacy, canEditMeeting } from './meeting-format'
import { MeetingMinutesSlot } from './meeting-minutes-slot'
import { MeetingProperties, type MeetingPropertyValues } from './meeting-properties'
import './meeting-record.css'

export type MeetingRecordDocumentProps = {
  /** null opens a new meeting (the draft). */
  id: string | null
  mode: 'panel' | 'page'
  /** Open another meeting (Previous, Next, a new next meeting) in the host's own way; omitted = navigate. */
  onOpenMeeting?: (id: string) => void
  onTitleResolved?: (title: string) => void
  /** A saved change the list behind this record should pick up. */
  onChanged?: () => void
  /** The draft became a record. */
  onCreated?: (id: string) => void
  onCancelCreate?: () => void
  onDirtyChange?: (dirty: boolean) => void
}

type Directory = { status: 'loading' } | { status: 'error' } | { status: 'ready'; ctx: MeetingContext }

/** The viewer and the directory the record needs; one load for the draft and the record alike. */
function useMeetingDirectory(): { viewerId: string | null; isAdmin: boolean; directory: Directory; retry: () => void } {
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const isAdmin = auth.status === 'authenticated' && auth.viewer.accessRoles.includes('admin')
  const [directory, setDirectory] = useState<Directory>({ status: 'loading' })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    if (!viewerId) return
    let live = true
    setDirectory({ status: 'loading' })
    loadMeetingContext(viewerId).then(
      (ctx) => { if (live) setDirectory({ status: 'ready', ctx }) },
      () => { if (live) setDirectory({ status: 'error' }) },
    )
    return () => { live = false }
  }, [viewerId, nonce])
  return { viewerId, isAdmin, directory, retry: () => setNonce((n) => n + 1) }
}

export function MeetingRecordDocument(props: MeetingRecordDocumentProps) {
  return props.id ? <ExistingMeeting {...props} id={props.id} /> : <DraftMeeting {...props} />
}

function MeetingNoAccess({ mode }: { mode: 'panel' | 'page' }) {
  const t = useT()
  return (
    <EmptyState
      variant="blank"
      title={t('meetings.noAccess.title')}
      copy={t('meetings.noAccess.body')}
      headingLevel={mode === 'page' ? 1 : 2}
      autoFocus
    />
  )
}

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'denied' }
  | { status: 'ready'; meeting: MeetingDetail }

function ExistingMeeting({ id, mode, onOpenMeeting, onTitleResolved, onChanged }: MeetingRecordDocumentProps & { id: string }) {
  const t = useT()
  const navigate = useNavigate()
  const canonicalHref = useHref(`/work/meetings/${id}`)
  const { toast, showToast, clearToast } = useToast()
  const { viewerId, isAdmin, directory, retry: retryDirectory } = useMeetingDirectory()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [nonce, setNonce] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [historyCount, setHistoryCount] = useState<number | undefined>(undefined)
  const [historyVersion, setHistoryVersion] = useState(0)
  const titleResolved = useRef(onTitleResolved)
  titleResolved.current = onTitleResolved

  useEffect(() => {
    let live = true
    setLoad({ status: 'loading' })
    getMeeting(id).then(
      (meeting) => {
        if (!live) return
        setLoad(meeting ? { status: 'ready', meeting } : { status: 'denied' })
        if (meeting) titleResolved.current?.(meeting.title)
      },
      () => { if (live) setLoad({ status: 'error' }) },
    )
    return () => { live = false }
  }, [id, nonce])

  const ready = load.status === 'ready' && directory.status === 'ready'
  useEffect(() => {
    if (!ready) return
    let live = true
    countRecordHistory('meetings', id).then((count) => { if (live) setHistoryCount(count) }, () => {})
    return () => { live = false }
  }, [id, ready, historyVersion])

  if (load.status === 'denied') return <MeetingNoAccess mode={mode} />
  if (load.status === 'error' || directory.status === 'error') {
    return <ErrorState message={t('meetings.record.error')} onRetry={() => { setNonce((n) => n + 1); retryDirectory() }} />
  }
  if (load.status !== 'ready' || directory.status !== 'ready') return <RecordPageSkeleton label={t('meetings.record.loading')} />

  const { meeting } = load
  const ctx = directory.ctx
  const editable = canEditMeeting({ meeting, viewerId, viewerTeamIds: ctx.viewerTeamIds, isAdmin })
  const headingLevel = mode === 'page' ? 1 : 2
  const apply = (patch: Partial<MeetingDetail>) => {
    setLoad((current) => (current.status === 'ready' ? { status: 'ready', meeting: { ...current.meeting, ...patch } } : current))
    setHistoryVersion((version) => version + 1)
    onChanged?.()
  }
  // Runs one write; a failure becomes the notice under the title and the page keeps its old values.
  const save = async (write: () => Promise<void>, patch: Partial<MeetingDetail>): Promise<boolean> => {
    setNotice(null)
    try { await write(); apply(patch); return true } catch { setNotice(t('meetings.saveError')); return false }
  }
  const field = (patch: Parameters<typeof updateMeetingFields>[1], local: Partial<MeetingDetail>) =>
    save(() => updateMeetingFields(id, patch), local)

  const openMeeting = (meetingId: string) => { if (onOpenMeeting) onOpenMeeting(meetingId); else navigate(`/work/meetings/${meetingId}`) }
  const startNext = async () => {
    setStarting(true)
    setNotice(null)
    try {
      const nextId = await startNextMeeting(id)
      onChanged?.()
      openMeeting(nextId)
    } catch {
      setNotice(t('meetings.series.startError'))
    } finally {
      setStarting(false)
    }
  }

  const menu: RecordMenuItem[] = [{
    id: 'copy',
    label: t('record.copyLink'),
    onSelect: async () => {
      try {
        await copyCanonicalLink(canonicalHref)
        showToast(t('record.copyLinkSucceeded'))
      } catch {
        showToast(t('record.copyLinkFailed'))
      }
    },
  }]
  const values: MeetingPropertyValues = {
    startsAt: meeting.startsAt,
    owningTeamId: meeting.owningTeamId,
    attendeeIds: meeting.attendeeIds,
    isPrivate: meeting.isPrivate,
    workLineId: meeting.workLineId,
    objectiveId: meeting.objectiveId,
  }
  const teamName = nameOf(ctx.teams, meeting.owningTeamId) ?? ''
  const creator = ctx.people.find((person) => person.id === meeting.createdBy)?.full_name
  const details = creator ? [{ key: 'createdBy', label: t('meetings.details.createdBy'), value: creator }] : []
  const noticeNode: ReactNode = (
    <>
      {editable ? <OfflineNotice /> : null}
      {notice ? <Notice tone="attention">{notice}</Notice> : null}
    </>
  )

  return (
    <>
      <RecordPageLayout
        label={meeting.title}
        kind="meeting"
        mode={mode}
        headingLevel={headingLevel}
        header={(
          <RecordPageHeader
            title={{
              key: 'title', label: t('meetings.create.titleLabel'), control: 'text', value: meeting.title, displayValue: meeting.title,
              editable, required: true, maxLength: 200,
            }}
            headingLevel={headingLevel}
            facts={[]}
            menu={menu}
            menuLabel={t('record.moreActions')}
            menuMinItems={1}
            factsLabel={t('record.page.facts')}
            onCommitField={async (key: string, value: RecordValue) => {
              if (key !== 'title') return
              const title = String(value ?? '').trim()
              if (!title) throw new Error('title required')
              await updateMeetingFields(id, { title })
              apply({ title })
              titleResolved.current?.(title)
            }}
          />
        )}
        notice={noticeNode}
      >
        <MeetingProperties
          ctx={ctx}
          teamChoices={pickableTeams(ctx, isAdmin, values.owningTeamId)}
          value={values}
          editable={editable}
          canChangePrivacy={canChangeMeetingPrivacy({ attendeeIds: meeting.attendeeIds, viewerId, isAdmin })}
          openMeeting={openMeeting}
          series={{
            number: meeting.sequenceNumber,
            previous: meeting.previous,
            next: meeting.next,
            canStart: editable,
            starting,
            onStart: () => { void startNext() },
          }}
          onStartsAt={(iso) => field({ startsAt: iso }, { startsAt: iso })}
          onTeam={async (teamId) => { await field({ owningTeamId: teamId }, { owningTeamId: teamId }) }}
          onPrivate={async (next) => { await field({ isPrivate: next }, { isPrivate: next }) }}
          onLinked={async (next) => { await field(next, next) }}
          onAddAttendee={async (personId) => {
            await save(() => addAttendee(id, personId), { attendeeIds: [...meeting.attendeeIds, personId] })
          }}
          onRemoveAttendee={async (personId) => {
            await save(() => removeAttendee(id, personId), { attendeeIds: meeting.attendeeIds.filter((other) => other !== personId) })
          }}
        />
        {!editable ? <p className="rp-readonly meeting-readonly" role="note">{t('meetings.readOnly', { team: teamName })}</p> : null}
        <MeetingMinutesSlot meetingId={id} canEdit={editable} isPrivate={meeting.isPrivate} />
        <div className="meeting-reference">
          {details.length > 0 ? (
            <RecordDisclosure title={t('workbench.record.details')}>
              <RecordAbout items={details} />
            </RecordDisclosure>
          ) : null}
          <RecordDisclosure title={t('tasks.history.title')} count={historyCount}>
            <RecordHistory key={historyVersion} table="meetings" recordId={id} headingLevel={headingLevel} hideHeading />
          </RecordDisclosure>
        </div>
      </RecordPageLayout>
      <Toast toast={toast} onDismiss={clearToast} />
    </>
  )
}

/** A new meeting: a blank page with the viewer's defaults. Create makes it a record; Cancel discards it. */
function DraftMeeting({ mode, onCreated, onCancelCreate, onDirtyChange }: MeetingRecordDocumentProps) {
  const t = useT()
  const offline = useIsOffline()
  const { viewerId, isAdmin, directory, retry } = useMeetingDirectory()
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState<string | null>(null)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [attendeeIds, setAttendeeIds] = useState<string[]>(viewerId ? [viewerId] : [])
  const [isPrivate, setIsPrivate] = useState(false)
  const [link, setLink] = useState<{ workLineId: string | null; objectiveId: string | null }>({ workLineId: null, objectiveId: null })
  const [touched, setTouched] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const attempted = attempts > 0
  const [submitting, setSubmitting] = useState(false)
  const [failed, setFailed] = useState(false)
  const defaultTeam = directory.status === 'ready' ? directory.ctx.viewerTeamIds[0] ?? null : null
  const owningTeamId = teamId ?? defaultTeam

  useEffect(() => { onDirtyChange?.(touched) }, [onDirtyChange, touched])
  const dirtyChange = <T,>(set: (value: T) => void) => async (value: T) => { setTouched(true); set(value) }
  const ctx = useMemo(() => (directory.status === 'ready' ? directory.ctx : null), [directory])

  if (directory.status === 'error') return <ErrorState message={t('meetings.record.error')} onRetry={retry} />
  if (!ctx || !viewerId) return <RecordPageSkeleton label={t('meetings.record.loading')} />

  const titleMissing = attempted && title.trim() === ''
  const teamMissing = attempted && !owningTeamId
  const ready = title.trim() !== '' && Boolean(owningTeamId)
  const submit = async () => {
    setAttempts((n) => n + 1)
    if (!ready || !owningTeamId || submitting || offline) return
    setSubmitting(true)
    setFailed(false)
    try {
      const id = await createMeeting({
        title: title.trim(), owningTeamId, startsAt, isPrivate,
        workLineId: link.workLineId, objectiveId: link.objectiveId,
        attendeeIds: attendeeIds.filter((person) => person !== viewerId),
      })
      onCreated?.(id)
    } catch {
      setFailed(true)
    } finally {
      setSubmitting(false)
    }
  }
  const headingLevel = mode === 'page' ? 1 : 2
  const Heading = headingLevel === 1 ? 'h1' : 'h2'

  return (
    <RecordPageLayout
      label={t('meetings.new')}
      kind="meeting"
      mode={mode}
      headingLevel={headingLevel}
      header={(
        <header className="rp-head" data-record-header="true">
          <div className="rp-title">
            <Heading className="meeting-draft-title">
              <input
                className="meeting-draft-title__input"
                aria-label={t('meetings.create.titleLabel')}
                aria-invalid={titleMissing || undefined}
                placeholder={t('tasks.create.untitled')}
                value={title}
                maxLength={200}
                autoFocus
                onChange={(event) => { setTitle(event.target.value); setTouched(true) }}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void submit() } }}
              />
            </Heading>
            {titleMissing ? <p role="alert" className="meeting-draft-error">{t('meetings.create.titleRequired')}</p> : null}
          </div>
          <div className="rp-head__primary meeting-draft-actions">
            <Button variant="outline" onClick={() => onCancelCreate?.()}>{t('meetings.create.cancel')}</Button>
            <Button variant={ready ? 'primary' : 'outline'} disabled={submitting || offline} aria-busy={submitting || undefined} onClick={() => { void submit() }}>
              {submitting ? t('meetings.create.submitting') : t('meetings.create.submit')}
            </Button>
          </div>
        </header>
      )}
      notice={(
        <>
          <OfflineNotice />
          {failed ? <Notice tone="attention">{t('meetings.create.error')}</Notice> : null}
        </>
      )}
    >
      <MeetingProperties
        ctx={ctx}
        teamChoices={pickableTeams(ctx, isAdmin, owningTeamId)}
        value={{ startsAt, owningTeamId, attendeeIds, isPrivate, workLineId: link.workLineId, objectiveId: link.objectiveId }}
        editable
        pinnedAttendeeId={viewerId}
        teamNeeded={teamMissing}
        unfold={attempts}
        onStartsAt={async (iso) => { await dirtyChange(setStartsAt)(iso); return true }}
        onTeam={dirtyChange(setTeamId)}
        onPrivate={dirtyChange(setIsPrivate)}
        onLinked={dirtyChange(setLink)}
        onAddAttendee={async (personId) => { setTouched(true); setAttendeeIds((ids) => [...ids, personId]) }}
        onRemoveAttendee={async (personId) => { setTouched(true); setAttendeeIds((ids) => ids.filter((other) => other !== personId)) }}
      />
      <p className="rp-readonly meeting-draft-note">{t('meetings.create.draftNote')}</p>
    </RecordPageLayout>
  )
}
