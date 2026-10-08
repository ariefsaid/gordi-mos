// Task create draft (#1029): the Supervisor default from the home Team lead, and the Due date +
// Project/Process choices reaching the create write, with the Objective derived from the
// Project/Process (mos.work_lines.objective_id) rather than picked.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, Outlet, MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import { CreateDraftProvider } from '@/shell/create-drafts'
import { OverlayHostProvider } from '@/shell/overlay-host'
import { type PeopleRow, type RolesRow } from '@/lib/database.types'
import { TASKS_SPLIT_MIN_WIDTH } from '@/shell/use-is-split-width'

vi.mock('../../lib/db/tasks', () => ({
  listTasks: vi.fn(), hasOlderDoneTasks: async () => false,
  listOlderDoneTasks: async () => ({ rows: [], nextCursor: null, hasMore: false }),
  getTask: vi.fn(), createTask: vi.fn(), updateTaskStatus: vi.fn(),
  updateTaskFields: vi.fn(), addChecklistItem: vi.fn(),
  toggleChecklistItem: vi.fn(), reorderChecklistItem: vi.fn(), deleteChecklistItem: vi.fn(),
  archiveTask: vi.fn(), unarchiveTask: vi.fn(),
}))
vi.mock('../../lib/db/signals', () => ({ linkSignalTask: vi.fn() }))
vi.mock('../../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(), getPeople: vi.fn(), getPersonTeams: vi.fn(),
  getTeamsByIds: vi.fn(), getDownlinePersonIds: vi.fn(), getMyTeamLeads: vi.fn(),
  getPersonBusinessUnitIds: vi.fn(),
}))
vi.mock('../../lib/db/objectives', () => ({ listObjectives: vi.fn() }))
vi.mock('../../lib/db/work-lines', () => ({ listWorkLines: vi.fn() }))
vi.mock('@/lib/db/processes', () => ({ canStartProcessForTeam: vi.fn() }))
vi.mock('@/lib/db/user-views-collection', () => ({
  listCollectionViews: vi.fn(), getCollectionView: vi.fn(), createCollectionView: vi.fn(),
  renameCollectionView: vi.fn(), archiveCollectionView: vi.fn(),
}))

import { linkSignalTask } from '@/lib/db/signals'
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

let setDesktopWidth: (wide: boolean) => void
function stubMatchMedia() {
  let wide = true
  const listeners = new Map<(event: { matches: boolean }) => void, string>()
  setDesktopWidth = (next) => { wide = next; listeners.forEach((query, listener) => listener({ matches: wide && (query.includes(`${TASKS_SPLIT_MIN_WIDTH}`) || query.includes('1100') || query.includes('768')) })) }
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      get matches() { return wide && (query.includes(`${TASKS_SPLIT_MIN_WIDTH}`) || query.includes('1100') || query.includes('768')) },
      media: query, onchange: null,
      addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.set(listener, query),
      removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.delete(listener), dispatchEvent: () => false,
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
    consulted_person_ids: [], informed_person_ids: [], due_date: null,
    objective_id: null, work_line_id: null, last_activity_at: '2026-06-11T10:00:00Z',
    archived_at: null, created_by: VIEWER_ID,
  }])
  vi.mocked(getMyTeamLeads).mockResolvedValue([
    { team_id: 'team-1', lead_person_id: LEAD_ID },
    { team_id: 'team-2', lead_person_id: VIEWER_ID },
  ])
  vi.mocked(createTask).mockResolvedValue('created-task')
})

async function openDraft(auth: AuthState = MEMBER) {
  await act(async () => { render(
    <I18nProvider initialLocale="en">
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/work/tasks?view=all']}>
          <OverlayHostProvider>
            <TasksWorkspace savedView={{ view: 'all', activeChip: null, segment: 'all', overdueOnly: false, search: '' }} onSavedViewChange={() => {}} />
          </OverlayHostProvider>
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
  )
  })
  const opener = await screen.findByRole('button', { name: '+ Create task' })
  await act(async () => { fireEvent.click(opener) })
  const form = await screen.findByRole('form', { name: 'Create task form' })
  await act(async () => { fireEvent.change(within(form).getByRole('textbox', { name: 'Title' }), { target: { value: 'New task' } }) })
  return form
}

async function pick(form: HTMLElement, combobox: string, option: RegExp) {
  const activeForm = form.isConnected ? form : screen.getByRole('form', { name: 'Create task form' })
  await userEvent.click(within(activeForm).getByRole('combobox', { name: combobox }))
  const chosen = await screen.findByRole('option', { name: option })
  await userEvent.click(chosen)
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

// OD-WAY-94 (1) + OD-ROLE-1: a PIC is the creator or their downline, except the admin access role
// (org-wide authority), which may name anyone. A top-of-chain role grants no such authority.
describe('create draft — who the PIC picker offers', () => {
  const SUB_ROLE: RolesRow = { ...ROLE, id: 'role-2', reports_to_role_id: ROLE.id }
  const EVERYONE = [
    { id: VIEWER_ID, full_name: 'Test Viewer' },
    { id: 'report-id', full_name: 'Direct Report' },
    { id: 'unrelated-id', full_name: 'Unrelated Person' },
  ]
  const authFor = (roles: RolesRow[], accessRoles: string[], isManager = false): AuthState => ({
    status: 'authenticated',
    viewer: { person: PERSON, roles, isManager, accessRoles, affiliated: [] },
    signOut: async () => {},
  })
  async function picOptionNames(auth: AuthState) {
    vi.mocked(getPeople).mockResolvedValue(EVERYONE)
    const form = await openDraft(auth)
    fireEvent.click(within(form).getByRole('combobox', { name: 'PIC' }))
    const options = await screen.findAllByRole('option')
    return options.map((option) => option.textContent)
  }

  it('a top-role holder without admin and without a downline is offered only themself', async () => {
    expect(await picOptionNames(authFor([ROLE], ['member']))).toEqual(['Test Viewer'])
  })

  it('a top-role holder without admin is offered themself and their downline, not unrelated people', async () => {
    vi.mocked(getDownlinePersonIds).mockResolvedValue(['report-id'])
    expect(await picOptionNames(authFor([ROLE], ['member'], true))).toEqual(['Test Viewer', 'Direct Report'])
  })

  it('an admin with no downline is offered every person', async () => {
    expect(await picOptionNames(authFor([ROLE], ['admin']))).toEqual(['Test Viewer', 'Direct Report', 'Unrelated Person'])
  })

  it('an admin holding a non-top role is offered every person', async () => {
    expect(await picOptionNames(authFor([SUB_ROLE], ['admin']))).toEqual(['Test Viewer', 'Direct Report', 'Unrelated Person'])
  })

  it('a member with no downline is offered only themself', async () => {
    expect(await picOptionNames(authFor([SUB_ROLE], ['member']))).toEqual(['Test Viewer'])
  })

  it('a lead is offered themself and their downline, not unrelated people', async () => {
    vi.mocked(getDownlinePersonIds).mockResolvedValue(['report-id'])
    expect(await picOptionNames(authFor([SUB_ROLE], ['member'], true))).toEqual(['Test Viewer', 'Direct Report'])
  })
})

// AC-001
describe('unfinished Task draft retention', () => {
  it('keeps every entered field while switching desktop and phone creation hosts', async () => {
    let form = await openDraft()
    await act(async () => { fireEvent.change(within(form).getByLabelText('Due date'), { target: { value: '05/1' } }) })
    await pick(form, 'Project/Process', /Q4 Launch/)
    await act(async () => setDesktopWidth(false))
    form = await screen.findByRole('form', { name: 'Create task form' })
    expect(within(form).getByRole('textbox', { name: 'Title' })).toHaveValue('New task')
    expect(within(form).getByLabelText('Due date')).toHaveValue('05/1')
    expect(within(form).getByRole('combobox', { name: 'Project/Process' })).toHaveTextContent('Q4 Launch')
    await act(async () => { fireEvent.submit(form) })
    expect(createTask).not.toHaveBeenCalled()
    await act(async () => setDesktopWidth(true))
    form = await screen.findByRole('form', { name: 'Create task form' })
    expect(within(form).getByRole('textbox', { name: 'Title' })).toHaveValue('New task')
    expect(within(form).getByLabelText('Due date')).toHaveValue('05/1')
    await act(async () => { fireEvent.change(within(form).getByLabelText('Due date'), { target: { value: '05/11/2026' } }) })
    await act(async () => { fireEvent.submit(form) })
    await waitFor(() => expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'New task', dueDate: '2026-11-05', workLineId: 'wl-1' })))
  })
})

// AC-001
it('resumes the complete Task draft after following links away and returning to the collection', async () => {
  vi.mocked(getPersonTeams).mockResolvedValue(TEAMS)
  const router = createMemoryRouter([{
    element: <CreateDraftProvider><OverlayHostProvider><Link to="/work/signals">Signals destination</Link><Link to="/work/tasks?view=all">Task collection</Link><Outlet /></OverlayHostProvider></CreateDraftProvider>,
    children: [{ path: '/work/tasks', element: <TasksWorkspace /> }, { path: '/work/signals', element: <p>Signals destination body</p> }],
  }], { initialEntries: ['/work/tasks?view=all&create=1'] })
  await act(async () => { render(<I18nProvider><AuthContext.Provider value={{ ...MEMBER, viewer: { ...MEMBER.viewer, accessRoles: ['admin'] } }}><RouterProvider router={router} /></AuthContext.Provider></I18nProvider>) })
  let form = await screen.findByRole('form', { name: 'Create task form' })
  await act(async () => { fireEvent.change(within(form).getByRole('textbox', { name: 'Title' }), { target: { value: 'Keep all chosen task fields' } }) })
  await pick(form, 'Team', /Retail team/)
  await pick(form, 'PIC', /Test Lead/)
  await pick(form, 'Supervisor', /Test Viewer/)
  await pick(form, 'Project/Process', /Q4 Launch/)
  form = screen.getByRole('form', { name: 'Create task form' })
  await act(async () => { fireEvent.change(within(form).getByLabelText('Due date'), { target: { value: '05/1' } }) })
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Signals destination' })) })
  await screen.findByText('Signals destination body')
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Task collection' })) })
  form = await screen.findByRole('form', { name: 'Create task form' })
  expect(within(form).getByRole('textbox', { name: 'Title' })).toHaveValue('Keep all chosen task fields')
  expect(within(form).getByRole('combobox', { name: 'Team' })).toHaveTextContent('Retail team')
  expect(within(form).getByRole('combobox', { name: 'PIC' })).toHaveTextContent('Test Lead')
  expect(within(form).getByRole('combobox', { name: 'Supervisor' })).toHaveTextContent('Test Viewer')
  expect(within(form).getByRole('combobox', { name: 'Project/Process' })).toHaveTextContent('Q4 Launch')
  expect(within(form).getByLabelText('Due date')).toHaveValue('05/1')
  await act(async () => { fireEvent.submit(form) })
  expect(createTask).not.toHaveBeenCalled()
  await act(async () => { fireEvent.change(within(form).getByLabelText('Due date'), { target: { value: '05/11/2026' } }) })
  await act(async () => { fireEvent.submit(form) })
  await waitFor(() => expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Keep all chosen task fields', teamId: 'team-2', responsiblePersonId: LEAD_ID, accountablePersonId: VIEWER_ID, dueDate: '2026-11-05', workLineId: 'wl-1', objectiveId: 'obj-1' })))
})

function retainedWorkspaceRouter(entry = '/work/tasks?view=all&create=1') {
  const router = createMemoryRouter([{
    element: <CreateDraftProvider><OverlayHostProvider><Link to="/work/signals">Signals destination</Link><Link to="/work/tasks?view=all">Task collection</Link><Outlet /></OverlayHostProvider></CreateDraftProvider>,
    children: [{ path: '/work/tasks', element: <TasksWorkspace /> }, { path: '/work/signals', element: <p>Signals destination body</p> }],
  }], { initialEntries: [entry] })
  return <I18nProvider><AuthContext.Provider value={MEMBER}><RouterProvider router={router} /></AuthContext.Provider></I18nProvider>
}

// AC-003
it('keeps an in-flight Task locked across resize/navigation and restores rejected values for retry', async () => {
  let reject!: (error: Error) => void
  vi.mocked(createTask).mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail }))
  await act(async () => { render(retainedWorkspaceRouter()) })
  let form = await screen.findByRole('form', { name: 'Create task form' })
  await act(async () => { fireEvent.change(within(form).getByRole('textbox', { name: 'Title' }), { target: { value: 'Await confirmation before clearing' } }) })
  await act(async () => { fireEvent.submit(form) })
  await act(async () => setDesktopWidth(false))
  form = await screen.findByRole('form', { name: 'Create task form' })
  expect(within(form).getByRole('textbox', { name: 'Title' })).toBeDisabled()
  fireEvent.keyDown(within(form).getByRole('textbox', { name: 'Title' }), { key: 'Escape' })
  expect(screen.getByRole('form', { name: 'Create task form' })).toBeInTheDocument()
  expect(createTask).toHaveBeenCalledTimes(1)
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Signals destination' })) })
  await act(async () => reject(new Error('Save rejected')))
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Task collection' })) })
  form = await screen.findByRole('form', { name: 'Create task form' })
  expect(within(form).getByRole('textbox', { name: 'Title' })).toHaveValue('Await confirmation before clearing')
  expect(within(form).getByRole('textbox', { name: 'Title' })).not.toBeDisabled()
  expect(within(form).getByRole('alert')).toHaveTextContent("Couldn't save")
  await act(async () => { fireEvent.click(within(form).getByRole('button', { name: 'Retry' })) })
  expect(createTask).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('form', { name: 'Create task form' })).toBeNull()
})

// AC-005
it('resumes Signal-link recovery after navigation without creating a second saved Task', async () => {
  vi.mocked(linkSignalTask).mockRejectedValueOnce(new Error('Link rejected')).mockResolvedValueOnce(undefined)
  await act(async () => { render(retainedWorkspaceRouter('/work/tasks?view=all&create=1&sourceSignal=signal-42')) })
  let form = await screen.findByRole('form', { name: 'Create task form' })
  await act(async () => { fireEvent.change(within(form).getByRole('textbox', { name: 'Title' }), { target: { value: 'Keep the created Task identity' } }) })
  await act(async () => { fireEvent.submit(form) })
  expect(within(form).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Signals destination' })) })
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Task collection' })) })
  form = await screen.findByRole('form', { name: 'Create task form' })
  expect(within(form).getByRole('textbox', { name: 'Title' })).toHaveValue('Keep the created Task identity')
  await act(async () => { fireEvent.click(within(form).getByRole('button', { name: 'Retry' })) })
  await waitFor(() => expect(screen.queryByRole('form', { name: 'Create task form' })).toBeNull())
  expect(createTask).toHaveBeenCalledTimes(1)
  expect(linkSignalTask).toHaveBeenNthCalledWith(2, 'signal-42', 'created-task')
})

// AC-003
it('confirms the saved Task in the current collection when pending success arrives after route return', async () => {
  let confirm!: () => void
  vi.mocked(listTasks).mockResolvedValue([])
  vi.mocked(createTask).mockReturnValueOnce(new Promise((resolve) => {
    confirm = () => {
      vi.mocked(listTasks).mockResolvedValue([{
        id: 'saved-return', org_id: 'org', title: 'Saved Task after returning', business_unit_id: 'bu-1', status: 'Open',
        responsible_person_id: VIEWER_ID, accountable_person_id: LEAD_ID, consulted_person_ids: [], informed_person_ids: [],
        due_date: null, objective_id: null, work_line_id: null, last_activity_at: '2026-06-11T10:00:00Z',
        archived_at: null, created_by: VIEWER_ID,
      }])
      resolve('saved-return')
    }
  }))
  await act(async () => { render(retainedWorkspaceRouter()) })
  const form = await screen.findByRole('form', { name: 'Create task form' })
  await act(async () => { fireEvent.change(within(form).getByRole('textbox', { name: 'Title' }), { target: { value: 'Saved Task after returning' } }) })
  await act(async () => { fireEvent.submit(form) })
  const readsBeforeReturn = vi.mocked(listTasks).mock.calls.length
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Signals destination' })) })
  await screen.findByText('Signals destination body')
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Task collection' })) })
  await waitFor(() => expect(vi.mocked(listTasks).mock.calls.length).toBeGreaterThan(readsBeforeReturn))
  expect(await screen.findByRole('textbox', { name: 'Title' })).toBeDisabled()
  expect(screen.queryByRole('link', { name: /^Saved Task after returning(?:\s|$)/ })).toBeNull()
  await act(async () => confirm())
  expect(await screen.findByRole('link', { name: /^Saved Task after returning(?:\s|$)/ })).toHaveAttribute('href', '/work/tasks/saved-return')
  expect(screen.queryByRole('form', { name: 'Create task form' })).toBeNull()
  expect(createTask).toHaveBeenCalledTimes(1)
})
