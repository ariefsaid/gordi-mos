import { forwardRef, useImperativeHandle, type KeyboardEvent } from 'react'
import { filterMentionCandidates, type MentionCandidate } from '@/lib/comments/mentions'
import type { MentionKind } from '@/lib/db/signals.types'
import { useListboxPopover } from '@/components/ui/use-listbox-popover'
import { useT } from '@/i18n/use-t'
import './signal-mention-picker.css'

// Grouped `@` mention popover — Person / Team / BU, each with a type badge (AC-421/OD-59). Extends
// the shared mention grammar (lib/comments/mentions.ts, Rule 11) rather than re-implementing fuzzy
// matching. `@BU` options render disabled (not hidden — Rule 8's "never blocks capture" spirit: the
// author can still see the option exists) when the viewer lacks signal.mention_bu (FR-407).
//
// GAP-8 (OD-91 #13) — combobox idiom: the driving textarea KEEPS focus, so this picker cannot own
// focus. It routes the visible options (flattened across the three groups) through the shared
// useListboxPopover contract in `manageFocus:false` mode and exposes an imperative `handleKeyDown`
// the composer forwards from the textarea — so ArrowUp/Down/Home/End move the active option, Enter
// selects it, and Escape dismisses, identically to every other listbox in the app.

export interface SignalMentionPickerProps {
  people: MentionCandidate[]
  teams: MentionCandidate[]
  businessUnits: MentionCandidate[]
  query: string
  canMentionBu: boolean
  onSelect: (kind: MentionKind, option: MentionCandidate) => void
  /** D-B2 isolation: Escape while focus is in the popover dismisses it locally, never the host. */
  onDismiss?: () => void
}

/** Imperative surface the composer's textarea forwards its keydowns to (combobox idiom). */
export interface SignalMentionPickerHandle {
  /** Route a textarea keydown through the popover; returns true when the key was handled. */
  handleKeyDown: (event: KeyboardEvent) => boolean
}

const GROUP_LIMIT: Record<MentionKind, number> = { person: 5, team: 4, bu: 3 }
const NAV_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Escape'])

type FlatOption = { kind: MentionKind; option: MentionCandidate; disabled: boolean }

export const SignalMentionPicker = forwardRef<SignalMentionPickerHandle, SignalMentionPickerProps>(
  function SignalMentionPicker(
    { people, teams, businessUnits, query, canMentionBu, onSelect, onDismiss },
    ref,
  ) {
    const t = useT()
    const peopleHits = filterMentionCandidates(query, people, GROUP_LIMIT.person)
    const teamHits = filterMentionCandidates(query, teams, GROUP_LIMIT.team)
    const buHits = filterMentionCandidates(query, businessUnits, GROUP_LIMIT.bu)
    const noMatches = peopleHits.length === 0 && teamHits.length === 0 && buHits.length === 0

    // The FLAT option order the cursor walks — the same top-to-bottom order the groups render in.
    const flat: FlatOption[] = [
      ...peopleHits.map((option) => ({ kind: 'person' as const, option, disabled: false })),
      ...teamHits.map((option) => ({ kind: 'team' as const, option, disabled: false })),
      ...buHits.map((option) => ({ kind: 'bu' as const, option, disabled: !canMentionBu })),
    ]

    const { getOptionProps, activeIndex, onKeyDown } = useListboxPopover({
      itemCount: flat.length,
      onSelect: (index) => { const hit = flat[index]; if (hit && !hit.disabled) onSelect(hit.kind, hit.option) },
      onClose: () => onDismiss?.(),
      isDisabled: (index) => Boolean(flat[index]?.disabled),
      manageFocus: false,
    })

    useImperativeHandle(ref, () => ({
      handleKeyDown: (event: KeyboardEvent) => {
        if (!NAV_KEYS.has(event.key)) return false
        onKeyDown(event)
        return true
      },
    }), [onKeyDown])

    // Map a FlatOption back to its flat index so each rendered row carries the right option props.
    const indexOf = (kind: MentionKind, id: string) => flat.findIndex((f) => f.kind === kind && f.option.id === id)

    function renderGroup(kind: MentionKind, label: string, hits: MentionCandidate[], disabled: boolean) {
      if (hits.length === 0) return null
      return (
        <div className="mention-group" key={kind}>
          <div className="mention-group-head">{label}</div>
          {hits.map((option) => {
            const index = indexOf(kind, option.id)
            const active = index === activeIndex
            return (
              <button
                type="button"
                key={option.id}
                {...getOptionProps(index)}
                aria-selected={active}
                disabled={disabled}
                // DO-17 F4: a disabled @BU row states WHY it can't be picked (title + aria-description),
                // instead of a silent dead control.
                title={disabled ? t('signals.mention.buDisabledReason') : undefined}
                aria-description={disabled ? t('signals.mention.buDisabledReason') : undefined}
                className={`mention-row${active ? ' is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()} // keep the textarea focused/selection intact
                onClick={() => onSelect(kind, option)}
              >
                <span className={`type-badge type-badge--${kind}`} aria-hidden="true">{kind}</span>
                <span className="nm">{option.label}</span>
              </button>
            )
          })}
        </div>
      )
    }

    return (
      <div
        role="listbox"
        aria-label={t('signals.mention.pickerLabel')}
        aria-activedescendant={activeIndex >= 0 ? getOptionProps(activeIndex).id : undefined}
        className="mention-pop"
        onKeyDown={(e) => { if (e.key === 'Escape' && onDismiss) { e.preventDefault(); e.stopPropagation(); onDismiss() } }}
      >
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
  },
)
