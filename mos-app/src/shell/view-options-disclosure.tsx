import type { ReactNode } from 'react'
import { Chevron } from './icons'

/**
 * ViewOptionsDisclosure — the ONE capture-first "View options" disclosure primitive
 * (Rule 8 capture-first · Rule 11 component reuse). A compact trigger (label + optional
 * decorative summary + a chevron) that toggles a collapsible panel of secondary controls.
 *
 * Both hosts mount THIS component:
 *   - Home  — folds the attention/personal order radiogroup behind it at ≤390px.
 *   - Tasks — folds the member phone filter stack behind it (OD-REDESIGN-61).
 *   - Signals — folds the collection toolbar behind it so the first Signal leads on phone.
 *
 * The behavior + a11y wiring (aria-expanded ↔ open, aria-controls ↔ panel id, decorative
 * aria-hidden summary) live here once. Each host passes its OWN skin classes, so the
 * distinct computed styles (Home's right-aligned pill vs Tasks' full-width header) are
 * preserved byte-for-byte — reuse of behavior, skinned per context.
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
