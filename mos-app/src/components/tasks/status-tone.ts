import type { TaskStatus } from '@/lib/db/tasks.types'
import type { TagColor } from '@/components/ui/tag'

const STATUS_COLOR: Record<TaskStatus, TagColor> = {
  'In Progress': 'blue',
  'Blocked': 'amber',
  'Open': 'gray',
  'Done': 'green',
}

export function statusTone(status: TaskStatus): TagColor {
  return STATUS_COLOR[status]
}
