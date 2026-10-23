// What the minutes' tables and inline task rows read and do, supplied by MeetingMinutesSlot around the
// editor: this Meeting's Tasks, who the viewer may hand a Task to, and the writes (each one reloads the Tasks).
import { createContext, useContext } from 'react'
import type { PersonOption } from '@/lib/db/directory'
import type { MeetingTaskRow } from '@/lib/db/meetings.types'
import type { TaskStatus } from '@/lib/db/tasks.types'

export interface MeetingMinutes {
  meetingId: string
  /** Tasks of a private Meeting carry the "Private task" lock. */
  isPrivate: boolean
  /** The viewer may add Tasks and rows (can edit the Meeting, and is online). */
  canAdd: boolean
  /** This Meeting's Tasks the viewer can read. */
  tasks: readonly MeetingTaskRow[]
  people: readonly PersonOption[]
  /** The people the viewer may name as PIC. */
  picChoices: readonly PersonOption[]
  /** Offline: nothing in the minutes is edited in place. Who may edit a Task is the Task's own rule (canEditTask), not the Meeting's. */
  frozen: boolean
  canEditTask: (task: MeetingTaskRow) => boolean
  openTask: (taskId: string) => void
  createTask: (input: { title: string; picId?: string; dueDate?: string | null }) => Promise<string>
  setStatus: (task: MeetingTaskRow, status: TaskStatus) => Promise<void>
  setDue: (task: MeetingTaskRow, dueDate: string | null) => Promise<void>
  setPic: (task: MeetingTaskRow, personId: string) => Promise<void>
}

const MeetingMinutesContext = createContext<MeetingMinutes | null>(null)

export const MeetingMinutesProvider = MeetingMinutesContext.Provider

export function useMeetingMinutes(): MeetingMinutes {
  const value = useContext(MeetingMinutesContext)
  if (!value) throw new Error('useMeetingMinutes needs MeetingMinutesSlot above it')
  return value
}
