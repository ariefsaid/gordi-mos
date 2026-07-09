// FailLoudBadge — the fail-loud freshness/certification badge (ADR-0022 D6 / anchor A7).
// Renders a STALE / UNCERTIFIED warning (destructive tint) when the cost basis is stale or its metric
// definition is uncertified; renders nothing (or a quiet "certified + fresh" note) when healthy.
// role=status + aria-live=polite so a screen reader announces the warning. Token-only (DESIGN.md).
import type { CostStatus } from '@/lib/plan-budget-logic'
import './fail-loud-badge.css'

export interface FailLoudBadgeProps {
  status: CostStatus
  /** When true (default), a healthy basis renders a quiet "Certified + fresh" note; false = render null. */
  showHealthy?: boolean
}

export function FailLoudBadge({ status, showHealthy = true }: FailLoudBadgeProps) {
  if (status.fresh) {
    if (!showHealthy) return null
    return (
      <span className="fail-loud fail-loud--ok" role="status">
        <span className="fail-loud-dot" aria-hidden="true" />
        Certified · fresh
      </span>
    )
  }
  return (
    <span className="fail-loud fail-loud--warn" role="status" aria-live="polite">
      <span className="fail-loud-dot" aria-hidden="true" />
      <span className="fail-loud-text">
        {status.reasons.length > 0 ? status.reasons.join(' ') : 'Cost basis is not certified or is stale.'}
      </span>
    </span>
  )
}
