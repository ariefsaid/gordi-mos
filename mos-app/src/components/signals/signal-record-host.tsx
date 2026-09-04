import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import {
  getSignal, listSignalRevisions, listAllTeams, getTeamSite, correctSignal, acknowledgeSignal,
  linkSignalTask, createFollowUpTask, loadMentionRosters, dedupeRecipients, summarizeLinkedTasks,
  type SignalDetail, type SignalRevisionRow, type MentionRosters,
} from '@/lib/db/signals'
import type { Attention, SignalCategory, StagedMention } from '@/lib/db/signals.types'
import type { TeamOption } from '@/lib/db/signals.types'
import { getBusinessUnits, getPeople, type BusinessUnitOption, type PersonOption } from '@/lib/db/directory'
import { listTasks } from '@/lib/db/tasks'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { listComments, postComment, type CommentRow } from '@/lib/comments/postComment'
import { formatWibDateTime } from '@/lib/wib-time'
import {
  SignalReach, SignalDiscussion, SignalFacts, SignalHistory, type SignalMentionView,
} from './signal-record'
import { RecordViewer } from '@/components/records/record-viewer'
import { wrapSignalRecord, firstLine } from './signal-record-adapter'
import './signal-record-host.css'

// C3 (KNOWN GAP 2): signal-record.tsx is a set of presentational region renderers — this host is
// the fetch+mutate layer for the Signal record. It builds the five JTBD region nodes (Message /
// Reach & response / Discussion / Facts / History — docs/specs/record-page-anatomy.spec.md §2.1)
// and hands them to wrapSignalRecord, which orders them into the shared RecordViewer's content
// slots. It is the CONTENT of the shared RecordPanelHost (chrome-free: the host owns the
// ✕ Close / "Open full page" / modal regime; the STANDALONE page owns the Back via the shared
// RecordPageChrome). `mode` mirrors the Task renderer: "panel" (in-list drawer) or "page".

export interface SignalRecordHostProps {
  signalId: string
  /** panel = in-list split drawer content; page = standalone canonical record page (OD-63/Rule 4). */
  mode?: 'panel' | 'page'
  /** Lets a page host reflect the record's resolved name (breadcrumb / Ask-Deputy seed). */
  onTitleResolved?: (title: string) => void
}

type FetchState = 'loading' | 'ready' | 'error'

function personName(people: PersonOption[], id: string, fallback: string): string {
  return people.find((p) => p.id === id)?.full_name ?? fallback
}

export function SignalRecordHost({ signalId, mode = 'panel', onTitleResolved }: SignalRecordHostProps) {
  const t = useT()
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const { locale } = useI18n()

  const [state, setState] = useState<FetchState>('loading')
  const [detail, setDetail] = useState<SignalDetail | null>(null)
  const [revisions, setRevisions] = useState<SignalRevisionRow[]>([])
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [siteName, setSiteName] = useState<string | null>(null)
  const [businessUnits, setBusinessUnits] = useState<BusinessUnitOption[]>([])
  const [people, setPeople] = useState<PersonOption[]>([])
  const [tasks, setTasks] = useState<TaskListRow[]>([])
  const [comments, setComments] = useState<CommentRow[]>([])
  const [rosters, setRosters] = useState<MentionRosters>({ teamMembers: {}, buMembers: {} })

  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [followUpTitle, setFollowUpTitle] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkTaskId, setLinkTaskId] = useState('')

  const load = useCallback(() => {
    let cancelled = false
    setState('loading')
    getSignal(signalId)
      .then(async (loadedDetail) => {
        if (cancelled) return
        const [revs, teamRows, bus, ppl, taskRows, commentRows, mentionRosters, site] = await Promise.all([
          listSignalRevisions(signalId),
          listAllTeams(),
          getBusinessUnits(),
          getPeople(),
          listTasks({}),
          listComments({ entityType: 'signal', entityId: signalId }),
          loadMentionRosters(),
          getTeamSite(loadedDetail.signal.owning_team_id),
        ])
        if (cancelled) return
        setDetail(loadedDetail)
        setRevisions(revs)
        setTeams(teamRows)
        setBusinessUnits(bus)
        setPeople(ppl)
        setTasks(taskRows)
        setComments(commentRows)
        setRosters(mentionRosters)
        setSiteName(site?.name ?? null)
        setState('ready')
      })
      .catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true }
  }, [signalId])

  useEffect(() => load(), [load])

  // Reflect the resolved record name to a page host (breadcrumb / Ask-Deputy seed).
  useEffect(() => {
    if (detail) onTitleResolved?.(firstLine(detail.signal.body))
  }, [detail, onTitleResolved])

  if (state === 'loading') {
    return (
      <div role="status" aria-label="Loading" aria-busy="true">
        <SkeletonRows count={4} />
      </div>
    )
  }
  if (state === 'error' || !detail) {
    return <ErrorState message={t('signals.archive.error')} onRetry={load} />
  }

  const { signal, mentions, acknowledgements, tasks: taskLinks } = detail
  const team = teams.find((tm) => tm.id === signal.owning_team_id) ?? null
  const businessUnitName = team ? businessUnits.find((bu) => bu.id === team.business_unit_id)?.name ?? null : null
  const teamName = team?.name ?? ''

  const activeMentions = mentions.filter((m) => !m.revoked_at)
  const mentionViews: SignalMentionView[] = activeMentions.map((m) => {
    if (m.mention_kind === 'person') return { kind: 'person', label: personName(people, m.target_person_id ?? '', t('signals.card.unknownAuthor')) }
    if (m.mention_kind === 'team') return { kind: 'team', label: teams.find((tm) => tm.id === m.target_team_id)?.name ?? '' }
    return { kind: 'bu', label: businessUnits.find((bu) => bu.id === m.target_bu_id)?.name ?? '' }
  })

  const staged: StagedMention[] = activeMentions.map((m) => ({
    kind: m.mention_kind,
    targetId: (m.target_person_id ?? m.target_team_id ?? m.target_bu_id) as string,
    label: '',
  }))
  const notifyCount = dedupeRecipients(staged, rosters.teamMembers, rosters.buMembers)
  // SR-1: notify count carries its noun (owner ruling "notify N people"); noun resolved in-locale.
  const notifyNoun = t(notifyCount === 1 ? 'signals.notify.person' : 'signals.notify.people')
  const shieldLine = !teamName ? undefined : notifyCount > 0
    ? t('signals.composer.visibleToNotify', { team: teamName, count: notifyCount, noun: notifyNoun })
    : t('signals.composer.visibleTo', { team: teamName })

  const statusById = Object.fromEntries(tasks.map((task) => [task.id, task.status]))
  const linkedTasksSummary = summarizeLinkedTasks(taskLinks, statusById)
  const linkedTaskIds = new Set(taskLinks.map((link) => link.task_id))
  const linkableTasks = tasks.filter((task) => !linkedTaskIds.has(task.id))

  async function handleAcknowledge() {
    await acknowledgeSignal(signalId)
    load()
  }

  async function handleCategorize(category: SignalCategory) {
    await correctSignal(signalId, { category })
    load()
  }

  async function handleAttentionChange(attention: Attention) {
    await correctSignal(signalId, { attention })
    load()
  }

  async function handlePostComment(body: string) {
    const actorId = auth.status === 'authenticated' ? auth.viewer.person.id : ''
    const actorName = auth.status === 'authenticated' ? auth.viewer.person.full_name : ''
    await postComment({ entityType: 'signal', entityId: signalId, body, actorId, actorName, locale })
    setComments(await listComments({ entityType: 'signal', entityId: signalId }))
  }

  function toggleFollowUp() {
    if (followUpOpen) { setFollowUpOpen(false); return }
    setFollowUpTitle(signal.body)
    setFollowUpOpen(true)
  }

  async function submitFollowUp() {
    if (!viewerId || !team || !followUpTitle.trim()) return
    await createFollowUpTask(signalId, {
      title: followUpTitle.trim(),
      businessUnitId: team.business_unit_id,
      responsiblePersonId: viewerId,
      accountablePersonId: viewerId,
      createdBy: viewerId,
    })
    setFollowUpOpen(false)
    setFollowUpTitle('')
    load()
  }

  async function submitLink() {
    if (!linkTaskId) return
    await linkSignalTask(signalId, linkTaskId)
    setLinkOpen(false)
    setLinkTaskId('')
    load()
  }

  const revisionViews = revisions.map((rev) => ({
    id: rev.id, field: rev.field, old_value: rev.old_value, new_value: rev.new_value,
    created_at: rev.created_at, actorName: personName(people, rev.actor_id, t('signals.card.unknownAuthor')),
  }))
  const hasAcknowledged = !!viewerId && acknowledgements.some((ack) => ack.person_id === viewerId)

  // The toggled create-follow-up / link-existing forms live inside the Reach action register so a
  // form opens beside the action that spawned it (not orphaned at the foot of the document).
  const actionForms = (
    <>
      {followUpOpen && (
        <form
          className="signal-record-followup-form"
          aria-label={t('signals.record.createFollowUpTask')}
          onSubmit={(e) => { e.preventDefault(); void submitFollowUp() }}
        >
          <input
            aria-label={t('signals.record.followUpTitleLabel')}
            value={followUpTitle}
            onChange={(e) => setFollowUpTitle(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={!followUpTitle.trim()}>
            {t('signals.record.followUpSave')}
          </Button>
        </form>
      )}
      {linkOpen && (
        linkableTasks.length === 0 ? (
          <EmptyState title={t('signals.record.noLinkableTasks')} />
        ) : (
          <form
            className="signal-record-link-form"
            aria-label={t('signals.record.linkExistingTask')}
            onSubmit={(e) => { e.preventDefault(); void submitLink() }}
          >
            <Select
              label={t('signals.record.existingTaskLabel')}
              value={linkTaskId}
              onChange={(e) => setLinkTaskId(e.target.value)}
            >
              <option value="">{t('signals.record.existingTaskPlaceholder')}</option>
              {linkableTasks.map((task) => (
                <option key={task.id} value={task.id}>{task.title}</option>
              ))}
            </Select>
            <Button type="submit" variant="primary" disabled={!linkTaskId}>
              {t('signals.record.linkSave')}
            </Button>
          </form>
        )
      )}
    </>
  )

  // ── The five JTBD region nodes (retracted ⇒ reach/discussion/history drop; message tombstone +
  // Facts survive so provenance stays legible, mirroring an archived Task's ownership fields). ──
  const retracted = signal.retracted_at !== null
  // mos._guard_signals (20260805000006) treats attention as AUTHOR-ONLY content — a signal.retract
  // holder who isn't the author gets 42501 — so the editor is offered to the author alone
  // (DESIGN.md: do not render edit affordances that cannot succeed).
  const onAttentionChange = !retracted && signal.author_id === viewerId
    ? (attention: Attention) => { void handleAttentionChange(attention) }
    : undefined
  const reach = retracted ? null : (
    <SignalReach
      mentions={mentionViews}
      shieldLine={shieldLine}
      canAcknowledge
      hasAcknowledged={hasAcknowledged}
      onAcknowledge={() => { void handleAcknowledge() }}
      acknowledgements={acknowledgements.map((ack) => ({
        personId: ack.person_id, personName: personName(people, ack.person_id, t('signals.card.unknownAuthor')),
      }))}
      linkedTasksSummary={linkedTasksSummary}
      onCreateFollowUpTask={toggleFollowUp}
      onLinkExistingTask={() => setLinkOpen((open) => !open)}
      actionForms={actionForms}
    />
  )
  const discussion = retracted ? null : (
    <SignalDiscussion
      comments={comments}
      people={people}
      canComment={!!viewerId}
      onPostComment={handlePostComment}
    />
  )
  const facts = (
    <SignalFacts
      authorName={personName(people, signal.author_id, t('signals.card.unknownAuthor'))}
      teamName={teamName}
      businessUnitName={businessUnitName}
      siteName={siteName}
      category={signal.category}
      onCategorize={(category) => { void handleCategorize(category) }}
    />
  )
  const history = signal.edited_at
    ? <SignalHistory edited revisions={revisionViews} />
    : null

  return (
    <div className="signal-record-host">
      <RecordViewer
        adapter={wrapSignalRecord({
          detail,
          occurredLabel: formatWibDateTime(signal.occurred_at),
          reach,
          discussion,
          facts,
          history,
          onAttentionChange,
          // DO-13/I18N-2: the identity type-kicker localizes with the rest of the record chrome.
          typeLabel: t('signals.record.title'),
        })}
        mode={mode}
        // SR-8 (mirrors TaskRecordPage): in page mode the RecordViewer identity IS the page's h1
        // (the generic PageFamilyFrame head is hidden), so promote it from the default h2. The
        // in-list panel/drawer keeps h2 (its host chrome owns the surrounding hierarchy).
        headingLevel={mode === 'page' ? 1 : 2}
      />
    </div>
  )
}
