// Task create draft (#1029): the Supervisor default from the home Team lead, and the Due date +
// Project/Process choices reaching the create write, with the Objective derived from the
// Project/Process (mos.work_lines.objective_id) rather than picked.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import { OverlayHostProvider } from '@/shell/overlay-host'
import { type PeopleRow, type RolesRow } from '@/lib/database.types'
import { TASKS_SPLIT_MIN_WIDTH } from '@/shell/use-is-split-width'

vi.mock('../../lib/db/tasks', () => ({
  listTasks: vi.fn(), getTask: vi.fn(), createTask: vi.fn(), updateTaskStatus: vi.fn(),
  updateTaskRaci: vi.fn(), updateTaskFields: vi.fn(), addChecklistItem: vi.fn(),
  toggleChecklistItem: vi.fn(), reorderChecklistItem: vi.fn(), deleteChecklistItem: vi.fn(),
  archiveTask: vi.fn(), unarchiveTask: vi.fn(),
}))
vi.mock('../../lib/db/signals', () => ({ linkSignalTask: vi.fn() }))
vi.mock('../../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(), getPeople: vi.fn(), getPersonTeams: vi.fn(),
  getTeamsByIds: vi.fn(), getDownlinePersonIds: vi.fn(), getMyTeamLeads: vi.fn(),
}))
vi.mock('../../lib/db/objectives', () => ({ listObjectives: vi.fn() }))
vi.mock('../../lib/db/work-lines', () => ({ listWorkLines: vi.fn() }))
vi.mock('@/lib/db/processes', () => ({ canStartProcessForTeam: vi.fn() }))
vi.mock('@/lib/db/user-views-collection', () => ({
  listCollectionViews: vi.fn(), getCollectionView: vi.fn(), createCollectionView: vi.fn(),
  renameCollectionView: vi.fn(), archiveCollectionView: vi.fn(),
}))

import { listTasks, createTask } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople, getDownlinePersonIds, getPersonTeams, getTeamsByIds, getMyTeamLeads } from '@/lib/db/directory'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { canStartProcessForTeam } from '@/lib/db/processes'
import { listCollectionViews } from '@/lib/db/user-views-collection'
import { TasksWorkspace } from './tasks-workspace'

const VIEWER_ID = 'viewer-id'
const LEAD_ID = 'lead-id'
const PERSON: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'uid', full_name: 'Test Viewer',
  email: 'viewer@example.test', must_change_password: false, archived_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const ROLE: RolesRow = {
  id: 'role-1', org_id: 'org', business_unit_id: 'bu-1', name: 'Test Role',
  reports_to_role_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
// A plain member: the lead read is a member-scoped read, not an admin one.
const MEMBER: AuthState = {
  status: 'authenticated',
  viewer: { person: PERSON, roles: [ROLE], isManager: false, accessRoles: ['member'], affiliated: [] },
  signOut: async () => {},
}

const PEOPLE = [
  { id: VIEWER_ID, full_name: 'Test Viewer' },
  { id: LEAD_ID, full_name: 'Test Lead' },
]
const TEAMS = [
  { id: 'team-1', name: 'Café team', businessUnitId: 'bu-1', siteId: null, orgId: 'org', isPrimary: true },
  { id: 'team-2', name: 'Retail team', businessUnitId: 'bu-1', siteId: null, orgId: 'org', isPrimary: false },
]
const WORK_LINES = [
  { id: 'wl-1', name: 'Q4 Launch', type: 'project', objective_id: 'obj-1' },
  { id: 'wl-2', name: 'Daily Open', type: 'process', objective_id: null },
]

function stubMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes(`${TASKS_SPLIT_MIN_WIDTH}`) || query.includes('1100') || query.includes('768'),
      media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  stubMatchMedia()
  vi.mocked(getPersonTeams).mockResolvedValue([TEAMS[0]])
  vi.mocked(getTeamsByIds).mockResolvedValue([])
  vi.mocked(getBusinessUnits).mockResolvedValue([{ id: 'bu-1', name: 'Kitchen' }])
  vi.mocked(getPeople).mockResolvedValue(PEOPLE)
  vi.mocked(getDownlinePersonIds).mockResolvedValue([])
  vi.mocked(listObjectives).mockResolvedValue([])
  vi.mocked(listWorkLines).mockResolvedValue(WORK_LINES as never)
  vi.mocked(canStartProcessForTeam).mockResolvedValue(true)
  vi.mocked(listCollectionViews).mockResolvedValue([])
  vi.mocked(listTasks).mockResolvedValue([{
    id: 'task-1', org_id: 'org', title: 'Existing task', business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID,
    consulted_person_ids: [], informed_person_ids: [], description: null, due_date: null,
    objective_id: null, work_line_id: null, last_activity_at: '2026-06-11T10:00:00Z',
    archived_at: null, created_by: VIEWER_ID,
    created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
  }])
  vi.mocked(getMyTeamLeads).mockResolvedValue([
    { team_id: 'team-1', lead_person_id: LEAD_ID },
    { team_id: 'team-2', lead_person_id: VIEWER_ID },
  ])
  vi.mocked(createTask).mockResolvedValue('created-task')
})

async function openDraft() {
  render(
    <I18nProvider initialLocale="en">
      <AuthContext.Provider value={MEMBER}>
        <MemoryRouter initialEntries={['/work/tasks?view=all']}>
          <OverlayHostProvider>
            <TasksWorkspace savedView={{ view: 'all', activeChip: null, segment: 'all', overdueOnly: false, search: '' }} onSavedViewChange={() => {}} />
          </OverlayHostProvider>
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
  )
  fireEvent.click(await screen.findByRole('button', { name: '+ Create task' }))
  const form = await screen.findByRole('form', { name: 'Create task form' })
  fireEvent.change(within(form).getByRole('textbox', { name: 'Title' }), { target: { value: 'New task' } })
  return form
}

async function pick(form: HTMLElement, combobox: string, option: RegExp) {
  fireEvent.click(within(form).getByRole('combobox', { name: combobox }))
  fireEvent.click(await screen.findByRole('option', { name: option }))
}

describe('create draft — Supervisor defaults to the home Team lead', () => {
  it('a member gets the home Team lead pre-filled and creates with them, PIC stays the creator', async () => {
    const form = await openDraft()
    await waitFor(() => expect(within(form).getByRole('combobox', { name: 'Supervisor' })).toHaveTextContent('Test Lead'))
    fireEvent.keyDown(within(form).getByRole('textbox', { name: 'Title' }), { key: 'Enter' })
    await waitFor(() => expect(createTask).toHaveBeenCalled())
    expect(vi.mocked(createTask).mock.calls[0][0]).toMatchObject({
      accountablePersonId: LEAD_ID, responsiblePersonId: VIEWER_ID, teamId: 'team-1',
    })
  })

  it('leaves Supervisor blank when the creator is the home Team lead', async () => {
    vi.mocked(getPersonTeams).mockResolvedValue([TEAMS[1]])
    const form = await openDraft()
    expect(within(form).getByRole('combobox', { name: 'Supervisor' })).toHaveTextContent(/select supervisor/i)
    expect(createTask).not.toHaveBeenCalled()
  })

  it('leaves Supervisor blank when the home Team has no lead', async () => {
    vi.mocked(getMyTeamLeads).mockResolvedValue([{ team_id: 'team-1', lead_person_id: null }])
    const form = await openDraft()
    expect(within(form).getByRole('combobox', { name: 'Supervisor' })).toHaveTextContent(/select supervisor/i)
  })

  it('never offers an archived home Team lead: Supervisor stays blank', async () => {
    vi.mocked(getPeople).mockResolvedValue([PEOPLE[0]])
    const form = await openDraft()
    expect(within(form).getByRole('combobox', { name: 'Supervisor' })).toHaveTextContent(/select supervisor/i)
  })

  it('a failed lead read still opens the draft with a blank Supervisor', async () => {
    vi.mocked(getMyTeamLeads).mockRejectedValue(new Error('denied'))
    const form = await openDraft()
    expect(within(form).getByRole('combobox', { name: 'Supervisor' })).toHaveTextContent(/select supervisor/i)
  })
})

describe('create draft — Due date and Project/Process reach the write', () => {
  it('writes the Due date and Project/Process, and takes the Objective from the Project', async () => {
    const form = await openDraft()
    fireEvent.change(within(form).getByLabelText('Due date'), { target: { value: '2026-11-05' } })
    await pick(form, 'Project/Process', /Q4 Launch/)
    fireEvent.keyDown(within(form).getByRole('textbox', { name: 'Title' }), { key: 'Enter' })
    await waitFor(() => expect(createTask).toHaveBeenCalled())
    expect(vi.mocked(createTask).mock.calls[0][0]).toMatchObject({
      dueDate: '2026-11-05', workLineId: 'wl-1', objectiveId: 'obj-1',
    })
  })

  it('a Project/Process with no Objective writes no Objective', async () => {
    const form = await openDraft()
    await pick(form, 'Project/Process', /Daily Open/)
    fireEvent.keyDown(within(form).getByRole('textbox', { name: 'Title' }), { key: 'Enter' })
    await waitFor(() => expect(createTask).toHaveBeenCalled())
    const input = vi.mocked(createTask).mock.calls[0][0]
    expect(input).toMatchObject({ workLineId: 'wl-2', objectiveId: null, dueDate: null })
  })

  it('choosing None after a Project clears the Project and its Objective', async () => {
    const form = await openDraft()
    await pick(form, 'Project/Process', /Q4 Launch/)
    await pick(form, 'Project/Process', /None/)
    fireEvent.keyDown(within(form).getByRole('textbox', { name: 'Title' }), { key: 'Enter' })
    await waitFor(() => expect(createTask).toHaveBeenCalled())
    expect(vi.mocked(createTask).mock.calls[0][0]).toMatchObject({ workLineId: null, objectiveId: null })
  })
})
