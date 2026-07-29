import type { ReactNode } from 'react'
import type { PageFamily } from './page-families'
import './page-head.css'

export interface PageHeadProps {
  title: string
  subtitle?: string
  jobSentence?: string
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
   * Content-variant only — a full-width row rendered BELOW the title row, inside the same
   * `.content-header` block (`.ch-status-row`). For a head whose page state is part of the
   * header itself rather than of the content beneath it (Home's day state: a rule-driven state
   * line + a progress track, mockup `home-priority-2026-07-28` `.hdr-state`).
   *
   * A head carrying a status row is rendered `--compact`: the header's height budget is fixed
   * (~70px), so the extra row is paid for by stepping the title down one rung (page-title →
   * body-lg). That coupling is deliberate — it is what stops the second row from turning the
   * shared head into a taller block on the one surface that most needs a short one.
   */
  statusRow?: ReactNode
  family?: PageFamily
}

/**
 * The single page header for every route (IA-1, PR-1, RI-IA-1). Carries the
 * `page-head` testid in both presentations so the "one shared head" invariant
 * holds. Prose: title → content gap 16px; subtitle 14px / mt 6px. Content: the
 * mockup `.content-header` chrome (icon + title + count pill + inline action).
 */
export function PageHead({
  title, subtitle, jobSentence, meta, maxWidth,
  variant = 'prose', count, action, statusRow, family,
}: PageHeadProps) {
  const v3ClassName = family ? ' page-head--v3' : ''
  if (variant === 'content') {
    const compactClassName = statusRow ? ' content-header--compact' : ''
    return (
      <div
        data-testid="page-head"
        className={`content-header${v3ClassName}${compactClassName}`}
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
        {subtitle && <p className="ch-subtitle">{subtitle}</p>}
        {/* A status row REPLACES the job sentence, it never stacks on top of it. Both are
            full-width rows and the header's budget is one of them (~70px); and where a head has
            a live status row, that row answers "what is this page for right now" better than the
            static registry sentence, which on Home only ASKED the question ("What needs my
            attention right now?"). ContextRow's suppression is keyed off the ROUTE registry, so
            this does not resurrect a duplicate sentence in region 2 either — the sentence is
            genuinely retired on such a head. Deliberate: see the Home day-header build note. */}
        {jobSentence && !statusRow && <p className="page-head-job">{jobSentence}</p>}
        {statusRow && <div className="ch-status-row">{statusRow}</div>}
      </div>
    )
  }

  return (
    <div
      data-testid="page-head"
      style={{ marginBottom: 16, ...(maxWidth ? { maxWidth } : {}) }}
      className={family ? 'page-head--v3' : undefined}
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
      {jobSentence && <p className="page-head-job">{jobSentence}</p>}
    </div>
  )
}
