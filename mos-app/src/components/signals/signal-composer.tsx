import { useEffect, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { listAuthorTeams, listAllTeams, createSignal } from '@/lib/db/signals'
import type { TeamOption, StagedMention } from '@/lib/db/signals.types'

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
  onShared?: (id: string) => void
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function SignalComposer({ authorId, authorName, canCreateForTeam = false, onShared }: SignalComposerProps) {
  const t = useT()
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [teamId, setTeamId] = useState('')
  const [body, setBody] = useState('')
  const [occurredAt, setOccurredAt] = useState(() => toDatetimeLocalValue(new Date()))
  const [mentions] = useState<StagedMention[]>([])
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = canCreateForTeam ? listAllTeams() : listAuthorTeams(authorId)
    load.then((options) => {
      if (cancelled) return
      setTeams(options)
      const primary = options.find((o) => o.is_primary) ?? options[0]
      if (primary) setTeamId(primary.id)
    }).catch(() => { /* the composer stays capture-minimal even if Team options fail to load */ })
    return () => { cancelled = true }
  }, [authorId, canCreateForTeam])

  async function submit() {
    const trimmedBody = body.trim()
    if (!trimmedBody || !teamId || posting) return
    setPosting(true)
    setError(null)
    try {
      const occurredIso = new Date(occurredAt).toISOString()
      const id = await createSignal({ body: trimmedBody, owningTeamId: teamId, occurredAt: occurredIso, mentions })
      setBody('')
      onShared?.(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="signal-composer" data-testid="signal-composer">
      <textarea
        aria-label={t('signals.composer.placeholder')}
        placeholder={t('signals.composer.placeholder')}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
      />

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
