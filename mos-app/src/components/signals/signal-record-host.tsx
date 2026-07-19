import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import {
  getSignal, listSignalRevisions, listAllTeams, getTeamSite, correctSignal, acknowledgeSignal,
  linkSignalTask, createFollowUpTask, loadMentionRosters, dedupeRecipients, summarizeLinkedTasks,
  type SignalDetail, type SignalRevisionRow, type MentionRosters,
} from '@/lib/db/signals'
import type { SignalCategory, StagedMention } from '@/lib/db/signals.types'
import type { TeamOption } from '@/lib/db/signals.types'
import { getBusinessUnits, getPeople, type BusinessUnitOption, type PersonOption } from '@/lib/db/directory'
import { listTasks } from '@/lib/db/tasks'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { listComments, postComment, type CommentRow } from '@/lib/comments/postComment'
import { SignalRecord, type SignalMentionView } from './signal-record'
import './signal-record-host.css'

// C3 (KNOWN GAP 2): signal-record.tsx (B15) is a fully presentational renderer — this host is
// the fetch+mutate layer for the Signal record. It is the CONTENT of the shared RecordPanelHost
// (spec record-panel-host.spec.md, FR-3) — chrome-free: the host owns the ✕ Close / "Open full
// page" / modal regime, this host owns only the Signal's own data + actions. `mode` mirrors the
// Task renderer: "panel" (the in-list split drawer) or "page" (the full canonical record page).

export interface SignalRecordHostProps {
  signalId: string
  /** panel = in-list split drawer content; page = standalone canonical record page (OD-63/Rule 4). */
  mode?: 'panel' | 'page'
}

type FetchState = 'loading' | 'ready' | 'error'

function personName(people: PersonOption[], id: string, fallback: string): string {
  return people.find((p) => p.id === id)?.full_name ?? fallback
}

export function SignalRecordHost({ signalId, mode = 'panel' }: SignalRecordHostProps) {
  const t = useT()
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null

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
  const shieldLine = !teamName ? undefined : notifyCount > 0
    ? t('signals.composer.visibleToNotify', { team: teamName, count: notifyCount })
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

  async function handlePostComment(body: string) {
    await postComment({ entityType: 'signal', entityId: signalId, body })
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

  return (
    <div className="signal-record-host">
      <SignalRecord
        mode={mode}
        signal={signal}
        authorName={personName(people, signal.author_id, t('signals.card.unknownAuthor'))}
        teamName={teamName}
        businessUnitName={businessUnitName}
        siteName={siteName}
        mentions={mentionViews}
        shieldLine={shieldLine}
        revisions={revisions.map((rev) => ({
          id: rev.id, field: rev.field, old_value: rev.old_value, new_value: rev.new_value,
          created_at: rev.created_at, actorName: personName(people, rev.actor_id, t('signals.card.unknownAuthor')),
        }))}
        acknowledgements={acknowledgements.map((ack) => ({
          personId: ack.person_id, personName: personName(people, ack.person_id, t('signals.card.unknownAuthor')),
        }))}
        hasAcknowledged={!!viewerId && acknowledgements.some((ack) => ack.person_id === viewerId)}
        onAcknowledge={() => { void handleAcknowledge() }}
        onCategorize={(category) => { void handleCategorize(category) }}
        comments={comments}
        people={people}
        canComment={!!viewerId}
        onPostComment={handlePostComment}
        linkedTasksSummary={linkedTasksSummary}
        onCreateFollowUpTask={toggleFollowUp}
        onLinkExistingTask={() => setLinkOpen((open) => !open)}
      />

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
    </div>
  )
}
