// FreshnessLabel — the reusable "as of {timestamp}" chip (D11 obligation).
// General primitive: one timestamp in, formatted local text out. Every reporting
// figure carries one (page head + ChartFrame freshness slot). Token-only (DESIGN.md
// §2.4): muted-foreground text, .tabular timestamp digits.
import './freshness-label.css'

export interface FreshnessLabelProps {
  asOf: string | Date
  /** default "as of" */
  prefix?: string
}

export function FreshnessLabel({ asOf, prefix = 'as of' }: FreshnessLabelProps) {
  const date = asOf instanceof Date ? asOf : new Date(asOf)
  const formatted = date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <span className="freshness-label">
      {prefix} <span className="tabular freshness-label-ts">{formatted}</span>
    </span>
  )
}
