import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Chevron } from './icons'

/**
 * ViewOptionsDisclosure — the ONE capture-first "View options" disclosure primitive
 * (Rule 8 capture-first · Rule 11 component reuse). A compact trigger (label + optional
 * decorative summary + a chevron) that toggles a collapsible panel of secondary controls.
 *
 * The behavior + a11y wiring (aria-expanded ↔ open, aria-controls ↔ panel id, decorative
 * aria-hidden summary) live here once. Each host passes its OWN skin classes, so the distinct
 * computed styles (a right-aligned pill vs a full-width header) are preserved — reuse of behavior,
 * skinned per context.
 *
 * Live callers (#379): the Tasks workspace phone wrapper and the Signals archive phone wrapper —
 * both host a CollectionToolbar inside this door. The desktop "View & filters" door is
 * CollectionToolbar's own trigger, which carries the same Escape contract.
 */
export interface ViewOptionsDisclosureProps {
  /** Whether the panel is expanded. */
  open: boolean
  /** Toggle handler (the host owns the open state + persistence, if any). */
  onToggle: () => void
  /**
   * Explicit close for the Escape key (I3: Esc closes + focus returns to the trigger). Falls
   * back to `onToggle` — from `open` a toggle IS a close — so existing hosts keep working.
   */
  onClose?: () => void
  /** Visible trigger label, e.g. "View options". */
  label: string
  /** Optional decorative summary of the current selection (aria-hidden). */
  summary?: string
  /** id wiring aria-controls ↔ the panel. */
  panelId: string
  /** Skin hooks — kept explicit so each host preserves its own computed style. */
  className?: string
  triggerClassName?: string
  summaryClassName?: string
  chevronClassName?: string
  panelClassName?: string
  children: ReactNode
}

export function ViewOptionsDisclosure({
  open,
  onToggle,
  onClose,
  label,
  summary,
  panelId,
  className,
  triggerClassName,
  summaryClassName,
  chevronClassName,
  panelClassName,
  children,
}: ViewOptionsDisclosureProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  // I3 (issue #379): Escape closes the disclosure and leaves focus on the trigger — the
  // disclosure's focus home. stopPropagation shields outer owners (the window keyboard layer's
  // Escape) so one Escape performs one action; a nested owner inside the panel (a field with its
  // own Escape, I5) stops propagation first and wins.
  const onKeyDown = (event: KeyboardEvent) => {
    if (!open || event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    ;(onClose ?? onToggle)()
    triggerRef.current?.focus()
  }
  const chevronCls = chevronClassName
    ? `${chevronClassName}${open ? ` ${chevronClassName}--open` : ''}`
    : undefined
  return (
    <div className={className}>
      <button
        type="button"
        ref={triggerRef}
        className={triggerClassName}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        onKeyDown={onKeyDown}
      >
        <span>{label}</span>
        {summary != null && (
          <span className={summaryClassName} aria-hidden="true">{summary}</span>
        )}
        <Chevron className={chevronCls} />
      </button>
      {open && (
        <div id={panelId} className={panelClassName} onKeyDown={onKeyDown}>
          {children}
        </div>
      )}
    </div>
  )
}
