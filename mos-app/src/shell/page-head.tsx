import type { ReactNode } from 'react'
import type { To } from 'react-router-dom'
import type { PageFamily } from './page-families'
import { PageBackLink } from './page-back-link'
import './page-head.css'

/**
 * The one page title block for every route: back link (above, left), title, count/meta on the title
 * line, the one primary action top-right, subtitle, freshness line. One type face, weight and size
 * (page-head.css `.ch-title`); no area restyles it.
 */
export interface PageHeadProps {
  title: string
  subtitle?: string
  jobSentence?: string
  /** Compact, always-visible companion to jobSentence (the sentence is screen-reader-only on phone). */
  titleHelp?: ReactNode
  /** Count/meta that sits on the title's baseline ("11 tasks · 2 blocked", a date). */
  meta?: ReactNode
  /** Optional content cap in px. */
  maxWidth?: number
  /** Record count rendered as a muted pill after the title; `null` omits it. */
  count?: number | string | null
  /** The right-aligned primary action node (desktop). Phone moves it to the bottom action bar. */
  action?: ReactNode
  /** Why the primary action is unavailable: one short line directly left of the button. */
  actionReason?: ReactNode
  /** Full-width row below the title row, inside the same block (Home's day state, Café's stream line). */
  statusRow?: ReactNode
  /** The one way back to the parent page (NV2): above the title, left edge. Never an `action`. */
  back?: { to?: To; onClick?: () => void; label: string }
  /** The one freshness line under the subtitle ("Sales through Mon 5 Oct · synced …"). */
  freshness?: ReactNode
  family?: PageFamily
  /** Extra class on the head element, for per-head opt-in modes. */
  headClassName?: string
}

export function PageHead({
  title, subtitle, jobSentence, titleHelp, meta, maxWidth,
  count, action, actionReason, statusRow, back, freshness, family, headClassName,
}: PageHeadProps) {
  const v3ClassName = family ? ' page-head--v3' : ''
  const compactClassName = statusRow ? ' content-header--compact' : ''
  return (
    <div
      data-testid="page-head"
      className={`content-header${v3ClassName}${compactClassName}${headClassName ? ` ${headClassName}` : ''}`}
      style={maxWidth ? { maxWidth } : undefined}
    >
      {back && <div className="ch-back"><PageBackLink to={back.to} onClick={back.onClick} label={back.label} /></div>}
      <h1 className="ch-title">{title}</h1>
      {titleHelp}
      {count != null && <span className="ch-count tabular-nums">{count}</span>}
      {meta && <span className="ch-meta">{meta}</span>}
      {action && <span className="ch-action">{actionReason ? <span className="ch-action__reason">{actionReason}</span> : null}{action}</span>}
      {subtitle && <p className="ch-subtitle">{subtitle}</p>}
      {freshness && <p className="ch-freshness">{freshness}</p>}
      {/* A status row REPLACES the job sentence, it never stacks on top of it (the header's budget
          is one full-width row). */}
      {jobSentence && !statusRow && <p className="page-head-job">{jobSentence}</p>}
      {statusRow && <div className="ch-status-row">{statusRow}</div>}
    </div>
  )
}
