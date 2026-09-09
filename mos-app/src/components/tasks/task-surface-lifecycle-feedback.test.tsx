import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '@/auth/context'
import type { AuthState } from '@/auth/context'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { TaskListRow, TaskStatus } from '@/lib/db/tasks.types'

vi.mock('../../lib/db/tasks', () => ({
  getTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateTaskFields: vi.fn(),
  archiveTask: vi.fn(),
  unarchiveTask: vi.fn(),
  addChecklistItem: vi.fn(),
  toggleChecklistItem: vi.fn(),
  reorderChecklistItem: vi.fn(),
  deleteChecklistItem: vi.fn(),
}))
vi.mock('../../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
  getDownlinePersonIds: vi.fn(),
}))
vi.mock('../../lib/comments/postComment', () => ({
  listComments: vi.fn(),
  postComment: vi.fn(),
}))
vi.mock('../../lib/db/objectives', () => ({ listObjectives: vi.fn() }))
vi.mock('../../lib/db/work-lines', () => ({ listWorkLines: vi.fn() }))

import {
  getTask,
  updateTaskStatus,
  updateTaskFields,
  archiveTask,
  unarchiveTask,
  addChecklistItem,
  toggleChecklistItem,
  reorderChecklistItem,
  deleteChecklistItem,
} from '@/lib/db/tasks'
import { getBusinessUnits, getPeople, getDownlinePersonIds } from '@/lib/db/directory'
import { listComments } from '@/lib/comments/postComment'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { TaskSurface } from './task-surface'

const VIEWER_ID = 'pic-person'
const SUPERVISOR_ID = 'supervisor-person'

const person: PeopleRow = {
  id: VIEWER_ID,
  org_id: 'org',
  user_id: 'user',
  full_name: 'Cahya Cafe',
  email: 'cahya@example.test',
  must_change_password: false,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}
const role: RolesRow = {
  id: 'role',
  org_id: 'org',
  business_unit_id: 'team-cafe',
  name: 'Cafe lead',
  reports_to_role_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}
const auth: AuthState = {
  status: 'authenticated',
  viewer: { person, roles: [role], isManager: false, accessRoles: [], affiliated: [] },
  signOut: async () => {},
}

function makeTask(status: TaskStatus = 'Open'): TaskListRow {
  return {
    id: 'task-lifecycle-feedback',
    org_id: 'org',
    title: 'Replace the cafe chiller',
    business_unit_id: 'team-cafe',
    status,
    responsible_person_id: VIEWER_ID,
    accountable_person_id: SUPERVISOR_ID,
    consulted_person_ids: [],
    informed_person_ids: [],
    description: 'Restore cooling before opening.',
    due_date: '2026-07-20',
    objective_id: null,
    work_line_id: null,
    last_activity_at: '2026-07-15T08:00:00Z',
    archived_at: null,
    created_by: VIEWER_ID,
    created_at: '2026-07-15T00:00:00Z',
    updated_at: '2026-07-15T00:00:00Z',
  }
}

function renderTask(task: TaskListRow) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[`/work/tasks/${task.id}`]}>
        <TaskSurface taskId={task.id} mode="view" width="full" />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getBusinessUnits).mockResolvedValue([{ id: 'team-cafe', name: 'Café Operations' }])
  vi.mocked(getPeople).mockResolvedValue([
    { id: VIEWER_ID, full_name: 'Cahya Cafe' },
    { id: SUPERVISOR_ID, full_name: 'Arief Said' },
  ])
  vi.mocked(getDownlinePersonIds).mockResolvedValue([])
  vi.mocked(listComments).mockResolvedValue([])
  vi.mocked(listObjectives).mockResolvedValue([])
  vi.mocked(listWorkLines).mockResolvedValue([])
  vi.mocked(updateTaskFields).mockResolvedValue()
  vi.mocked(archiveTask).mockResolvedValue()
  vi.mocked(unarchiveTask).mockResolvedValue()
  vi.mocked(addChecklistItem).mockResolvedValue()
  vi.mocked(toggleChecklistItem).mockResolvedValue()
  vi.mocked(reorderChecklistItem).mockResolvedValue()
  vi.mocked(deleteChecklistItem).mockResolvedValue()
})

describe('TaskSurface lifecycle action feedback', () => {
  it.each([
    ['Open', 'Mark complete', 'Done'] as const,
    ['Done', 'Reopen', 'In Progress'] as const,
  ])('shows visible retry/dismiss feedback when %s → %s fails', async (status, actionLabel, targetStatus) => {
    const task = makeTask(status)
    vi.mocked(getTask).mockResolvedValue({ task, checklist: [], events: [] })
    vi.mocked(updateTaskStatus).mockRejectedValue(new Error('write failed'))

    renderTask(task)
    await waitFor(() => expect(screen.getByRole('heading', { name: task.title })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: actionLabel }))
    await waitFor(() => expect(updateTaskStatus).toHaveBeenCalledWith(
      task.id, status, targetStatus, VIEWER_ID,
    ))

    const feedback = await screen.findByTestId('task-lifecycle-error')
    expect(feedback).toBeVisible()
    expect(feedback).toHaveAttribute('role', 'alert')
    expect(feedback).toHaveTextContent(/couldn't save.*reverted/i)
    expect(within(feedback).getByRole('button', { name: 'Retry' })).toBeVisible()
    expect(within(feedback).getByRole('button', { name: 'Close' })).toBeVisible()
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('retries a failed lifecycle write and dismisses the feedback after success', async () => {
    const task = makeTask('Open')
    vi.mocked(getTask).mockResolvedValue({ task, checklist: [], events: [] })
    vi.mocked(updateTaskStatus)
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce()

    renderTask(task)
    await waitFor(() => expect(screen.getByRole('heading', { name: task.title })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Mark complete' }))
    const feedback = await screen.findByTestId('task-lifecycle-error')

    fireEvent.click(within(feedback).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(updateTaskStatus).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByTestId('task-lifecycle-error')).toBeNull())

    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('does not add lifecycle feedback to an ordinary Status field failure', async () => {
    const task = makeTask('Open')
    vi.mocked(getTask).mockResolvedValue({ task, checklist: [], events: [] })
    vi.mocked(updateTaskStatus).mockRejectedValue(new Error('write failed'))

    renderTask(task)
    await waitFor(() => expect(screen.getByRole('heading', { name: task.title })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Edit Status' }))
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'Done' } })

    await waitFor(() => expect(updateTaskStatus).toHaveBeenCalledWith(
      task.id, 'Open', 'Done', VIEWER_ID,
    ))
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't save/i)
    expect(screen.queryByTestId('task-lifecycle-error')).toBeNull()
  })
})
