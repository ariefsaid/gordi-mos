// StatusPill — task lifecycle pill. Records-workspace IxD: renders the soft
// rounded <Tag> (mos-design-kit 30-color palette) with a leading status dot,
// matching the signed records-table status tags. Color mapping keeps the
// semantic hues: In Progress→blue, Blocked→red, Open→amber, Done→green.
//
// The leading dot is localized to StatusPill (the base Tag stays dot-less).
// The dot is aria-hidden and inherits the Tag's
// status-tinted text color, so it is a redundant cue only — the visible status
// word is always the accessible name. WCAG 1.4.1 stays satisfied even without
// the dot, so the word remains the non-color cue.
import type { TaskStatus } from '@/lib/db/tasks.types'
import { Tag } from '@/components/ui/tag'
import type { TagColor } from '@/components/ui/tag'
import './status-pill.css'
import { useT } from '@/i18n/use-t'
import { statusTone } from './status-tone'

export type { TaskStatus }

type StatusPillProps = {
  status: TaskStatus
  label?: string
  /**
   * #191 (Home port) — Home's consequence-ranked stream renders StatusPill beside its own reason
   * chip in the same row tail (stream-row.tsx), and some reason tones are amber too — a
   * heavy-saturated "Open" pill next to them reads as a third warning tier instead of the neutral
   * not-yet-started baseline it actually is (design-review F3; rule:product-color-state-vocab,
   * rule:product-ban-heavy-inactive-color). 'neutral' swaps Open's amber for the DESIGN.md §5
   * "Default/neutral badge" pair (secondary-family bg + muted-foreground text); In Progress/
   * Blocked/Done are unaffected either way. Default 'flagged' is byte-identical to the pre-existing
   * behavior, so every other StatusPill call site (Tasks, Admin, Follow-ups, Weekly, RecordField)
   * is untouched.
   */
  openTreatment?: 'flagged' | 'neutral'
}

// The design-kit Tag palette is intentionally soft, but its light text tokens for
// status tags can miss the 4.5:1 small-text threshold. Reuse the ratified E7
// darkened semantic text roles while preserving each Tag background/hue.
const STATUS_TEXT_COLOR: Record<TaskStatus, string> = {
  'In Progress': 'var(--status-open-text)',
  'Blocked': 'var(--status-lost-text)',
  'Open': 'var(--warning-foreground)',
  'Done': 'var(--status-won-text)',
}

export function StatusPill({ status, label, openTreatment = 'flagged' }: StatusPillProps) {
  const t = useT()
  const localizedStatus = status === 'Open'
    ? t('tasks.status.open')
    : status === 'In Progress'
      ? t('tasks.status.inProgress')
      : status === 'Blocked'
        ? t('tasks.status.blocked')
        : t('tasks.status.done')
  const neutralOpen = status === 'Open' && openTreatment === 'neutral'
  const color: TagColor = neutralOpen ? 'gray' : statusTone(status)
  const textColor = neutralOpen ? 'var(--muted-foreground)' : STATUS_TEXT_COLOR[status]
  // NO aria-label: the visible text IS the accessible name. Status pickers render
  // StatusPill inside a role=option / button, and an aria-label would override the
  // option's computed name, breaking status-change (AC-071/103/111).
  return (
    <Tag
      color={color}
      weight="medium"
      className="status-pill"
      style={{ color: textColor }}
      Icon={<span className="status-dot" aria-hidden="true" />}
    >
      {label ?? localizedStatus}
    </Tag>
  )
}
