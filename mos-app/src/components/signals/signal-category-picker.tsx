import { useLayoutEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { useListboxPopover } from '@/components/ui/use-listbox-popover'
import { clampPopoverOffset } from '@/components/ui/clamp-popover-offset'
import { SIGNAL_CATEGORIES, type SignalCategory } from '@/lib/db/signals.types'

// The shared 8-family category affordance (D28), extracted from signal-card + signal-record so the
// two never drift. When the Signal is uncategorised it renders an "Add category" toggle that opens
// the 8-family listbox; once set it renders the category pill. Post-capture enrichment — it never
// blocks capture and correcting a category is allowed.

export interface SignalCategoryPickerProps {
  category: SignalCategory | null
  onCategorize?: (category: SignalCategory) => void
}

export function SignalCategoryPicker({ category, onCategorize }: SignalCategoryPickerProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  // #577: on a right-column feed row the anchor can sit within a few px of the viewport's right
  // edge; the popover's own `left: 0` CSS default then pushes it (min-width 200px) past the
  // window edge, hard-clipping options mid-word. `leftOffset` shifts it back on-screen.
  const [leftOffset, setLeftOffset] = useState(0)

  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    const popover = popoverRef.current
    if (!anchor || !popover) return
    setLeftOffset(clampPopoverOffset({
      anchorLeft: anchor.getBoundingClientRect().left,
      popoverWidth: popover.getBoundingClientRect().width,
      viewportWidth: window.innerWidth,
    }))
  }, [open])

  function pick(next: SignalCategory) {
    onCategorize?.(next)
    setOpen(false)
  }

  // GAP-8 (OD-91 #13): route the 8-family listbox through the shared keyboard contract — arrows/
  // Home/End move the aria-activedescendant cursor, Enter/Space picks, Escape closes + returns focus.
  const { listboxProps, getOptionProps, activeIndex } = useListboxPopover({
    itemCount: SIGNAL_CATEGORIES.length,
    onSelect: (index) => { const next = SIGNAL_CATEGORIES[index]; if (next) pick(next) },
    onClose: () => setOpen(false),
  })

  if (category) {
    return <span className="signal-category-pill">{category}</span>
  }

  return (
    <span className="signal-category-picker-anchor" ref={anchorRef}>
      <Button variant="ghost" onClick={() => setOpen((v) => !v)}>
        {t('signals.record.addCategory')}
      </Button>
      {open && (
        <div
          {...listboxProps}
          ref={(node) => { listboxProps.ref(node); popoverRef.current = node }}
          aria-label={t('signals.record.categoryPickerLabel')}
          className="signal-category-picker"
          style={{ left: leftOffset }}
        >
          {SIGNAL_CATEGORIES.map((option, index) => (
            <button
              type="button"
              key={option}
              {...getOptionProps(index)}
              tabIndex={-1}
              aria-selected={index === activeIndex}
              className={`signal-category-option${index === activeIndex ? ' is-active' : ''}`}
              onClick={() => pick(option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
