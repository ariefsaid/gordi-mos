import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { useListboxPopover } from '@/components/ui/use-listbox-popover'
import { clampPopoverGeometry } from '@/components/ui/clamp-popover-offset'
import { usePopoverReflow } from '@/components/ui/use-popover-reflow'
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
  // #577/#621: on a right-column feed row the anchor can sit within a few px of the viewport's
  // right edge; the popover's own `left: 0` CSS default then pushes it (min-width 200px) past the
  // window edge, hard-clipping options mid-word. `geometry` shifts it back on-screen and, if the
  // popover itself is wider than the viewport, caps its width too (#621: it previously only
  // shifted — a phone narrower than the 200px listbox could still overflow).
  const [geometry, setGeometry] = useState<{ left: number; maxWidth: number } | null>(null)

  const reposition = useCallback(() => {
    const anchor = anchorRef.current
    const popover = popoverRef.current
    if (!anchor || !popover) return
    const anchorLeft = anchor.getBoundingClientRect().left
    const { left, maxWidth } = clampPopoverGeometry({
      anchorLeft,
      popoverWidth: popover.getBoundingClientRect().width,
      viewportWidth: window.innerWidth,
    })
    // `left` comes back in the same coordinate space as `anchorLeft` (viewport px); the popover
    // is positioned `absolute` inside the `relative` anchor, so the style needs the offset FROM
    // the anchor's own left edge, not the absolute viewport position.
    setGeometry({ left: left - anchorLeft, maxWidth })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    reposition()
  }, [open, reposition])

  // #621: re-measure on scroll/resize while open — previously only computed once, on open, so a
  // popover left open through an orientation change or page scroll could drift off-screen.
  usePopoverReflow(open, reposition)

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
          style={{ left: geometry?.left ?? 0, maxWidth: geometry?.maxWidth }}
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
