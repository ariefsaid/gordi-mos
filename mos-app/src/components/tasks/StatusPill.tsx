// StatusPill — task lifecycle pill (VIS-4, PR-2). Re-skinned onto the shared
// <Pill> primitive (ui/Pill.tsx); the bespoke .pill/.dot tokens moved to Pill.css.
// Tone mapping: In Progress→primary, Blocked→destructive, Open→warning, Done→success.
import type { TaskStatus } from '../../lib/db/tasks.types'
import { Pill } from '../ui/Pill'

export type { TaskStatus }

type StatusPillProps = { status: TaskStatus }

const STATUS_TONE: Record<TaskStatus, import('../ui/Pill').PillTone> = {
  'In Progress': 'primary',
  'Blocked': 'destructive',
  'Open': 'warning',
  'Done': 'success',
}

export function StatusPill({ status }: StatusPillProps) {
  // NO aria-label here: the visible text IS the accessible name. StatusTrigger renders
  // StatusPill inside a role=option / button, and an aria-label on the pill would
  // override the option's computed name ("Status: In Progress" ≠ "In Progress"),
  // breaking the status-change interaction (AC-071/103/111).
  return <Pill tone={STATUS_TONE[status]}>{status}</Pill>
}
