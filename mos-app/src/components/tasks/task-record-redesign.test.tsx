import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '@/auth/context'
import type { AuthState } from '@/auth/context'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { TaskListRow } from '@/lib/db/tasks.types'

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
}))
vi.mock('../../lib/comments/postComment', () => ({
  listComments: vi.fn(),
  postComment: vi.fn(),
}))
vi.mock('../../lib/db/objectives', () => ({ listObjectives: vi.fn() }))
vi.mock('../../lib/db/work-lines', () => ({ listWorkLines: vi.fn() }))

import { getTask, updateTaskStatus, updateTaskFields } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { listComments } from '@/lib/comments/postComment'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { TaskSurface } from './task-surface'

const VIEWER_ID = 'pic-person'
const SUPERVISOR_ID = 'supervisor-person'

const person: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'user', full_name: 'Cahya Cafe',
  email: 'cahya@example.test', must_change_password: false, archived_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const role: RolesRow = {
  id: 'role', org_id: 'org', business_unit_id: 'team-cafe', name: 'Cafe lead',
  reports_to_role_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const auth: AuthState = {
  status: 'authenticated',
  viewer: { person, roles: [role], isManager: false, accessRoles: [] },
  signOut: async () => {},
}

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-typed', org_id: 'org', title: 'Replace the cafe chiller',
    business_unit_id: 'team-cafe', status: 'Open',
    responsible_person_id: VIEWER_ID, accountable_person_id: SUPERVISOR_ID,
    consulted_person_ids: ['consulted'], informed_person_ids: ['informed'],
    description: 'Restore cooling before opening.', due_date: '2026-07-20',
    objective_id: null, work_line_id: 'process-opening',
    last_activity_at: '2026-07-15T08:00:00Z', archived_at: null,
    created_by: VIEWER_ID, created_at: '2026-07-15T00:00:00Z', updated_at: '2026-07-15T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getBusinessUnits).mockResolvedValue([{ id: 'team-cafe', name: 'Café Operations' }])
  vi.mocked(getPeople).mockResolvedValue([
    { id: VIEWER_ID, full_name: 'Cahya Cafe' },
    { id: SUPERVISOR_ID, full_name: 'Arief Said' },
    { id: 'consulted', full_name: 'Consulted Person' },
    { id: 'informed', full_name: 'Informed Person' },
  ])
  vi.mocked(listComments).mockResolvedValue([])
  vi.mocked(listObjectives).mockResolvedValue([])
  vi.mocked(listWorkLines).mockResolvedValue([{ id: 'process-opening', name: 'Today opening', type: 'process' }])
  vi.mocked(updateTaskStatus).mockResolvedValue()
  vi.mocked(updateTaskFields).mockResolvedValue()
})

describe('OD-REDESIGN-62 — typed Task record', () => {
  it('§Task-11: shows PIC, Supervisor, Due, source, completion, and reassignment — NO Team field (Issue-8 gate), without Task RACI grammar', async () => {
    const task = makeTask()
    vi.mocked(getTask)
      .mockResolvedValueOnce({ task, checklist: [], events: [] })
      .mockResolvedValue({ task: { ...task, status: 'Done' }, checklist: [], events: [] })

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/work/tasks/task-typed']}>
          <TaskSurface taskId={task.id} mode="view" width="full" />
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    await waitFor(() => expect(screen.getByRole('heading', { name: task.title })).toBeInTheDocument())

    // DELIBERATE goal change (record-collection plan §Task-11): the live Task record renders NO Team
    // field until Issue 8 supplies the real team_id contract. Business Unit ("Café Operations", the
    // name of BU `team-cafe`) is DISTINCT and still renders; only the Team field is gone.
    expect(screen.queryByText('Team')).toBeNull()
    expect(screen.getAllByText('Café Operations').length).toBeGreaterThan(0)
    expect(screen.getByTestId('record-details').querySelector('[data-record-header="pinned"]')).toBeTruthy()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Checklist' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Activity' })).toBeInTheDocument()
    expect(screen.getByTestId('record-details').querySelector('.record-field__pill')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit title' })).toBeInTheDocument()
    expect(screen.getByText('Source')).toBeInTheDocument()
    expect(screen.getAllByText('Today opening').length).toBeGreaterThan(0)
    expect(screen.getByText('PIC')).toBeInTheDocument()
    // Value-first document grammar: ownership fields render their VALUE first, then swap in the
    // edit control on activation (click the row). PIC + Supervisor are editable person selects;
    // a person's name appears as an <option> in BOTH, so assert via the select's value (the
    // selected option) after activating. The goal: PIC holds Cahya Cafe, Supervisor holds Arief.
    fireEvent.click(screen.getByRole('button', { name: 'Edit PIC' }))
    expect(screen.getByLabelText('PIC')).toHaveValue(VIEWER_ID)
    expect(screen.getByText('Supervisor')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Supervisor' }))
    expect(screen.getByLabelText('Supervisor')).toHaveValue(SUPERVISOR_ID)
    // Source is a read-only derived classification (never activated) — its value shows directly.
    expect(screen.getByText('Source')).toBeInTheDocument()
    const sourceField = document.querySelector('[data-field-key="source"]') as HTMLElement
    expect(within(sourceField).getByText('Today opening')).toBeInTheDocument()
    // Due date renders as a native <input type="date"> once activated (its value is the ISO date
    // in the attribute, not visible text). Assert via the labeled control's value.
    fireEvent.click(screen.getByRole('button', { name: 'Edit Due' }))
    expect(screen.getByLabelText('Due')).toHaveValue('2026-07-20')
    // No RACI grammar: assert the parenthesized RACI labels (Responsible (R), Accountable (A), etc.)
    // never render. The bare words "Consulted"/"Informed" are intentionally NOT matched here — the
    // test fixtures use full names like "Consulted Person" for the person options, which would false-
    // positive on a bare-word match.
    expect(screen.queryByText(/RACI|Responsible \(R\)|Accountable \(A\)|Owner \(R\)|Consulted \(C\)|Informed \(I\)/i)).toBeNull()

    const complete = screen.getByRole('button', { name: 'Mark complete' })
    expect(complete).toHaveClass('btn-primary')

    fireEvent.click(complete)
    await waitFor(() => expect(updateTaskStatus).toHaveBeenCalledWith(task.id, 'Open', 'Done', VIEWER_ID))

    // PIC reassignment journey: the record adapter exposes PIC as an editable person <select>
    // reached by activating the value row (value-first). The goal-oracle "manager can reassign
    // PIC through the visible Task path" is met by changing the select; the journey step is now
    // "activate the field, then pick the person". (The Mark-complete refetch returned every field
    // to its value rendering, so re-activate PIC before reassigning.)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit PIC' }))
    const picSelect = screen.getByLabelText('PIC')
    fireEvent.change(picSelect, { target: { value: SUPERVISOR_ID } })
    await waitFor(() => expect(updateTaskFields).toHaveBeenCalledWith(
      task.id, { responsible_person_id: SUPERVISOR_ID }, VIEWER_ID,
    ))
  })

  // Wave 2c (OD-REDESIGN-61..64): the optional columns moved OUT of the default desktop
  // table must remain reachable in the record drawer/full page. This proves the
  // Objective field (the one not covered by the test above) resolves + renders in the
  // drawer — alongside Source/Work-line already asserted above (Team is gated off, §Task-11).
  it('AC-W2C: Objective (moved out of the table) stays reachable in the drawer', async () => {
    vi.mocked(listObjectives).mockResolvedValue([
      { id: 'obj-direct', name: 'Grow direct orders' } as never,
    ])
    const task = makeTask({ objective_id: 'obj-direct' })
    vi.mocked(getTask).mockResolvedValue({ task, checklist: [], events: [] })

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/work/tasks/task-typed']}>
          <TaskSurface taskId={task.id} mode="view" width="full" />
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    await waitFor(() => expect(screen.getByRole('heading', { name: task.title })).toBeInTheDocument())
    // The objective name resolves + renders in the drawer (moved out of the table, not removed).
    expect(screen.getByText('Grow direct orders')).toBeInTheDocument()
  })
})

// OD-REDESIGN-22 (D-C1 / DIV-G1): a FAILED status change must surface a VISIBLE error + retry.
// Before the fix, TaskSurface.handleStatusChange swallowed the rejection (sr-only announce only),
// so the Status RecordField saw the commit RESOLVE and wrongly showed "Saved" on a failed write.
describe('OD-REDESIGN-22 — status change failure surfaces a visible error (D-C1)', () => {
  it('a rejected Status commit shows the field error + Retry, never a false "Saved"', async () => {
    const task = makeTask()
    vi.mocked(getTask).mockResolvedValue({ task, checklist: [], events: [] })
    vi.mocked(updateTaskStatus).mockRejectedValue(new Error('write failed'))

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/work/tasks/task-typed']}>
          <TaskSurface taskId={task.id} mode="view" width="full" />
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    await waitFor(() => expect(screen.getByRole('heading', { name: task.title })).toBeInTheDocument())
    // Activate the Status field (value-first) then pick a new status.
    fireEvent.click(screen.getByRole('button', { name: 'Edit Status' }))
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'Done' } })
    await waitFor(() => expect(updateTaskStatus).toHaveBeenCalledWith(task.id, 'Open', 'Done', VIEWER_ID))
    // The failure is VISIBLE (RecordField error + Retry), not a silent false success.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn.t save/i)
    expect(within(alert).getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.queryByText('Saved')).toBeNull()
  })
})
