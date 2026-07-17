import { useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import {
  listAuthorTeams, listAllTeams, getTeamSite, createSignal, dedupeRecipients, type MemberLookup,
} from '@/lib/db/signals'
import type { TeamOption, SiteOption, StagedMention, MentionKind } from '@/lib/db/signals.types'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { currentMentionToken, type MentionCandidate } from '@/lib/comments/mentions'
import { SignalMentionPicker } from './signal-mention-picker'

// FB-style Signal composer (PORT convergence `sigComposer` — Rule 11). Capture-minimal (Rule 8 /
// OD-42 / D28): exactly four capture fields at initial paint — content, owning Team, occurrence
// time, and the implicit read-only author line. Every enrichment (mentions, Site pill, category,
// attention) is layered on in later tasks (B9–B11) without adding to this required set.

export interface SignalComposerProps {
  authorId: string
  authorName: string
  /** Unlocks any authorized Team as the owning Team (signal.create_for_team), not just the
   * author's own active memberships (FR-404). Defaults to false (fail-closed). */
  canCreateForTeam?: boolean
  /** signal.mention_bu — gates the @BU mention group (FR-407). Defaults to false (fail-closed). */
  canMentionBu?: boolean
  /** Team/BU id → member person ids, for the fan-out preview count (AC-422). Supplied by the
   * caller from a directory cache — the composer never queries a full org roster on its own. */
  teamMembers?: MemberLookup
  buMembers?: MemberLookup
  onShared?: (id: string) => void
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function SignalComposer({
  authorId, authorName, canCreateForTeam = false, canMentionBu = false,
  teamMembers = {}, buMembers = {}, onShared,
}: SignalComposerProps) {
  const t = useT()
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [teamId, setTeamId] = useState('')
  const [primaryTeamId, setPrimaryTeamId] = useState('')
  const [site, setSite] = useState<SiteOption | null>(null)
  const [people, setPeople] = useState<MentionCandidate[]>([])
  const [businessUnits, setBusinessUnits] = useState<MentionCandidate[]>([])
  const [body, setBody] = useState('')
  const [occurredAt, setOccurredAt] = useState(() => toDatetimeLocalValue(new Date()))
  const [mentions, setMentions] = useState<StagedMention[]>([])
  const [mentionToken, setMentionToken] = useState<{ query: string; start: number } | null>(null)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let cancelled = false
    const teamsLoad = canCreateForTeam ? listAllTeams() : listAuthorTeams(authorId)
    Promise.all([teamsLoad, getPeople(), getBusinessUnits()]).then(([teamOptions, peopleOptions, buOptions]) => {
      if (cancelled) return
      setTeams(teamOptions)
      const primary = teamOptions.find((o) => o.is_primary) ?? teamOptions[0]
      if (primary) { setTeamId(primary.id); setPrimaryTeamId(primary.id) }
      setPeople(peopleOptions.filter((p) => p.id !== authorId).map((p) => ({ id: p.id, label: p.full_name })))
      setBusinessUnits(buOptions.map((bu) => ({ id: bu.id, label: bu.name })))
    }).catch(() => { /* the composer stays capture-minimal even if option lists fail to load */ })
    return () => { cancelled = true }
  }, [authorId, canCreateForTeam])

  // The Site pill is derived from the owning Team — never a mention target (D37). Re-resolved
  // whenever the selected Team changes (including the cross-Team destination switch, B10).
  useEffect(() => {
    if (!teamId) { setSite(null); return }
    let cancelled = false
    getTeamSite(teamId)
      .then((resolved) => { if (!cancelled) setSite(resolved) })
      .catch(() => { if (!cancelled) setSite(null) })
    return () => { cancelled = true }
  }, [teamId])

  const teamCandidates: MentionCandidate[] = teams.map((team) => ({ id: team.id, label: team.name }))
  const selectedTeam = teams.find((team) => team.id === teamId) ?? null
  const isCrossTeam = !!primaryTeamId && teamId !== primaryTeamId
  const notifyCount = dedupeRecipients(mentions, teamMembers, buMembers)
  const shieldLine = !selectedTeam ? '' : isCrossTeam
    ? t('signals.composer.postTo', { team: selectedTeam.name, attention: 'FYI', count: notifyCount })
    : notifyCount > 0
      ? t('signals.composer.visibleToNotify', { team: selectedTeam.name, count: notifyCount })
      : t('signals.composer.visibleTo', { team: selectedTeam.name })

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value
    setBody(value)
    const token = currentMentionToken(value, e.target.selectionStart ?? value.length)
    setMentionToken(token)
  }

  function insertMention(kind: MentionKind, option: MentionCandidate) {
    if (!mentionToken) return
    const before = body.slice(0, mentionToken.start)
    const after = body.slice(mentionToken.start).replace(/^@[^\s@]*/, '')
    setBody(`${before}@${option.label} ${after}`)
    setMentions((prev) => [
      ...prev.filter((m) => !(m.kind === kind && m.targetId === option.id)),
      { kind, targetId: option.id, label: option.label },
    ])
    setMentionToken(null)
    textareaRef.current?.focus()
  }

  async function submit() {
    const trimmedBody = body.trim()
    if (!trimmedBody || !teamId || posting) return
    setPosting(true)
    setError(null)
    try {
      const occurredIso = new Date(occurredAt).toISOString()
      const id = await createSignal({ body: trimmedBody, owningTeamId: teamId, occurredAt: occurredIso, mentions })
      setBody('')
      setMentions([])
      setMentionToken(null)
      onShared?.(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="signal-composer" data-testid="signal-composer">
      <div style={{ position: 'relative' }}>
        <textarea
          ref={textareaRef}
          aria-label={t('signals.composer.placeholder')}
          placeholder={t('signals.composer.placeholder')}
          value={body}
          onChange={handleBodyChange}
          rows={3}
        />
        {mentionToken && (
          <SignalMentionPicker
            people={people}
            teams={teamCandidates}
            businessUnits={businessUnits}
            query={mentionToken.query}
            canMentionBu={canMentionBu}
            onSelect={insertMention}
          />
        )}
      </div>

      <div className="signal-composer-row">
        <Select
          label={t('signals.composer.teamLabel')}
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
        >
          {teams.map((team) => (
            <option key={team.id} value={team.id}>{team.name}</option>
          ))}
        </Select>

        <label>
          {t('signals.composer.occurredLabel')}
          <input
            type="datetime-local"
            aria-label={t('signals.composer.occurredLabel')}
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        </label>
      </div>

      {site && (
        <span className="signal-composer-pill" data-testid="signal-site-pill" title={t('signals.composer.siteHint')}>
          {site.name}
        </span>
      )}

      <p className="signal-composer-author">{t('signals.composer.author', { name: authorName })}</p>

      {shieldLine && <p className="signal-composer-vis">{shieldLine}</p>}

      {error && <p role="alert">{error}</p>}

      <div className="signal-composer-foot">
        <span className="muted-2">{t('signals.composer.categoryHelp')}</span>
        <Button
          variant="primary"
          disabled={!body.trim() || !teamId || posting}
          onClick={() => { void submit() }}
        >
          {t('signals.action.share')}
        </Button>
      </div>
    </div>
  )
}
