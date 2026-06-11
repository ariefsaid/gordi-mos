// TimingChip — shared on-time/late pill (FIX-5).
// Extracted from WeeklyUpdateReviewPane (CSS-class) + WeeklyUpdateWritePane (inline).
// Partially addresses the backlog TintPill item.
// Tokens: success/14% bg + --status-won-text for on-time; warning/18% bg + warning-foreground for late.
import { weeklyUpdateTiming } from '../../lib/week'
import './TimingChip.css'

interface TimingChipProps {
  submittedAt: string
  weekStart: string
}

export default function TimingChip({ submittedAt, weekStart }: TimingChipProps) {
  const onTime = weeklyUpdateTiming(submittedAt, weekStart) === 'on-time'
  return (
    <span className={`timing-chip ${onTime ? 'timing-chip-ontime' : 'timing-chip-late'}`}>
      <span className="timing-chip-dot" aria-hidden="true" />
      {onTime ? 'on time' : 'late'}
    </span>
  )
}
