// MetricSummaryRule — DESIGN.md § "Metric summary rule (v4, 2026-07-27)".
// The band that states a surface's derived figures: ONE inline line — label at
// label size in muted-foreground, value at body-lg/600 tabular, ~22px apart,
// closed by a single 1px hairline underneath. No card, no shadow, no radius, and
// NO WIDTH BRANCH: the component takes no isDesktop — the same rule renders at
// every breakpoint. A delta renders only when the caller passes one that carries
// a state worth acting on (destructive/success); neutral deltas and restating
// captions are the CALLER's to omit (the derivation layer enforces that).
// `variant="inline"` is the page-head meta line (kl-meta-line idiom): same type
// ramp, no hairline, tighter gaps — a placement choice, never a viewport one.
// First consumer of the rule as a shared primitive: pricing-page's .pp-meta is
// the page-local original (ADR-flagged for later migration); DD-WAY-40 assigns
// this to Café Review (#422) and Café Plan (#401).
import type { ReactNode } from 'react'
import './metric-summary-rule.css'

export interface MetricSummaryDelta {
  text: string
  tone: 'destructive' | 'success'
}

export interface MetricSummaryItem {
  key: string
  label: string
  value: string
  delta?: MetricSummaryDelta
}

export interface MetricSummaryRuleProps {
  /** accessible name for the band (ignored by the inline variant) */
  ariaLabel?: string
  metrics: readonly MetricSummaryItem[]
  variant?: 'band' | 'inline'
}

export function MetricSummaryRule({ ariaLabel, metrics, variant = 'band' }: MetricSummaryRuleProps): ReactNode {
  const body = metrics.map(m => (
    <span className="msr-item" key={m.key}>
      <span className="msr-label">{m.label}</span>
      <span className="msr-value tabular">{m.value}</span>
      {m.delta && <span className={`msr-delta msr-delta--${m.delta.tone}`}>{m.delta.text}</span>}
    </span>
  ))
  if (variant === 'inline') {
    return <div className="msr msr--inline">{body}</div>
  }
  return (
    <section className="msr" role="group" aria-label={ariaLabel ?? 'Summary'}>
      {body}
    </section>
  )
}