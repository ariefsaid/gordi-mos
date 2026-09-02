// HelpTip — the shared "?" domain-term help disclosure (H10 Help & Documentation).
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// onboard (2026-07-28) — WHY THIS WAS REBUILT
//
// The previous implementation was a `<button>` carrying `title` + `aria-label` and NOTHING
// else: no state, no click handler, no panel. Its own header comment argued that "the browser
// supplies hover/focus disclosure … so there is no custom popover to own". That is true on a
// desktop with a mouse. It is false on the device this product is designed for.
//
// The native `title` tooltip is triggered by `mouseover` and by keyboard focus. Touch input
// produces neither. On a phone — PRODUCT.md principle 3, "the floor is the hard case", and the
// persona `jtbd.md` puts mid-shift on a phone with wet hands — tapping the `?` did nothing at
// all. Not "showed a worse tooltip": nothing. So the app's ENTIRE in-app help apparatus, the
// intervention aimed at its weakest heuristic (H10, 2.0/4), was invisible to its primary user.
//
// It is now a real disclosure:
//   • click/tap toggles a panel — the interaction touch users actually have;
//   • hover still opens it on devices that hover, so nothing is lost for desktop;
//   • keyboard: Tab to it and press Enter/Space — the standard disclosure contract that
//     `aria-expanded` promises. Focus deliberately does NOT auto-open: focus fires before
//     click, so an auto-opening focus handler makes a real tap open-then-immediately-close.
//   • Escape closes and returns focus to the button; an outside pointerdown closes it;
//   • `aria-expanded` + `aria-controls` describe the real state, and the panel is `role="note"`
//     in a polite live region so AT announces the content when it opens. `title` is REMOVED —
//     keeping it would double-render the same text as a native tooltip over the panel.
//   • position is measured from the button's rect and clamped to the viewport, so the panel can
//     never hang off the right edge of a 375px screen (the failure mode of a CSS-only popover
//     anchored to a control that sits in a right-aligned meta slot).
// ─────────────────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { clampPopoverGeometry } from './clamp-popover-offset'
import { usePopoverReflow } from './use-popover-reflow'
import './help-tip.css'

export interface HelpTipProps {
  /** Already-translated help text (caller passes t('…')). Doubles as the accessible name. */
  label: string
  className?: string
}

/** Panel geometry, in viewport coordinates (the panel is position:fixed). */
interface Placement {
  top: number
  left: number
  width: number
}

const PANEL_MAX_WIDTH = 288
const VIEWPORT_MARGIN = 12
const ANCHOR_GAP = 8

export function HelpTip({ label, className }: HelpTipProps) {
  const t = useT()
  const panelId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // Two independent reasons the panel can be showing, kept apart on purpose. A single `open`
  // boolean driven by BOTH hover and click self-destructs: a real mouse click fires
  // pointerenter (→ open) and then click (→ toggle → closed), so clicking the "?" would shut
  // the panel it had just opened; the same collision happens on touch between focus and click.
  // `pinned` is the user's explicit choice, `hovered` is transient; the panel shows if either
  // holds, and moving the mouse away can never dismiss something the user deliberately opened.
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const open = pinned || hovered
  const [placement, setPlacement] = useState<Placement | null>(null)

  const reposition = useCallback(() => {
    const button = buttonRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    // Centre on the glyph, then clamp (#621, shared with the admin ⋯ menu and the signal category
    // picker) so the panel stays fully on screen. A meta-slot "?" often sits within ~20px of the
    // right edge on a phone; without the clamp the panel would overflow and the page would scroll
    // sideways (PRODUCT.md: the body must never scroll horizontally).
    const centred = rect.left + rect.width / 2 - PANEL_MAX_WIDTH / 2
    const { left, maxWidth } = clampPopoverGeometry({
      anchorLeft: centred,
      popoverWidth: PANEL_MAX_WIDTH,
      viewportWidth: window.innerWidth,
      margin: VIEWPORT_MARGIN,
    })
    setPlacement({ top: rect.bottom + ANCHOR_GAP, left, width: maxWidth })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    reposition()
  }, [open, reposition])

  // A scroll or resize moves the anchor; recompute rather than leave the panel stranded.
  usePopoverReflow(open, reposition)

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setPinned(false)
      setHovered(false)
      buttonRef.current?.focus()
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setPinned(false)
      setHovered(false)
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [open])

  return (
    <span className={`help-tip-anchor${className ? ` ${className}` : ''}`}>
      <button
        ref={buttonRef}
        type="button"
        className="help-tip"
        aria-label={t('common.help')}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        /* polish (2026-07-28): `data-touch-target="true"` was ALSO opting this button into the
           blunt global `min-height: 44px` phone rule (Button.css), which stretched the 14x14
           glyph into a 14x44 capsule at 375px — measured live, and visibly inconsistent with
           the same control's 14x14 circle on desktop. HelpTip does not need that rule: it is
           the component that solves target size the precise way, with `::before{inset:-16px}`
           (help-tip.css), giving a 46x46 hit area while the glyph stays 14x14. Two mechanisms
           for one job, and the blunt one was the one you could see. The attribute is removed,
           not the floor — re-measured at 375px after the change: still 46x46. */
        onClick={() => setPinned(v => !v)}
        // Hover keeps the desktop affordance the old `title` provided, for mice only — a
        // touch pointer must not fake a hover state that then sticks with no way to dismiss it.
        onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true) }}
        onPointerLeave={event => { if (event.pointerType === 'mouse') setHovered(false) }}
      >
        ?
      </button>
      {open && placement && (
        <div
          ref={panelRef}
          id={panelId}
          role="note"
          aria-live="polite"
          className="help-tip-panel"
          style={{ top: placement.top, left: placement.left, width: placement.width }}
        >
          {label}
        </div>
      )}
    </span>
  )
}
