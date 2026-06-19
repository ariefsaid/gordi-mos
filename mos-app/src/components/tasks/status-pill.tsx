// StatusPill — task lifecycle pill. Records-workspace IxD: renders the soft
// rounded <Tag> (mos-design-kit 30-color palette) with a leading status dot,
// matching the signed records-table status tags. Color mapping keeps the
// semantic hues: In Progress→blue, Blocked→red, Open→amber, Done→green.
//
// The leading dot is localized to StatusPill (the base Tag stays dot-less so
// RACI chips remain markerless). The dot is aria-hidden and inherits the Tag's
// status-tinted text color, so it is a redundant cue only — the visible status
// word is always the accessible name. WCAG 1.4.1 stays satisfied even without
// the dot, so the word remains the non-color cue.
import type { TaskStatus } from '@/lib/db/tasks.types'
import { Tag } from '@/components/ui/tag'
import type { TagColor } from '@/components/ui/tag'
import './status-pill.css'

export type { TaskStatus }

type StatusPillProps = { status: TaskStatus }

const STATUS_COLOR: Record<TaskStatus, TagColor> = {
  'In Progress': 'blue',
  'Blocked': 'red',
  'Open': 'amber',
  'Done': 'green',
}

export function StatusPill({ status }: StatusPillProps) {
  // NO aria-label: the visible text IS the accessible name. StatusTrigger renders
  // StatusPill inside a role=option / button, and an aria-label would override the
  // option's computed name, breaking status-change (AC-071/103/111).
  return (
    <Tag
      color={STATUS_COLOR[status]}
      weight="medium"
      className="status-pill"
      Icon={<span className="status-dot" aria-hidden="true" />}
    >
      {status}
    </Tag>
  )
}
