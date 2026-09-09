// Record relationship coverage for the canonical Objective ⇄ Project/Process documents.
// The old collection-era accordion is intentionally gone: relationships now live in the record
// Details/Activity sections and every destination is a real canonical link.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AuthContext, type AuthState } from '@/auth/context'
import type { TaskListRow } from '@/lib/db/tasks.types'

vi.mock('@/lib/db/objectives', () => ({ updateObjective: vi.fn() }))
vi.mock('@/lib/db/work-lines', () => ({ updateWorkLine: vi.fn() }))
vi.mock('./catalog-record-loader', () => ({ loadCatalogRecordData: vi.fn(), loadCatalogRecordEditDirectory: vi.fn() }))

import { updateObjective } from '@/lib/db/objectives'
import { updateWorkLine } from '@/lib/db/work-lines'
import { loadCatalogRecordData, loadCatalogRecordEditDirectory, type CatalogRecordData } from './catalog-record-loader'
import { CatalogRecordDocument } from './catalog-record-document'

function auth(): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'org-1', user_id: 'u1', full_name: 'Test Viewer',
        email: 'viewer@example.test', must_change_password: false, archived_at: null,
        created_at: '2026-08-01', updated_at: '2026-08-01',
      },
      roles: [], isManager: false, accessRoles: ['admin'], affiliated: [],
    },
    signOut: vi.fn(),
  }
}

function task(overrides: Partial<TaskListRow> & { id: string; title: string }): TaskListRow {
  return {
    org_id: 'org-1', business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: 'p1', accountable_person_id: 'p1', consulted_person_ids: [],
    informed_person_ids: [], description: null, due_date: null,
    objective_id: null, work_line_id: null,
    last_activity_at: '2026-08-01T00:00:00Z', archived_at: null, created_by: 'p1',
    created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

const objectiveRow = { id: 'obj-1', name: 'Grow revenue', archived_at: null, period_year: 2026 }
const workLineRow = { id: 'wl-1', name: 'Menu launch', type: 'project' as const, objective_id: 'obj-1', archived_at: null }
const relationTasks = [
  task({ id: 'task-1', title: 'Print the menus', work_line_id: 'wl-1', status: 'Done' }),
  task({ id: 'task-2', title: 'Brief the floor', work_line_id: 'wl-1' }),
]
let currentPeriodYear = 2026
let currentObjectiveId: string | null = 'obj-1'

function relationTask(row: TaskListRow) {
  return { id: row.id, title: row.title, status: row.status, lastActivityAt: row.last_activity_at }
}

function recordData(kind: 'objective' | 'work-line', periodYear: number, objectiveId: string | null): CatalogRecordData {
  const row = kind === 'objective'
    ? { ...objectiveRow, periodYear }
    : { ...workLineRow, objectiveId, businessUnitId: 'bu-1', accountablePersonId: 'p1', responsiblePersonId: 'p1' }
  const groups = kind === 'objective'
    ? [{ id: 'wl-1', name: 'Menu launch', taskCount: relationTasks.length, done: 1, total: relationTasks.length, tasks: relationTasks.map(relationTask) }]
    : (objectiveId ? [{ id: 'obj-1', name: 'Grow revenue', taskCount: relationTasks.length, done: 1, total: relationTasks.length, tasks: relationTasks.map(relationTask) }] : [])
  return {
    row,
    context: {
      traceById: new Map(),
      relationsById: new Map([[row.id, { groups, tasks: relationTasks.map(relationTask) }]]),
      relationsKind: kind === 'objective' ? 'objective' : 'work_line',
      progressById: new Map([[row.id, { done: 1, total: relationTasks.length }]]),
      businessUnitsById: new Map([['bu-1', 'Retail Ops']]),
      peopleById: new Map([['p1', 'Test Viewer']]),
      objectiveOptions: objectiveId ? [{ value: 'obj-1', label: 'Grow revenue' }] : [],
    },
    process: null,
    peopleById: new Map([['p1', 'Test Viewer']]),
    roleNamesById: new Map(),
    owningTeams: new Map(),
  }
}

function renderRecord(kind: 'objective' | 'work-line', id: string) {
  return render(
    <AuthContext.Provider value={auth()}>
      <I18nProvider>
        <MemoryRouter>
          <CatalogRecordDocument kind={kind} id={id} mode="page" />
        </MemoryRouter>
      </I18nProvider>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  currentPeriodYear = 2026
  currentObjectiveId = 'obj-1'
  vi.mocked(loadCatalogRecordData).mockImplementation(async (kind, id) => {
    if (kind === 'objective' && id === 'obj-1') return recordData(kind, currentPeriodYear, currentObjectiveId)
    if (kind === 'work-line' && id === 'wl-1') return recordData(kind, currentPeriodYear, currentObjectiveId)
    return null
  })
  vi.mocked(loadCatalogRecordEditDirectory).mockResolvedValue({
    businessUnitsById: new Map([['bu-1', 'Retail Ops'], ['bu-2', 'Hospitality']]),
    peopleById: new Map([['p1', 'Test Viewer'], ['p2', 'Second Person']]),
    objectiveOptions: [{ value: 'obj-1', label: 'Grow revenue' }, { value: 'obj-2', label: 'Improve margin' }],
  })
  vi.mocked(updateObjective).mockImplementation(async (_id, patch) => {
    if (patch.period_year !== undefined && patch.period_year !== null) currentPeriodYear = patch.period_year
  })
  vi.mocked(updateWorkLine).mockImplementation(async (_id, patch) => {
    if (patch.objective_id !== undefined) currentObjectiveId = patch.objective_id
  })
})

describe('record relationship grammar', () => {
  it('links an Objective to real child Project/Process records and its Tasks', async () => {
    renderRecord('objective', 'obj-1')
    const record = await screen.findByRole('heading', { name: 'Grow revenue' })
    expect(record).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Menu launch' })).toHaveAttribute('href', '/work/projects/wl-1')

    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }))
    const activity = screen.getByRole('heading', { name: 'Activity' }).closest('section')!
    expect(within(activity).getByRole('link', { name: 'Print the menus' })).toHaveAttribute('href', '/work/tasks/task-1')
    expect(within(activity).getByRole('link', { name: 'Brief the floor' })).toHaveAttribute('href', '/work/tasks/task-2')
    expect(document.body.textContent?.toLowerCase()).not.toContain('cascade')
  })

  it('links a Project/Process to its parent Objective and linked Tasks', async () => {
    renderRecord('work-line', 'wl-1')
    await screen.findByRole('heading', { name: 'Menu launch' })
    expect(screen.getByRole('link', { name: 'Grow revenue' })).toHaveAttribute('href', '/work/objectives/obj-1')
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }))
    expect(screen.getByRole('link', { name: 'Brief the floor' })).toHaveAttribute('href', '/work/tasks/task-2')
  })
})

it('saves an Objective period through its existing record API and reloads the displayed value', async () => {
  renderRecord('objective', 'obj-1')
  await screen.findByRole('heading', { name: 'Grow revenue' })
  fireEvent.click(screen.getByRole('button', { name: 'Edit Period' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Period' }), { target: { value: '2031' } })
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Period' }), { key: 'Enter' })
  await waitFor(() => expect(updateObjective).toHaveBeenCalledWith('obj-1', { period_year: 2031 }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Period' })).toHaveTextContent('2031'))
})

it('copies the canonical WorkLine URL from a nested collection stack', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  render(
    <AuthContext.Provider value={auth()}>
      <I18nProvider>
        <MemoryRouter basename="/mos" initialEntries={['/mos/work/projects?record=wl-1']}>
          <CatalogRecordDocument kind="work-line" id="wl-1" mode="page" />
        </MemoryRouter>
      </I18nProvider>
    </AuthContext.Provider>,
  )
  await screen.findByRole('heading', { name: 'Menu launch' })
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }))

  expect(writeText).toHaveBeenCalledWith(new URL('/mos/work/projects/wl-1', window.location.origin).href)
})

it('removes a Project Objective relation through its existing record API', async () => {
  renderRecord('work-line', 'wl-1')
  await screen.findByRole('heading', { name: 'Menu launch' })
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Objective' }))
  fireEvent.click(screen.getByRole('combobox', { name: 'Objective' }))
  fireEvent.click(screen.getByRole('option', { name: 'Not set' }))
  await waitFor(() => expect(updateWorkLine).toHaveBeenCalledWith('wl-1', { objective_id: null }))
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Grow revenue' })).not.toBeInTheDocument())
})

it('renders definition-level Process Teams and keeps absent bindings explicit', async () => {
  const processData = recordData('work-line', 2026, null)
  processData.row = { ...processData.row, id: 'wl-process', name: 'Café Opening', type: 'process', objectiveId: null }
  processData.context.relationsById = new Map([[processData.row.id, { groups: [], tasks: [] }]])
  processData.process = {
    cadence: null,
    steps: [{
      id: 'def-1', work_line_id: 'wl-process', title: 'Open floor', description: null, position: 1,
      due_offset_days: 0, pic_person_id: 'p1', pic_role_id: null,
      supervisor_person_id: null, supervisor_role_id: null, checklist_items: [], archived_at: null,
    }],
    occurrences: [{
      id: 'run-1', work_line_id: 'wl-process', owning_team_id: 'occurrence-team', period_key: '2026-08-01',
      caption: 'August', scheduled_date: '2026-08-01', status: 'open', definition_version: 1,
      started_by: null, completed_at: null, completed_by: null,
    }],
  }
  processData.owningTeams = new Map([
    ['def-1:pic', 'Definition Team'],
    ['def-1:supervisor', null],
  ])
  vi.mocked(loadCatalogRecordData).mockResolvedValue(processData)

  renderRecord('work-line', 'wl-process')
  await screen.findByRole('heading', { name: 'Café Opening' })
  expect(screen.getByText('Chosen for each occurrence')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Steps' }))
  const steps = screen.getByRole('tabpanel')
  expect(within(steps).getByText('Definition Team')).toBeInTheDocument()
  expect(within(steps).getAllByText('Not set')).toHaveLength(2)
  expect(within(steps).queryByText('occurrence-team')).not.toBeInTheDocument()
})


it.each(['panel', 'page'] as const)('keeps the canonical Work access boundary in %s mode before reading data', (mode) => {
  const member = auth()
  if (member.status === 'authenticated') member.viewer.accessRoles = ['member']
  render(<AuthContext.Provider value={member}><I18nProvider><MemoryRouter>
    <CatalogRecordDocument kind="work-line" id="wl-1" mode={mode} />
  </MemoryRouter></I18nProvider></AuthContext.Provider>)
  expect(screen.getByRole('heading', { name: 'Project or Process outside your access' })).toBeInTheDocument()
  expect(loadCatalogRecordData).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
})

it('keeps Objectives readable by members through the shared record renderer', async () => {
  const member = auth()
  if (member.status === 'authenticated') member.viewer.accessRoles = ['member']
  render(<AuthContext.Provider value={member}><I18nProvider><MemoryRouter>
    <CatalogRecordDocument kind="objective" id="obj-1" mode="panel" />
  </MemoryRouter></I18nProvider></AuthContext.Provider>)
  expect(await screen.findByRole('heading', { name: 'Grow revenue' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit Name' })).toBeNull()
})


it('keeps the record readable when edit choices fail and restores editing after Retry', async () => {
  vi.mocked(loadCatalogRecordEditDirectory).mockRejectedValueOnce(new Error('unavailable'))
  renderRecord('work-line', 'wl-1')
  expect(await screen.findByRole('heading', { name: 'Menu launch' })).toBeInTheDocument()
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load edit choices')
  expect(screen.queryByRole('button', { name: 'Edit Accountable' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('button', { name: 'Edit Accountable' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).toBeNull()
})
