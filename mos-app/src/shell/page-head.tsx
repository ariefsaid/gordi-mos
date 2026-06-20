import type { ReactNode } from 'react'

type PageHeadProps = {
  title: string
  subtitle?: string
  /**
   * Count/meta slot that sits on the title's baseline, immediately after it
   * ("11 tasks · 2 blocked", "Tue 17 Jun · N log entries"). Folded in from the
   * bespoke `.tasks-count-line` / `.ops-count-line` variants (IA-1, PR-1).
   */
  meta?: ReactNode
  /**
   * Optional content cap in px (e.g. 1280 for the Tasks data variant) so a
   * data-variant head keeps its cap while prose heads stay uncapped.
   */
  maxWidth?: number
  /**
   * Presentation. 'prose' (default) — the 24px title + meta/subtitle head used by
   * My Week / Updates / Ops. 'content' — the list/DB-view `.content-header` chrome
   * from the signed mockup (mock-shell-and-table.html `.content-header`): a single
   * clean 48px row = entity icon + title + count pill + right-aligned inline action.
   */
  variant?: 'prose' | 'content'
  /**
   * Content-variant only — the integer record count rendered as the `.ch-count`
   * pill (mockup `.ch-count`). `null` (loading/error) omits the pill.
   */
  count?: number | null
  /**
   * Content-variant only — the right-aligned primary action node (mockup
   * `.ch-action`, e.g. the "+ New task" link). Rendered only when provided so
   * empty/error states can own their own create CTA.
   */
  action?: ReactNode
  /**
   * Content-variant only — the leading entity glyph (mockup `.ch-icon`). Defaults
   * to the Tasks list glyph; decorative (aria-hidden).
   */
  icon?: ReactNode
}

/** Default entity glyph for the content header — the list/records mark (mockup `☰`). */
function ListGlyph() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}

/**
 * The single page header for every route (IA-1, PR-1, RI-IA-1). Carries the
 * `page-head` testid in both presentations so the "one shared head" invariant
 * holds. Prose: title → content gap 16px; subtitle 14px / mt 6px. Content: the
 * mockup `.content-header` chrome (icon + title + count pill + inline action).
 */
export function PageHead({
  title, subtitle, meta, maxWidth,
  variant = 'prose', count, action, icon,
}: PageHeadProps) {
  if (variant === 'content') {
    return (
      <div
        data-testid="page-head"
        className="content-header"
        style={maxWidth ? { maxWidth } : undefined}
      >
        <span className="ch-icon" aria-hidden="true">{icon ?? <ListGlyph />}</span>
        <h1 className="ch-title">{title}</h1>
        {count != null && <span className="ch-count tabular-nums">{count}</span>}
        {/* Overdue/blocked subtotals + clearable filter chips ride beside the pill */}
        {meta && <span className="ch-meta">{meta}</span>}
        {action && <span className="ch-action">{action}</span>}
      </div>
    )
  }

  return (
    <div
      data-testid="page-head"
      style={{ marginBottom: 16, ...(maxWidth ? { maxWidth } : {}) }}
    >
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1
          className="font-semibold text-foreground"
          style={{ fontSize: 24, lineHeight: 1.2, letterSpacing: '-0.01em' }}
        >
          {title}
        </h1>
        {/* Meta/count sits immediately after the title (Linear-style "Tasks · 11 tasks"),
            NOT flung to the far edge — keeps the header anchored to the content. */}
        {meta && <span>{meta}</span>}
      </div>
      {subtitle && (
        <p className="text-muted-foreground mt-[6px]" style={{ fontSize: 14 }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}
