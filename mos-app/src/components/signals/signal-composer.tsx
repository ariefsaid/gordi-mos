import { useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/state-kit'
import {
  listAuthorTeams, listAllTeams, getTeamSite, createSignal, dedupeRecipients, type MemberLookup,
} from '@/lib/db/signals'
import type { TeamOption, SiteOption, StagedMention, MentionKind } from '@/lib/db/signals.types'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { currentMentionToken, type MentionCandidate } from '@/lib/comments/mentions'
import { SignalMentionPicker, type SignalMentionPickerHandle } from './signal-mention-picker'
import './signal-composer.css'

// FB-style Signal composer (PORT convergence `sigComposer` — Rule 11). Capture-minimal (Rule 8 /
// OD-42 / D28): exactly four capture fields at initial paint — content, owning Team, occurrence
// time, and the implicit read-only author line. Every enrichment (the `@` mention picker, the
// visibility/fan-out preview line, and the derived Site pill) never blocks Share Signal.

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
  const [teamsLoaded, setTeamsLoaded] = useState(false)
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
  // GAP-8 (OD-91 #13): the mention popover is a combobox — the textarea keeps focus and forwards its
  // navigation keydowns to the picker's shared listbox contract.
  const mentionPickerRef = useRef<SignalMentionPickerHandle>(null)

  useEffect(() => {
    let cancelled = false
    setTeamsLoaded(false)
    const teamsLoad = canCreateForTeam ? listAllTeams() : listAuthorTeams(authorId)
    Promise.all([teamsLoad, getPeople(), getBusinessUnits()]).then(([teamOptions, peopleOptions, buOptions]) => {
      if (cancelled) return
      setTeams(teamOptions)
      const primary = teamOptions.find((o) => o.is_primary) ?? teamOptions[0]
      // primaryTeamId always tracks the author's home Team (drives the cross-Team destination
      // preview), independent of what is *selected*.
      if (primary) setPrimaryTeamId(primary.id)
      // OD-REDESIGN-91 #19 (F4): a single eligible Team auto-picks; with more than one the poster
      // MUST pick the owning Team — no pre-select, no arbitrary first (Share stays disabled until
      // a Team is chosen).
      if (teamOptions.length === 1) setTeamId(teamOptions[0].id)
      setPeople(peopleOptions.filter((p) => p.id !== authorId).map((p) => ({ id: p.id, label: p.full_name })))
      setBusinessUnits(buOptions.map((bu) => ({ id: bu.id, label: bu.name })))
    }).catch(() => { /* the composer stays capture-minimal even if option lists fail to load */ })
      .finally(() => { if (!cancelled) setTeamsLoaded(true) })
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
  // SR-1 (owner ruling — "notify N people"): the count carries its noun. English inflects
  // person/people by count; Indonesian "orang" is invariant (both keys resolve to it). The caller
  // resolves the noun in the active locale and threads it as ${noun}.
  const notifyNoun = t(notifyCount === 1 ? 'signals.notify.person' : 'signals.notify.people')
  const shieldLine = !selectedTeam ? '' : isCrossTeam
    ? t('signals.composer.postTo', { team: selectedTeam.name, attention: 'FYI', count: notifyCount, noun: notifyNoun })
    : notifyCount > 0
      ? t('signals.composer.visibleToNotify', { team: selectedTeam.name, count: notifyCount, noun: notifyNoun })
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

  // SIG-2: a viewer with no team memberships (e.g. Finance, an org-wide role) has nothing to
  // post a Signal TO — the owning-Team select would render empty and Share Signal would sit
  // disabled forever with no explanation. Once the team load resolves empty, show an honest
  // empty state that says why and who to ask, instead of a dead control.
  if (teamsLoaded && teams.length === 0) {
    return (
      <div className="signal-composer" data-testid="signal-composer">
        <EmptyState
          variant="blank"
          title={t('signals.composer.noTeams.title')}
          copy={t('signals.composer.noTeams.copy')}
          note={t('signals.composer.noTeams.note')}
        />
      </div>
    )
  }

  return (
    <div className="signal-composer" data-testid="signal-composer">
      <div className="signal-composer-mention-anchor">
        <textarea
          ref={textareaRef}
          aria-label={t('signals.composer.placeholder')}
          placeholder={t('signals.composer.placeholder')}
          value={body}
          onChange={handleBodyChange}
          // Combobox aria: while the mention popover is open the textarea is the combobox that
          // controls the listbox and reflects the active option (aria-activedescendant is on the
          // listbox; role=combobox marks the input as the driver).
          role={mentionToken ? 'combobox' : undefined}
          aria-expanded={mentionToken ? true : undefined}
          onKeyDown={(e) => {
            // GAP-8 combobox idiom: while the popover is open, forward ArrowUp/Down/Home/End/Enter/
            // Escape to the shared listbox contract. Escape is consumed here regardless (D-B2
            // isolation: it must not bubble to the composer's ModalShell host and lose the draft).
            if (mentionToken && mentionPickerRef.current?.handleKeyDown(e)) return
            if (e.key === 'Escape' && mentionToken) {
              e.preventDefault()
              e.stopPropagation()
              setMentionToken(null)
              return
            }
            // OD-REDESIGN-91 #10: Shift+Enter SENDS; plain Enter stays a newline. Held back while
            // the mention popover is open so a stray Shift+Enter never posts mid-mention.
            if (e.key === 'Enter' && e.shiftKey && !mentionToken) {
              e.preventDefault()
              void submit()
            }
          }}
          rows={3}
        />
        {mentionToken && (
          <SignalMentionPicker
            ref={mentionPickerRef}
            people={people}
            teams={teamCandidates}
            businessUnits={businessUnits}
            query={mentionToken.query}
            canMentionBu={canMentionBu}
            onSelect={insertMention}
            onDismiss={() => setMentionToken(null)}
          />
        )}
      </div>

      <div className="signal-composer-row">
        <Select
          label={t('signals.composer.teamLabel')}
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
        >
          {/* #19: with more than one eligible Team, an unselectable placeholder forces a deliberate
              pick (the native select would otherwise show the first option while value stays ''). */}
          {teams.length > 1 && (
            <option value="" disabled>{t('signals.composer.teamPlaceholder')}</option>
          )}
          {teams.map((team) => (
            <option key={team.id} value={team.id}>{team.name}</option>
          ))}
        </Select>

        <label className="signal-composer-datetime">
          <span className="signal-composer-field-label">
            {t('signals.composer.occurredLabel')}
            {/* OD-REDESIGN-91 #20: native picker stays; a quiet WIB hint states the zone. */}
            <span className="signal-composer-field-hint">{t('signals.composer.occurredHint')}</span>
          </span>
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
        <div className="signal-composer-send">
          {/* OD-REDESIGN-91 #10: quiet Shift+Enter hint by the Send button; hidden on touch. */}
          <span className="signal-composer-send-hint">{t('signals.composer.sendHint')}</span>
          <Button
            variant="primary"
            disabled={!body.trim() || !teamId || posting}
            aria-busy={posting}
            onClick={() => { void submit() }}
          >
            {/* DO-17 F3: an explicit in-flight affordance (label + aria-busy), not just a disabled button. */}
            {posting ? t('signals.action.sharing') : t('signals.action.share')}
          </Button>
        </div>
      </div>
    </div>
  )
}
