import { useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { listAuthorTeams, listAllTeams, createSignal } from '@/lib/db/signals'
import type { TeamOption, StagedMention, MentionKind } from '@/lib/db/signals.types'
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
  onShared?: (id: string) => void
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function SignalComposer({
  authorId, authorName, canCreateForTeam = false, canMentionBu = false, onShared,
}: SignalComposerProps) {
  const t = useT()
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [teamId, setTeamId] = useState('')
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
      if (primary) setTeamId(primary.id)
      setPeople(peopleOptions.filter((p) => p.id !== authorId).map((p) => ({ id: p.id, label: p.full_name })))
      setBusinessUnits(buOptions.map((bu) => ({ id: bu.id, label: bu.name })))
    }).catch(() => { /* the composer stays capture-minimal even if option lists fail to load */ })
    return () => { cancelled = true }
  }, [authorId, canCreateForTeam])

  const teamCandidates: MentionCandidate[] = teams.map((team) => ({ id: team.id, label: team.name }))

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
        <label>
          {t('signals.composer.teamLabel')}
          <select
            aria-label={t('signals.composer.teamLabel')}
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        </label>

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

      <p className="signal-composer-author">{t('signals.composer.author', { name: authorName })}</p>

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
