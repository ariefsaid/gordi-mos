import type { ReactNode } from 'react'
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
 * NO CALLER YET (#190). v4's version of this note lists three hosts that "mount THIS component"
 * — Home's order radiogroup at ≤390px, the Tasks member phone filter stack (OD-REDESIGN-61), the
 * Signals collection toolbar. None of those surfaces has ported, so the list is dropped rather than
 * carried as a claim about code that is not here. It ships now because it is the primitive those
 * three would otherwise each re-invent, and its own suite holds the contract until they arrive.
 */
export interface ViewOptionsDisclosureProps {
  /** Whether the panel is expanded. */
  open: boolean
  /** Toggle handler (the host owns the open state + persistence, if any). */
  onToggle: () => void
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
  const chevronCls = chevronClassName
    ? `${chevronClassName}${open ? ` ${chevronClassName}--open` : ''}`
    : undefined
  return (
    <div className={className}>
      <button
        type="button"
        className={triggerClassName}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span>{label}</span>
        {summary != null && (
          <span className={summaryClassName} aria-hidden="true">{summary}</span>
        )}
        <Chevron className={chevronCls} />
      </button>
      {open && (
        <div id={panelId} className={panelClassName}>
          {children}
        </div>
      )}
    </div>
  )
}
