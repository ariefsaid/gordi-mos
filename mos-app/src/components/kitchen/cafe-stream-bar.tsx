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
// visit but the first. It now STATES the stream as text, with a quiet "Switch" beside it only when
// another stream at this location is actually offered (never a select, never a "Choose stream…"
// placeholder once a default exists). With no default at all (a home Team that is not a stream —
// FR-002), it offers the location's own streams as direct one-click choices instead of a control
// that has to be operated twice (B5) — see `CafeStreamChoices` below, which callers place in the
// BODY rather than the head: the empty/no-default state has nothing to state yet, so this bar
// renders NOTHING then, which is also what keeps it from ever outranking a page's own Opening row
// (B12 — an empty control sitting in the head previously did, simply by being there first).

import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useListboxPopover } from '@/components/ui/use-listbox-popover'
import { usePopoverReflow } from '@/components/ui/use-popover-reflow'
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
): number {
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
): string {
  const tags = [
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
}: CafeStreamBarProps) {
  const t = useT()

  // A read-only surface still SAYS which stream it is showing — unchanged.
  if (!onChange) {
    return (
      <div className="cafe-stream" data-testid="cafe-stream">
        <span className="cafe-stream__label">{t('cafe.stream.label')}</span>
        <span className="cafe-stream__value">
          {allStreams ? t('kitchen.review.allStreams') : streamLabel(t, stream)}
        </span>
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
  const canSwitch = alternatives.length > 0 || Boolean(onAllStreams && !allStreams)
  const backTarget = !allStreams && stream && homeStream && !sameStream(stream, homeStream)
    ? options.find((option) => sameStream(option, homeStream)) ?? null
    : null

  return (
    <div className="cafe-stream" data-testid="cafe-stream">
      <span className="cafe-stream__label">{t('cafe.stream.label')}</span>
      <span className="cafe-stream__value">{valueLabel}</span>
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
          onAllStreams={allStreams ? undefined : onAllStreams}
          disabled={disabled}
          onChange={onChange}
        />
      )}
    </div>
  )
}

// ── The Switch menu ──────────────────────────────────────────────────────────────────────────
// A quiet text-button trigger whose own label always reads "Switch" — the current stream is
// already stated beside it, so the trigger does not need to repeat it, and the menu offers only
// the OTHER choices: re-choosing the view in place would re-read it (and on Log discard a draft) (unlike the shared
// `Select`/`Picker` controls, whose trigger IS the current value). Built on the same listbox
// popover primitives those controls share (DESIGN.md DD-MVP-2 "existing searchable/contextual
// Picker controls share the same listbox interaction contract") — portalled, edge-clamped,
// full keyboard support, outside-dismiss, focus return — just without their value-mirroring
// trigger, which this control deliberately does not want.
interface StreamSwitchMenuProps {
  id: string
  options: readonly ProductionStream[]
  homeStream: ProductionStream | null
  myStreamKeys: ReadonlySet<string>
  onAllStreams?: () => void
  disabled: boolean
  onChange: (next: ProductionStream) => void
}

function StreamSwitchMenu({ id, options, homeStream, myStreamKeys, onAllStreams, disabled, onChange }: StreamSwitchMenuProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const entries = useMemo<Array<{ value: string; label: string; isAllStreams: boolean }>>(() => {
    // "All streams" is a sentinel, not a stream to rank — it stays pinned first (Review's own
    // cross-stream default). The real options rank the person's current streams first, home
    // first among them (coordinator follow-up to item 1).
    const ranked = [...options].sort(
      (a, b) => myRank(a, homeStream, myStreamKeys) - myRank(b, homeStream, myStreamKeys),
    )
    return [
      ...(onAllStreams ? [{ value: ALL_STREAMS, label: t('kitchen.review.allStreams'), isAllStreams: true }] : []),
      ...ranked.map((option) => ({
        value: streamKey(option.branch.id, option.activity),
        label: taggedLabel(t, option, homeStream, myStreamKeys),
        isAllStreams: false,
      })),
    ]
  }, [homeStream, myStreamKeys, onAllStreams, options, t])

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  const selectIndex = useCallback((index: number) => {
    const entry = entries[index]
    if (!entry) return
    if (entry.isAllStreams) onAllStreams?.()
    else {
      const target = options.find((option) => streamKey(option.branch.id, option.activity) === entry.value)
      if (target) onChange(target)
    }
    close(true)
  }, [close, entries, onAllStreams, onChange, options])

  const { listboxProps, getOptionProps, activeIndex, setActiveIndex, optionId } = useListboxPopover<HTMLDivElement>({
    itemCount: entries.length,
    initialActive: 0,
    onSelect: selectIndex,
    onClose: () => close(true),
  })

  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 })
  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const gap = 6
    const margin = 12
    const viewportWidth = Math.max(window.innerWidth, margin * 2)
    const width = Math.min(Math.max(rect.width, 220), viewportWidth - margin * 2)
    const below = window.innerHeight - rect.bottom - margin - gap
    const above = rect.top - margin - gap
    const contentHeight = Math.min(320, Math.max(44, entries.length * 44 + 12))
    const flip = below < contentHeight && above > below
    const maxHeight = Math.max(44, Math.min(contentHeight, flip ? above : below))
    setPosition({
      top: flip ? rect.top - gap - maxHeight : rect.bottom + gap,
      left: Math.max(margin, Math.min(rect.left, viewportWidth - width - margin)),
      width,
      maxHeight,
    })
  }, [entries.length])

  useLayoutEffect(() => {
    if (!open) return
    setActiveIndex(0)
    place()
  }, [open, place, setActiveIndex])
  usePopoverReflow(open, place)

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) close(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [close, open])

  useEffect(() => {
    if (!open || activeIndex < 0) return
    document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, open, optionId])

  const setMenuRef = useCallback((node: HTMLDivElement | null) => {
    menuRef.current = node
    listboxProps.ref(node)
  }, [listboxProps])

  return (
    <>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-listbox` : undefined}
        className="cafe-stream__switch"
        disabled={disabled || entries.length === 0}
        onClick={() => { if (!open) setOpen(true); else close(true) }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            if (!open) setOpen(true)
          }
        }}
      >
        {t('cafe.stream.switch')}
      </button>
      {open && createPortal(
        <div
          {...listboxProps}
          ref={setMenuRef}
          id={`${id}-listbox`}
          aria-label={t('kitchen.log.stream.pickerAria')}
          className="cafe-stream__menu"
          style={position}
        >
          {entries.map((entry, index) => (
            <div
              {...getOptionProps(index)}
              key={entry.value}
              className="cafe-stream__option"
              onPointerMove={() => setActiveIndex(index)}
              onClick={(event) => { event.stopPropagation(); selectIndex(index) }}
            >
              {entry.label}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
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
 * A direct, one-click list of this location's streams — what replaces the old "Choose stream"
 * button that only focused a hidden control (B5). Placed by the caller in the page BODY (after
 * any Opening row it owns, B12), never in the head: with no default there is nothing for the
 * head to state.
 */
export function CafeStreamChoices({
  options,
  homeStream = null,
  myStreamKeys = EMPTY_STREAM_KEYS,
  onChoose,
  disabled = false,
}: CafeStreamChoicesProps) {
  const t = useT()
  if (options.length === 0) {
    return <p className="cafe-stream-choices__empty">{streamLabel(t, null)}</p>
  }
  const ranked = [...options].sort(
    (a, b) => myRank(a, homeStream, myStreamKeys) - myRank(b, homeStream, myStreamKeys),
  )
  return (
    <div className="cafe-stream-choices">
      <div className="cafe-stream-choices__list" role="group" aria-label={t('kitchen.log.stream.pickerAria')}>
        {ranked.map((option) => {
          const isMine = isMineStream(option, homeStream, myStreamKeys)
          return (
            <button
              key={streamKey(option.branch.id, option.activity)}
              type="button"
              className="cafe-stream-choices__option"
              disabled={disabled}
              onClick={() => onChoose(option)}
            >
              <span className="cafe-stream-choices__name">{streamLabel(t, option)}</span>
              {isMine && <span className="cafe-stream-choices__tag">{t('cafe.stream.yourTeam')}</span>}
              {option.produces === false && (
                <span className="cafe-stream-choices__tag cafe-stream-choices__tag--muted">
                  {t('kitchen.stream.receivingOnly.tag')}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p className="cafe-stream-choices__hint">{t('cafe.stream.noDefaultHint')}</p>
    </div>
  )
}
