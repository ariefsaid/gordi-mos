import type { ReactNode } from 'react'

interface PageHeadProps {
  title: string
  subtitle?: string
  /**
   * Right-aligned slot for the count/meta line that sits on the title's baseline
   * ("N tasks", "Tue 17 Jun · N log entries"). Folded in from the bespoke
   * `.tasks-count-line` / `.ops-count-line` variants (IA-1, PR-1).
   */
  meta?: ReactNode
  /**
   * Optional content cap in px (e.g. 1280 for the Tasks data variant) so a
   * data-variant head keeps its cap while prose heads stay uncapped.
   */
  maxWidth?: number
}

/**
 * The single page header for every route (IA-1, PR-1). Title → content gap is
 * 16px (the list/data value) for all routes; subtitle stays 14px / mt 6px.
 */
export default function PageHead({ title, subtitle, meta, maxWidth }: PageHeadProps) {
  return (
    <div
      data-testid="page-head"
      style={{ marginBottom: 16, ...(maxWidth ? { maxWidth } : {}) }}
    >
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1
          className="font-bold text-foreground"
          style={{ fontSize: 24, lineHeight: 1.2, letterSpacing: '-0.02em' }}
        >
          {title}
        </h1>
        {meta && <span className="ml-auto">{meta}</span>}
      </div>
      {subtitle && (
        <p className="text-muted-foreground mt-[6px]" style={{ fontSize: 14 }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}
