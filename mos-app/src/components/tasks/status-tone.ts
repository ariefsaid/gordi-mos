import type { TaskStatus } from '@/lib/db/tasks.types'
import type { TagColor } from '@/components/ui/tag'

const STATUS_COLOR: Record<TaskStatus, TagColor> = {
  'In Progress': 'blue',
  'Blocked': 'red',
  'Open': 'amber',
  'Done': 'green',
}

export function statusTone(status: TaskStatus): TagColor {
  return STATUS_COLOR[status]
}
