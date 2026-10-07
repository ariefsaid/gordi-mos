// CafeStreamBar — the ONE way a Café surface says which production stream it is showing,
// and (where switching applies) the ONE way it is switched (#440).
//
// Lifted from the capture surface's own picker (kitchen-log-page's `kl-scope-stream`), which
// is the grammar this module already shipped and the review queue already copied: a single
// <Select> over the ENUMERATED stream catalog (FR-003/005, OD-WAY-42). Not the branch ×
// activity pair the stock/plan surfaces grew separately — that cross-product can offer a pair
// that is not a stream at all (the roastery is a branch and never a stream), and two 44px
// selects do not fit a page head on a phone. The pair implementation (StreamScopePicker) was
// deleted when its last caller adopted this one: two implementations of one grammar is how the
// two surfaces came to disagree in the first place (#238), and re-authoring a shipped grammar
// is the failure #283 is open about.
//
// It renders in the page head (PageFamilyFrame `statusRow`), not in the toolbar, because it is
// not a filter over the list — it names which books the whole surface is written in. Per the
// shared head's contract a status row REPLACES the static job sentence, which is the right
// trade here: "Rumah Rames · Kitchen" answers "what am I looking at" better than "Run today's
// café floor work" does, and #440 exists because that question had no answer at all.
//
// THE NAMING RULE (CONTEXT.md, Production stream; #238 owner ruling): a stream is named by its
// branch's CANONICAL catalog name — never the 'Bungur' display alias, which names a transfer
// DESTINATION and the derived action label, and never "HQ"/"Stok HQ" for the central kitchen
// (that collides with the GHQ branch, FR-061).
//
// #781 rewrite (AC-015/016, B4/B5/B12 first-look): a REQUIRED bounded choice used to render as a
// full-width dropdown — a mandatory-looking CONTROL for a fact the surface already knows on every
// visit but the first. OD-CAFE-6: it now STATES the stream as a heading on every Café surface, with an action-specific "Switch" beside it only when
// another stream at this location is actually offered (never a select, never a "Stream:" label, never a "Choose stream…"
// placeholder once a default exists). With no default at all (a home Team that is not a stream —
// FR-002), it offers the location's own streams as direct one-click choices instead of a control
// that has to be operated twice (B5) — see `CafeStreamChoices` below, which callers place in the
// BODY rather than the head: the empty/no-default state has nothing to state yet, so this bar
// renders NOTHING then, which is also what keeps it from ever outranking a page's own Opening row
// (B12 — an empty control sitting in the head previously did, simply by being there first).

import { useState, useCallback, useEffect, useMemo, useRef, useId } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { useAuth } from '@/auth/use-auth'
import { EmptyState } from '@/components/ui/state-kit'
import { useListboxPopover } from '@/components/ui/use-listbox-popover'
import { streamKey, streamLabel } from '@/lib/kitchen-action-label'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { useT, type Translate } from '@/i18n/use-t'
import './cafe-stream-bar.css'

/** Sentinel option value for the cross-stream view — never a stream key (those carry a '|'). */
export const ALL_STREAMS = 'all'

const EMPTY_STREAM_KEYS: ReadonlySet<string> = new Set()

function sameStream(a: ProductionStream | null, b: ProductionStream | null): boolean {
  return a != null && b != null && a.branch.id === b.branch.id && a.activity === b.activity
}

/**
 * True for any stream the person currently belongs to — home included, but not only home
 * (coordinator follow-up: marking is not defaulting, so a secondary current membership is
 * "Your Team" too, even though the binding rule keeps it out of `stream`'s default).
 */
function isMineStream(
  option: ProductionStream,
  homeStream: ProductionStream | null,
  myStreamKeys: ReadonlySet<string>,
): boolean {
  return sameStream(option, homeStream) || myStreamKeys.has(streamKey(option.branch.id, option.activity))
}

/** Home first, then the person's other current streams, then everything else. */
function myRank(
  option: ProductionStream,
  homeStream: ProductionStream | null,
  myStreamKeys: ReadonlySet<string>,
  locationBranchId?: string,
): number {
  // Another location's streams come after everything at the active location.
  if (locationBranchId && option.branch.id !== locationBranchId) return 3
  if (sameStream(option, homeStream)) return 0
  if (isMineStream(option, homeStream, myStreamKeys)) return 1
  return 2
}

/** The tags this module can say about one option, baked into its picker-menu label (item 1). */
function taggedLabel(
  t: Translate,
  option: ProductionStream,
  homeStream: ProductionStream | null,
  myStreamKeys: ReadonlySet<string>,
  locationBranchId?: string,
): string {
  const tags = [
    locationBranchId && option.branch.id !== locationBranchId ? t('cafe.stream.otherLocation') : null,
    isMineStream(option, homeStream, myStreamKeys) ? t('cafe.stream.yourTeam') : null,
    option.produces === false ? t('kitchen.stream.receivingOnly.tag') : null,
  ].filter((tag): tag is string => tag !== null)
  const label = streamLabel(t, option)
  return tags.length > 0 ? `${label} — ${tags.join(' · ')}` : label
}

export interface CafeStreamBarProps {
  /** The enumerable stream catalog (FR-005). Empty while it loads — the control disables. */
  options: readonly ProductionStream[]
  /** The stream in view; null = none resolved yet, so the surface asks for an explicit choice. */
  stream: ProductionStream | null
  /** Omit on a surface that cannot switch — it then STATES its stream and offers no control. */
  onChange?: (next: ProductionStream) => void
  /** This surface is reading every stream at once (the outbox; the review queue's 'all'). */
  allStreams?: boolean
  /** Offer "All streams" as a choice. Review only — the one surface with a cross-stream job. */
  onAllStreams?: () => void
  disabled?: boolean
  /**
   * The person's own stream (issue 456's `useCafeStream().homeStream`), independent of whatever a
   * session switch is currently showing. Drives the "Your Team" tag in the Switch menu and the
   * "Back to <home>" action (item 3, B4) once a switch has moved the view away from it. Omitted on
   * Review, whose choice is deliberately cross-stream and carries no personal default to return to.
   */
  homeStream?: ProductionStream | null
  /**
   * Stream keys (`streamKey(branch_id, activity)`) for every stream Team the person is a CURRENT
   * member of (`useCafeStream().myStreamKeys`) — home included, but not only home. Every one of
   * these is tagged "Your Team" and ranked first (home first among them) in the Switch menu.
   */
  myStreamKeys?: ReadonlySet<string>
  /** The active location's branch: streams elsewhere are tagged "Other location" and listed last. */
  locationBranchId?: string
}

export function CafeStreamBar({
  options,
  stream,
  onChange,
  allStreams = false,
  onAllStreams,
  disabled = false,
  homeStream = null,
  myStreamKeys = EMPTY_STREAM_KEYS,
  locationBranchId,
}: CafeStreamBarProps) {
  const t = useT()

  // A read-only surface still SAYS which stream it is showing — unchanged.
  if (!onChange) {
    return (
      <div className="cafe-stream" data-testid="cafe-stream">
        <h2 className="cafe-stream__value cafe-stream__value--heading">
          {allStreams ? t('kitchen.review.allStreams') : streamLabel(t, stream)}
        </h2>
      </div>
    )
  }

  // FR-002, no default: nothing to STATE yet, so this bar says nothing rather than holding a
  // "Choose stream…" placeholder above whatever else the page renders (B12) — the one-click
  // choice itself lives in the page body, right where the list/table would otherwise start
  // (`CafeStreamChoices`, placed by the caller after any Opening row it owns).
  if (!allStreams && stream === null) return null

  const valueLabel = allStreams ? t('kitchen.review.allStreams') : streamLabel(t, stream)
  const alternatives = options.filter((option) => !sameStream(option, stream))
  const canSwitch = allStreams ? options.length > 0 : alternatives.length > 0 || Boolean(onAllStreams)
  const backTarget = !allStreams && stream && homeStream && !sameStream(stream, homeStream)
    ? options.find((option) => sameStream(option, homeStream)) ?? null
    : null
  const switchLabel = t(allStreams || !stream
    ? 'cafe.stream.switchStream'
    : stream.activity === 'kitchen' ? 'cafe.stream.switchKitchen' : 'cafe.stream.switchBar')

  return (
    <div className="cafe-stream" data-testid="cafe-stream">
      <h2 className="cafe-stream__value cafe-stream__value--heading">{valueLabel}</h2>
      {backTarget && (
        <button
          type="button"
          className="cafe-stream__back"
          disabled={disabled}
          onClick={() => onChange(backTarget)}
        >
          {t('cafe.stream.backTo', { stream: streamLabel(t, backTarget) })}
        </button>
      )}
      {canSwitch && (
        <StreamSwitchMenu
          id="cafe-stream"
          options={allStreams ? options : alternatives}
          homeStream={homeStream}
          myStreamKeys={myStreamKeys}
          locationBranchId={locationBranchId}
          onAllStreams={allStreams ? undefined : onAllStreams}
          disabled={disabled}
          onChange={onChange}
          label={switchLabel}
          ariaLabel={switchLabel}
        />
      )}
    </div>
  )
}

// ── Radix Popover switch ─────────────────────────────────────────────────────────────────────
// Radix owns anchoring, collision handling, dismissal and focus scope. The shared listbox hook
// keeps this menu's arrow/Home/End/Enter/Escape contract aligned with the other app pickers.
interface StreamSwitchMenuProps {
  id: string
  options: readonly ProductionStream[]
  homeStream: ProductionStream | null
  myStreamKeys: ReadonlySet<string>
  locationBranchId?: string
  onAllStreams?: () => void
  disabled: boolean
  onChange: (next: ProductionStream) => void
  label: string
  ariaLabel: string
}

function StreamSwitchMenu({ id, options, homeStream, myStreamKeys, locationBranchId, onAllStreams, disabled, onChange, label, ariaLabel }: StreamSwitchMenuProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const entries = useMemo<Array<{ value: string; label: string; isAllStreams: boolean }>>(() => {
    // The All streams sentinel stays pinned first; real streams rank current memberships first.
    const ranked = [...options].sort(
      (a, b) => myRank(a, homeStream, myStreamKeys, locationBranchId) - myRank(b, homeStream, myStreamKeys, locationBranchId),
    )
    return [
      ...(onAllStreams ? [{ value: ALL_STREAMS, label: t('kitchen.review.allStreams'), isAllStreams: true }] : []),
      ...ranked.map((option) => ({
        value: streamKey(option.branch.id, option.activity),
        label: taggedLabel(t, option, homeStream, myStreamKeys, locationBranchId),
        isAllStreams: false,
      })),
    ]
  }, [homeStream, locationBranchId, myStreamKeys, onAllStreams, options, t])

  const selectIndex = useCallback((index: number) => {
    const entry = entries[index]
    if (!entry) return
    if (entry.isAllStreams) onAllStreams?.()
    else {
      const target = options.find((option) => streamKey(option.branch.id, option.activity) === entry.value)
      if (target) onChange(target)
    }
    setOpen(false)
  }, [entries, onAllStreams, onChange, options])

  const { listboxProps, getOptionProps, activeIndex, setActiveIndex, optionId } = useListboxPopover<HTMLDivElement>({
    itemCount: entries.length,
    initialActive: 0,
    onSelect: selectIndex,
    onClose: () => setOpen(false),
  })

  useEffect(() => {
    if (open) setActiveIndex(0)
  }, [open, setActiveIndex])
  useEffect(() => {
    if (!open || activeIndex < 0) return
    document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, open, optionId])

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          id={id}
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? `${id}-listbox` : undefined}
          className="cafe-stream__switch"
          disabled={disabled || entries.length === 0}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              setOpen(true)
            }
          }}
        >
          {label}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          {...listboxProps}
          id={`${id}-listbox`}
          aria-label={t('kitchen.log.stream.pickerAria')}
          className="cafe-stream__menu"
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          data-escape-layer="nested"
        >
          {entries.map((entry, index) => (
            <div
              {...getOptionProps(index)}
              key={entry.value}
              className="cafe-stream__option"
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => selectIndex(index)}
            >
              {entry.label}
            </div>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

// ── The one-step choice (item 2, FR-002, B5) ─────────────────────────────────────────────────
export interface CafeStreamChoicesProps {
  /** This location's stream catalog — the same `locationOptions` the head bar would offer. */
  options: readonly ProductionStream[]
  /** The person's own stream, ranked first among their current streams. */
  homeStream?: ProductionStream | null
  /**
   * Stream keys for every stream Team the person is a CURRENT member of
   * (`useCafeStream().myStreamKeys`) — home included, but not only home. Every one is marked
   * "Your Team" and listed first, home first among them.
   */
  myStreamKeys?: ReadonlySet<string>
  onChoose: (next: ProductionStream) => void
  disabled?: boolean
}

/**
 * The shared no-default state: one heading/copy pattern and one direct, one-click list, placed
 * in the page body (after any Opening row) because no stream exists for the head to state yet.
 */
export function CafeStreamChoices({
  options,
  homeStream = null,
  myStreamKeys = EMPTY_STREAM_KEYS,
  onChoose,
  disabled = false,
}: CafeStreamChoicesProps) {
  const t = useT()
  const auth = useAuth()
  const idPrefix = useId()
  if (options.length === 0) {
    return <EmptyState variant="blank" title={t('cafe.stream.none')} />
  }
  const ranked = [...options].sort(
    (a, b) => myRank(a, homeStream, myStreamKeys) - myRank(b, homeStream, myStreamKeys),
  )
  const showAdminHint = auth.status === 'authenticated' && auth.viewer.accessRoles.includes('admin')
  return (
    <EmptyState variant="next-step" title={t('cafe.stream.chooseTitle')} copy={t('cafe.stream.chooseCopy')}>
      <div className="cafe-stream-choices">
        <div className="cafe-stream-choices__list" role="group" aria-label={t('kitchen.log.stream.pickerAria')}>
        {ranked.map((option) => {
          const key = streamKey(option.branch.id, option.activity)
          const isMine = isMineStream(option, homeStream, myStreamKeys)
          const receivingOnlyId = option.produces === false ? `${idPrefix}-receiving-${key}` : undefined
          const accessibleName = [streamLabel(t, option), isMine ? t('cafe.stream.yourTeam') : null]
            .filter((part): part is string => part !== null)
            .join(' — ')
          return (
            <button
              key={key}
              type="button"
              className="cafe-stream-choices__option"
              aria-label={accessibleName}
              aria-describedby={receivingOnlyId}
              disabled={disabled}
              onClick={() => onChoose(option)}
            >
              <span className="cafe-stream-choices__name">{streamLabel(t, option)}</span>
              {isMine && <span className="cafe-stream-choices__tag">{t('cafe.stream.yourTeam')}</span>}
              {receivingOnlyId && (
                <span id={receivingOnlyId} className="cafe-stream-choices__tag cafe-stream-choices__tag--muted">
                  {t('kitchen.stream.receivingOnly.tag')}
                </span>
              )}
            </button>
          )
        })}
        </div>
        {showAdminHint && <p className="cafe-stream-choices__hint">{t('cafe.stream.noDefaultHint')}</p>}
      </div>
    </EmptyState>
  )
}
