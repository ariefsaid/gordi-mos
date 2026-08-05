import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

/**
 * useListboxPopover (GAP-8 / OD-REDESIGN-91 #13) — the ONE keyboard contract for every custom
 * listbox popover in the app (person-picker, signal category picker, the @-mention combobox, and
 * any future option popover). It implements the ARIA "listbox with aria-activedescendant" pattern
 * so a keyboard/SR user gets identical navigation everywhere instead of each picker re-inventing
 * (or omitting) arrows/Home/End/Escape/focus-return.
 *
 * The listbox element itself holds focus (tabIndex 0); `aria-activedescendant` points at the active
 * option's id. Options are NOT individually focusable — the cursor is virtual, so arrow keys never
 * fight the browser's own focus order. On open the listbox takes focus and remembers the opener; on
 * close (Escape or unmount) focus returns to that opener, so the popover is never a focus dead end.
 *
 * Combobox idiom (the mention picker): when the TEXT INPUT keeps focus and drives the query, pass
 * `manageFocus: false` — the hook then owns only the active index + key routing (the caller forwards
 * the input's keydown through `onKeyDown`), never stealing focus from the input.
 */
export interface UseListboxPopoverArgs {
  /** Number of options the active cursor can move across. */
  itemCount: number
  /** Fired with the active index on Enter / Space (skipped if that option is disabled). */
  onSelect: (index: number) => void
  /** Fired on Escape — the caller dismisses the popover; the hook returns focus to the opener. */
  onClose: () => void
  /** Optional per-index disabled predicate; disabled options are skipped by arrow nav + select. */
  isDisabled?: (index: number) => boolean
  /** Active option when the popover opens (default 0). */
  initialActive?: number
  /**
   * When true (default) the hook focuses the listbox on open and restores focus to the opener on
   * close — the listbox idiom. Pass false for the combobox idiom, where a text input keeps focus.
   */
  manageFocus?: boolean
}

export interface ListboxOptionProps {
  id: string
  role: 'option'
  'data-active': boolean | undefined
}

export interface UseListboxPopoverResult<E extends HTMLElement = HTMLDivElement> {
  /** The virtual cursor index; clamped to [0, itemCount-1] (or -1 when empty). */
  activeIndex: number
  setActiveIndex: (index: number) => void
  /** Spread onto the listbox container element. */
  listboxProps: {
    ref: (node: E | null) => void
    role: 'listbox'
    tabIndex: number
    'aria-activedescendant': string | undefined
    onKeyDown: (event: ReactKeyboardEvent) => void
  }
  /** Props for the option at `index` (id + role + active flag for styling). */
  getOptionProps: (index: number) => ListboxOptionProps
  /** The stable dom id of the option at `index` (for aria-activedescendant / scroll-into-view). */
  optionId: (index: number) => string
  /** Route a keydown from a combobox text input through the listbox navigation (manageFocus:false). */
  onKeyDown: (event: ReactKeyboardEvent) => void
}

export function useListboxPopover<E extends HTMLElement = HTMLDivElement>(
  args: UseListboxPopoverArgs,
): UseListboxPopoverResult<E> {
  const { itemCount, onSelect, onClose, isDisabled, initialActive = 0, manageFocus = true } = args
  const baseId = useId()
  const listboxRef = useRef<E | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  const firstEnabled = useCallback((): number => {
    for (let i = 0; i < itemCount; i += 1) if (!isDisabled?.(i)) return i
    return -1
  }, [itemCount, isDisabled])

  const [activeIndex, setActiveIndexState] = useState<number>(() => {
    if (itemCount <= 0) return -1
    const start = Math.min(Math.max(initialActive, 0), itemCount - 1)
    return isDisabled?.(start) ? -1 : start
  })

  const setActiveIndex = useCallback((index: number) => setActiveIndexState(index), [])

  // Clamp / re-seat the active index when the option set changes (e.g. a combobox re-filters).
  useEffect(() => {
    setActiveIndexState((current) => {
      if (itemCount <= 0) return -1
      if (current < 0 || current >= itemCount || isDisabled?.(current)) return firstEnabled()
      return current
    })
  }, [itemCount, firstEnabled, isDisabled])

  // Focus management (listbox idiom only): on mount take focus + remember the opener; on unmount of
  // the listbox element (Escape / select / toggle-closed / outside-close) return focus to the opener.
  // Keying off the ref node (not a component-unmount effect) covers pickers that toggle their listbox
  // in place inside a persistent component, not only pickers whose whole component unmounts.
  const setRef = useCallback((node: E | null) => {
    if (!manageFocus) { listboxRef.current = node; return }
    if (node) {
      const active = document.activeElement
      if (active instanceof HTMLElement && active !== node) openerRef.current = active
      node.focus()
    } else {
      openerRef.current?.focus?.()
    }
    listboxRef.current = node
  }, [manageFocus])

  const optionId = useCallback((index: number) => `${baseId}-opt-${index}`, [baseId])

  const move = useCallback((dir: 1 | -1) => {
    setActiveIndexState((current) => {
      if (itemCount <= 0) return -1
      let next = current
      for (let step = 0; step < itemCount; step += 1) {
        next = (next + dir + itemCount) % itemCount
        if (next === current && step === 0 && current < 0) next = dir === 1 ? 0 : itemCount - 1
        if (!isDisabled?.(next)) return next
      }
      return current
    })
  }, [itemCount, isDisabled])

  const jump = useCallback((edge: 'home' | 'end') => {
    setActiveIndexState(() => {
      if (edge === 'home') return firstEnabled()
      for (let i = itemCount - 1; i >= 0; i -= 1) if (!isDisabled?.(i)) return i
      return -1
    })
  }, [itemCount, isDisabled, firstEnabled])

  const onKeyDown = useCallback((event: ReactKeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        move(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        move(-1)
        break
      case 'Home':
        event.preventDefault()
        jump('home')
        break
      case 'End':
        event.preventDefault()
        jump('end')
        break
      case 'Enter':
      case ' ':
        if (activeIndex >= 0 && !isDisabled?.(activeIndex)) {
          event.preventDefault()
          onSelect(activeIndex)
        }
        break
      case 'Escape':
        // D-B2 isolation: consume Escape here so it dismisses the popover locally and never bubbles
        // to a host panel (which would close the whole surface). Focus returns via the unmount effect.
        event.preventDefault()
        event.stopPropagation()
        onClose()
        break
    }
  }, [move, jump, activeIndex, isDisabled, onSelect, onClose])

  const getOptionProps = useCallback((index: number): ListboxOptionProps => ({
    id: optionId(index),
    role: 'option',
    'data-active': index === activeIndex ? true : undefined,
  }), [optionId, activeIndex])

  return {
    activeIndex,
    setActiveIndex,
    listboxProps: {
      ref: setRef,
      role: 'listbox',
      tabIndex: 0,
      'aria-activedescendant': activeIndex >= 0 ? optionId(activeIndex) : undefined,
      onKeyDown,
    },
    getOptionProps,
    optionId,
    onKeyDown,
  }
}
