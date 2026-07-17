import { filterMentionCandidates, type MentionCandidate } from '@/lib/comments/mentions'
import type { MentionKind } from '@/lib/db/signals.types'
import { useT } from '@/i18n/use-t'
import './signal-mention-picker.css'

// Grouped `@` mention popover — Person / Team / BU, each with a type badge (AC-421/OD-59). Extends
// the shared mention grammar (lib/comments/mentions.ts, Rule 11) rather than re-implementing fuzzy
// matching. `@BU` options render disabled (not hidden — Rule 8's "never blocks capture" spirit: the
// author can still see the option exists) when the viewer lacks signal.mention_bu (FR-407).

export interface SignalMentionPickerProps {
  people: MentionCandidate[]
  teams: MentionCandidate[]
  businessUnits: MentionCandidate[]
  query: string
  canMentionBu: boolean
  onSelect: (kind: MentionKind, option: MentionCandidate) => void
}

const GROUP_LIMIT: Record<MentionKind, number> = { person: 5, team: 4, bu: 3 }

export function SignalMentionPicker({
  people, teams, businessUnits, query, canMentionBu, onSelect,
}: SignalMentionPickerProps) {
  const t = useT()
  const peopleHits = filterMentionCandidates(query, people, GROUP_LIMIT.person)
  const teamHits = filterMentionCandidates(query, teams, GROUP_LIMIT.team)
  const buHits = filterMentionCandidates(query, businessUnits, GROUP_LIMIT.bu)
  const noMatches = peopleHits.length === 0 && teamHits.length === 0 && buHits.length === 0

  function renderGroup(kind: MentionKind, label: string, hits: MentionCandidate[], disabled: boolean) {
    if (hits.length === 0) return null
    return (
      <div className="mention-group" key={kind}>
        <div className="mention-group-head">{label}</div>
        {hits.map((option) => (
          <button
            type="button"
            key={option.id}
            role="option"
            aria-selected={false}
            disabled={disabled}
            className="mention-row"
            onMouseDown={(e) => e.preventDefault()} // keep the textarea focused/selection intact
            onClick={() => onSelect(kind, option)}
          >
            <span className={`type-badge type-badge--${kind}`} aria-hidden="true">{kind}</span>
            <span className="nm">{option.label}</span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div role="listbox" aria-label={t('signals.mention.pickerLabel')} className="mention-pop">
      {noMatches ? (
        <div className="mention-empty">{t('signals.mention.noMatches')}</div>
      ) : (
        <>
          {renderGroup('person', t('signals.mention.group.person'), peopleHits, false)}
          {renderGroup('team', t('signals.mention.group.team'), teamHits, false)}
          {renderGroup('bu', t('signals.mention.group.bu'), buHits, !canMentionBu)}
        </>
      )}
    </div>
  )
}
