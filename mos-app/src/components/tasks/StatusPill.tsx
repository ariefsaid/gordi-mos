// StatusPill — task lifecycle pill. Twenty IxD migration: renders the soft
// rounded <Tag> (mos-design-kit 30-color palette) instead of the dotted <Pill>,
// matching Twenty's record-table status tags. Color mapping keeps the semantic
// hues: In Progress→blue, Blocked→red, Open→amber, Done→green.
//
// (Overrides OD-P3-6's tone-mapped dotted Pill for the status column, per the
//  Twenty look-and-feel goal — flagged for DESIGN.md ratification. WCAG 1.4.1
//  stays satisfied: the status word is always the label, so colour is never the
//  sole cue even without the leading dot.)
import type { TaskStatus } from '@/lib/db/tasks.types'
import { Tag } from '@/components/ui/Tag'
import type { TagColor } from '@/components/ui/Tag'

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
    <Tag color={STATUS_COLOR[status]} weight="medium">
      {status}
    </Tag>
  )
}
