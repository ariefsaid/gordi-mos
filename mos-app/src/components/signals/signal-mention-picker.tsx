import { forwardRef, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { filterMentionCandidates, type MentionCandidate } from '@/lib/comments/mentions'
import type { MentionKind } from '@/lib/db/signals.types'
import { revealWithinList, useListboxPopover } from '@/components/ui/use-listbox-popover'
import { useT } from '@/i18n/use-t'
import './signal-mention-picker.css'

// Grouped `@` mention popover — Person / Team / BU, each with a type badge (AC-421/OD-59). Extends
// the shared mention grammar (lib/comments/mentions.ts, Rule 11) rather than re-implementing fuzzy
// matching. `@BU` options render disabled (not hidden — Rule 8's "never blocks capture" spirit: the
// author can still see the option exists) when the viewer lacks signal.mention_bu (FR-407).
//
// GAP-8 (OD-91 #13): focus stays in the native textarea, which retains its textbox semantics. This
// picker routes the visible options (flattened across the three groups) through the shared
// useListboxPopover contract in `manageFocus:false` mode and exposes an imperative `handleKeyDown`
// the composer forwards from the textarea. The caller wires the listbox relationship; keyboard
// navigation moves the active option, Enter selects it, and Escape dismisses the picker.

export interface SignalMentionPickerProps {
  people: MentionCandidate[]
  teams: MentionCandidate[]
  businessUnits: MentionCandidate[]
  query: string
  canMentionBu: boolean
  anchorRef: RefObject<HTMLElement | null>
  onRelationshipChange: (state: { listboxId: string; activeOptionId: string | null } | null) => void
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

const optionDomId = (baseId: string, option: FlatOption) =>
  `${baseId}-option-${option.kind}-${encodeURIComponent(option.option.id)}`

export const SignalMentionPicker = forwardRef<SignalMentionPickerHandle, SignalMentionPickerProps>(
  function SignalMentionPicker(
    { people, teams, businessUnits, query, canMentionBu, anchorRef, onRelationshipChange, onSelect, onDismiss },
    ref,
  ) {
    const t = useT()
    const baseId = useId()
    const listboxId = `${baseId}-listbox`
    const contentRef = useRef<HTMLDivElement | null>(null)
    const listboxRef = useRef<HTMLDivElement | null>(null)
    const optionNodes = useRef(new Map<string, HTMLButtonElement>())
    const relationshipCallback = useRef(onRelationshipChange)
    const dismissCallback = useRef(onDismiss)
    relationshipCallback.current = onRelationshipChange
    dismissCallback.current = onDismiss
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
    const activeOption = activeIndex >= 0 ? flat[activeIndex] : undefined
    const activeOptionId = activeOption ? optionDomId(baseId, activeOption) : null

    useLayoutEffect(() => {
      onRelationshipChange({ listboxId, activeOptionId })
    }, [activeOptionId, listboxId, onRelationshipChange])

    useEffect(() => {
      const anchor = anchorRef.current
      const ownerWindow = anchor?.ownerDocument.defaultView
      if (!anchor || !ownerWindow) return
      // Radix handles ordinary Escape at document capture. Let an active IME consume Escape first.
      const preserveComposingEscape = (event: globalThis.KeyboardEvent) => {
        if (event.target === anchor && event.key === 'Escape' && (event.isComposing || event.keyCode === 229)) {
          event.stopPropagation()
        }
      }
      // Radix defers outside pointer dismissal until document click bubble. A containing
      // ModalShell stops that click, so close here while still letting the click reach its control.
      const dismissOutsidePointer = (event: globalThis.PointerEvent) => {
        const target = event.target
        if (!(target instanceof Node) || target === anchor || contentRef.current?.contains(target)) return
        dismissCallback.current?.()
      }
      ownerWindow.addEventListener('keydown', preserveComposingEscape, true)
      ownerWindow.addEventListener('pointerdown', dismissOutsidePointer, true)
      return () => {
        ownerWindow.removeEventListener('keydown', preserveComposingEscape, true)
        ownerWindow.removeEventListener('pointerdown', dismissOutsidePointer, true)
      }
    }, [anchorRef])

    useEffect(() => () => relationshipCallback.current(null), [])

    useEffect(() => {
      if (!activeOptionId) return
      const listbox = listboxRef.current
      const option = optionNodes.current.get(activeOptionId)
      if (listbox && option && listbox.contains(option)) revealWithinList(listbox, option)
    }, [activeIndex, activeOptionId])

    useImperativeHandle(ref, () => ({
      handleKeyDown: (event: KeyboardEvent) => {
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || !NAV_KEYS.has(event.key)) return false
        onKeyDown(event)
        return true
      },
    }), [onKeyDown])

    // Map a FlatOption back to its flat index so each rendered row carries the right option props.
    const indexOf = (kind: MentionKind, id: string) => flat.findIndex((f) => f.kind === kind && f.option.id === id)

    function renderGroup(kind: MentionKind, label: string, hits: MentionCandidate[], disabled: boolean) {
      if (hits.length === 0) return null
      return (
        <div className="mention-group" key={kind} role="group" aria-label={label}>
          <div className="mention-group-head">{label}</div>
          {hits.map((option) => {
            const index = indexOf(kind, option.id)
            const active = index === activeIndex
            const id = optionDomId(baseId, { kind, option, disabled })
            return (
              <button
                type="button"
                key={option.id}
                {...getOptionProps(index)}
                id={id}
                ref={(node) => {
                  if (node) optionNodes.current.set(id, node)
                  else optionNodes.current.delete(id)
                }}
                aria-selected={active}
                disabled={disabled}
                tabIndex={-1}
                // DO-17 F4: a disabled @BU row states WHY it can't be picked (title + aria-description),
                // instead of a silent dead control.
                title={disabled ? t('signals.mention.buDisabledReason') : undefined}
                aria-description={disabled ? t('signals.mention.buDisabledReason') : undefined}
                className={`mention-row${active ? ' is-active' : ''}`}
                onPointerDown={(event) => { if (event.button === 0) event.preventDefault() }}
                onClick={() => { if (!disabled) onSelect(kind, option) }}
              >
                {/* The group header already names the kind (PERSON/TEAM/BU) — no per-row repeat. */}
                <span className="nm">{option.label}</span>
              </button>
            )
          })}
        </div>
      )
    }

    return (
      <Popover.Root open onOpenChange={(open) => { if (!open) onDismiss?.() }}>
        <Popover.Anchor virtualRef={anchorRef} />
        <Popover.Portal>
          <Popover.Content
            ref={contentRef}
            aria-label={t('signals.mention.pickerLabel')}
            side="bottom"
            align="start"
            sideOffset={4}
            collisionPadding={12}
            data-escape-layer="nested"
            className="mention-pop"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => { if (event.target === anchorRef.current) event.preventDefault() }}
            onFocusOutside={(event) => { if (event.target === anchorRef.current) event.preventDefault() }}
          >
            <div
              id={listboxId}
              ref={listboxRef}
              role="listbox"
              aria-label={t('signals.mention.pickerLabel')}
              aria-activedescendant={activeOptionId ?? undefined}
              className="mention-pop__list"
              onKeyDown={onKeyDown}
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
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    )
  },
)
