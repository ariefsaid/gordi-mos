// The create form's Due + Project/Process seam. TaskCreateForm is rendered by the desktop row and
// the phone card, so these come from context instead of two more prop hops through both.
import { createContext, useContext } from 'react'

export type TaskWorkLineOption = { id: string; name: string; type: 'project' | 'process' }

export type TaskCreateFormState = { dueText?: string; pending: boolean; saveError: boolean }

export type TaskCreateContextValue = {
  onTitleChange?: (title: string) => void
  formState?: TaskCreateFormState
  onFormStateChange?: (patch: Partial<TaskCreateFormState>) => void
  workLineOptions: readonly TaskWorkLineOption[]
  onEditDue: (taskId: string, dueDate: string | null) => Promise<void>
  // Sets the draft's Project/Process; the workspace derives the Objective from it.
  onEditWorkLine: (taskId: string, workLineId: string | null) => Promise<void>
  supervisorHint?: 'missing' | 'error' | null
}

const INERT: TaskCreateContextValue = {
  workLineOptions: [],
  onEditDue: async () => {},
  onEditWorkLine: async () => {},
}

export const TaskCreateContext = createContext<TaskCreateContextValue>(INERT)
export const useTaskCreateContext = () => useContext(TaskCreateContext)
