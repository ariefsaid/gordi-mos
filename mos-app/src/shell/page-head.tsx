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
}

/**
 * The single page header for every route (IA-1, PR-1, RI-IA-1). Carries the
 * `page-head` testid in both presentations so the "one shared head" invariant
 * holds. Prose: title → content gap 16px; subtitle 14px / mt 6px. Content: the
 * mockup `.content-header` chrome (icon + title + count pill + inline action).
 */
export function PageHead({
  title, subtitle, meta, maxWidth,
  variant = 'prose', count, action,
}: PageHeadProps) {
  if (variant === 'content') {
    return (
      <div
        data-testid="page-head"
        className="content-header"
        style={maxWidth ? { maxWidth } : undefined}
      >
        {/* Cohesion-debt 2026-07-19, item #5 (owner call: "proceed with all items"):
            NO decorative surface-title glyph. The breadcrumb + job-sentence already
            name the surface; inconsistent title icons (≡ on Tasks/Signals/Money, ✉
            on Inbox, none on Home/Café) were the exact "several apps" tell.
            Consistent = none. */}
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
            NOT flung to the far edge — keeps the header anchored to the content.
            Cohesion-debt 2026-07-19, item #5 (owner call): the title-adjacent slot
            carries a count badge on some surfaces and a date on Café — both semantics
            kept, but ONE muted-text token so the slot reads the same, never dark body
            text competing with the title. */}
        {meta && <span className="page-head-meta">{meta}</span>}
      </div>
      {subtitle && (
        <p className="text-muted-foreground mt-[6px]" style={{ fontSize: 14 }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}
