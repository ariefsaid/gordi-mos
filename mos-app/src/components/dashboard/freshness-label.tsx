// FreshnessLabel — the reusable "as of {timestamp}" chip (D11 obligation).
// General primitive: one timestamp in, formatted local text out. Every reporting
// figure carries one (page head + ChartFrame freshness slot). Token-only (DESIGN.md
// §2.4): muted-foreground text, .tabular timestamp digits.
import './freshness-label.css'
import { formatWibDateTime } from '@/lib/wib-time'

export interface FreshnessLabelProps {
  asOf: string | Date
  /** default "as of" */
  prefix?: string
}

export function FreshnessLabel({ asOf, prefix = 'as of' }: FreshnessLabelProps) {
  return (
    <span className="freshness-label">
      {prefix} <span className="tabular freshness-label-ts">{formatWibDateTime(asOf)}</span>
    </span>
  )
}
