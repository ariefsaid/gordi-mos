import { useT } from '@/i18n/use-t'
import type { StreamReason as StreamReasonType } from '@/lib/home-stream'
import type { MessageKey } from '@/i18n/messages'

const REASON_KEY: Record<StreamReasonType['tone'], MessageKey> = {
  urgent: 'home.stream.reason.urgent',
  attention: 'home.stream.reason.needsAttention',
  overdue: 'home.stream.reason.overdue',
  due: 'home.stream.reason.dueToday',
  blocked: 'home.stream.reason.blocked',
  check: 'home.stream.reason.failedCheck',
  mention: 'home.stream.reason.mention',
}

/**
 * How a band renders its rows' reason.
 *
 * `chip`  — the tinted pill. Correct where the reason VARIES row to row inside the band, so the
 *           mark is exceptional/sparse (the Signals band mixes Urgent/Needs attention; the my-work
 *           band flags the odd Blocked row). DESIGN.md § Row status as text: "Pills remain correct
 *           where status is exceptional or sparse."
 * `text`  — toned text, same tone semantics, no fill. For a reason that is true of EVERY row in the
 *           band at rest but still carries information the band label does not (the overdue age,
 *           "Overdue · 11d"). DESIGN.md § Row status as text (v4).
 * `none`  — the reason restates the band label verbatim ("Due today" under DUE TODAY · 2,
 *           "Check failed" under FAILED CHECKS · 2, "Mentions you" under MENTIONS · 1, "Blocked"
 *           under BLOCKED · 1 beside a Blocked status pill). DESIGN.md Don't: "Don't repeat a value
 *           under a control that the row or card already renders as its own column/field."
 */
export type ReasonStyle = 'chip' | 'text' | 'none'

export function Reason({ reason, style }: { reason: StreamReasonType; style: ReasonStyle }) {
  const t = useT()
  if (style === 'none') return null
  const label = reason.tone === 'overdue'
    ? t('home.stream.reason.overdue', { days: reason.days ?? 0 })
    : t(REASON_KEY[reason.tone])
  const shell = style === 'text' ? 'stream-reason stream-reason--flat' : 'stream-reason'
  return <span className={`${shell} stream-reason--${reason.tone}`}>{label}</span>
}
