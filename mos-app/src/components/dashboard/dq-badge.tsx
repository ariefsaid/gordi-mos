// DQBadge — the data-quality badge from BOM coverage (design-plan §2.10, FR-024/AC-024).
// Maps DQ onto the ratified warning/success/neutral status families — no new hue
// (--dq-* semantic mapping, design-plan §6.2). partial → warning, good → success,
// unknown → neutral. Always carries a leading dot (status semantics, unlike BasisChip).
import './dq-badge.css'

export type DqState = 'good' | 'partial' | 'unknown'

export interface DQBadgeProps {
  dq: DqState
}

const LABEL: Record<DqState, string> = {
  good: 'BOM coverage: good',
  partial: 'BOM coverage: partial',
  unknown: 'BOM coverage: unknown',
}

export function DQBadge({ dq }: DQBadgeProps) {
  return (
    <span className={`dq-badge dq-badge--${dq}`}>
      <span className="dot" aria-hidden="true" />
      {LABEL[dq]}
    </span>
  )
}
