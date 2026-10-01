// Record relationship coverage for the canonical Objective ⇄ Project/Process pages: the work an
// Objective is reached through, a Project's parent and Task contribution, Process definition facts,
// history from the record's own table, and the read-only member view.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AuthContext, type AuthState } from '@/auth/context'
import type { TaskListRow } from '@/lib/db/tasks.types'

vi.mock('@/lib/db/objectives', () => ({ updateObjective: vi.fn(), listObjectivesAll: vi.fn(), renameObjective: vi.fn(), setObjectiveArchived: vi.fn() }))
vi.mock('@/lib/db/work-lines', () => ({ updateWorkLine: vi.fn(), listWorkLinesAll: vi.fn(), renameWorkLine: vi.fn(), setWorkLineArchived: vi.fn() }))
vi.mock('@/lib/db/objective-writeup', async (orig) => ({ ...(await orig<typeof import('@/lib/db/objective-writeup')>()), readWriteUp: async () => null }))
vi.mock('@/components/processes/process-occurrence-controls', () => ({
  ProcessOccurrenceControls: ({ canManageSetup, setupIncomplete }: { canManageSetup?: boolean; setupIncomplete?: boolean }) => (
    <div data-testid="process-controls">{setupIncomplete ? (canManageSetup ? 'Manager setup recovery' : 'Member setup recovery') : 'Current and next actions'}</div>
  ),
}))
vi.mock('./catalog-record-loader', () => ({ loadCatalogRecordData: vi.fn(), loadCatalogRecordEditDirectory: vi.fn() }))
const historyLoad = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db/record-history', async (orig) => ({ ...(await orig<typeof import('@/lib/db/record-history')>()), loadRecordHistory: historyLoad }))
const runtimeAuthority = vi.hoisted(() => ({
  scopes: {
    workline_org: true,
    objective_org: true,
    workline_bu_ids: [] as string[],
    objective_bu_ids: [] as string[],
  },
}))
vi.mock('@/lib/db/objective-key-results', () => ({ listKeyResults: async () => [] }))
vi.mock('@/lib/db/directory', async (importActual) => ({ ...(await importActual<typeof import('@/lib/db/directory')>()), getPeople: async () => [] }))
vi.mock('./use-work-write-authority', async (importActual) => ({
  canEditObjectiveContentForScope: (await importActual<typeof import('./use-work-write-authority')>()).canEditObjectiveContentForScope,
  canCreateForScope: (await importActual<typeof import('./use-work-write-authority')>()).canCreateForScope,
  useWorkWriteAuthority: () => ({ scopes: runtimeAuthority.scopes, loading: false, error: false }),
  allowedBusinessUnitIds: (kind: 'work-line' | 'objective', scopes: typeof runtimeAuthority.scopes) =>
    kind === 'work-line'
      ? (scopes.workline_org ? null : scopes.workline_bu_ids)
      : (scopes.objective_org ? null : scopes.objective_bu_ids),
  canManageForScope: (kind: 'work-line' | 'objective', businessUnitId: string | null | undefined, scopes: typeof runtimeAuthority.scopes) => {
    const org = kind === 'work-line' ? scopes.workline_org : scopes.objective_org
    const buIds = kind === 'work-line' ? scopes.workline_bu_ids : scopes.objective_bu_ids
    return org || (businessUnitId !== null && businessUnitId !== undefined && buIds.includes(businessUnitId))
  },
}))

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
    ? [{ id: 'wl-1', name: 'Menu launch', relationship: 'direct' as const, entity: 'work-line' as const, objectiveId: 'obj-1', workLineId: 'wl-1', taskCount: relationTasks.length, done: 1, total: relationTasks.length, tasks: relationTasks.map(relationTask) }]
    : [
        ...(objectiveId ? [{ id: 'obj-1', name: 'Grow revenue', relationship: 'direct' as const, entity: 'objective' as const, objectiveId: 'obj-1', workLineId: 'wl-1', taskCount: relationTasks.length, done: 1, total: relationTasks.length, tasks: relationTasks.map(relationTask) }] : []),
        { id: 'obj-2', name: 'Improve margin', relationship: 'contribution' as const, entity: 'objective' as const, objectiveId: 'obj-2', workLineId: 'wl-1', taskCount: 1, done: 0, total: 1, tasks: [relationTask(relationTasks[1])] },
      ]
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
    workLinesById: kind === 'objective'
      ? new Map([['wl-1', { id: 'wl-1', name: 'Menu launch', type: 'project' as const, objectiveId: 'obj-1', businessUnitId: 'bu-1', responsiblePersonId: 'p1' }]])
      : new Map(),
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

const facts = () => screen.getByRole('list', { name: 'Key facts' })

/** What separates a member from a catalog manager on the same record: no record actions and no
 *  field edits, with one line saying the record is view-only. */
async function expectMemberReadOnly(note = 'View only') {
  await waitFor(() => expect(screen.getByRole('note')).toHaveTextContent(note))
  expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull()
  expect(screen.queryAllByRole('button', { name: /^Edit / })).toHaveLength(0)
}

beforeEach(() => {
  vi.clearAllMocks()
  historyLoad.mockResolvedValue({
    entries: [{ id: 'h1', action: 'update', field: 'name', oldValue: 'Old name', newValue: 'Renamed goal', occurredAt: '2026-09-30T02:00:00Z', channel: 'app', actorName: 'Test Viewer' }],
    names: new Map(),
  })
  runtimeAuthority.scopes = {
    workline_org: true,
    objective_org: true,
    workline_bu_ids: [],
    objective_bu_ids: [],
  }
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
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
  })) as never
})

describe('record relationship grammar', () => {
  it('lists an Objective\'s work and its tasks as rows that open their own records, with the roll-up in the header', async () => {
    renderRecord('objective', 'obj-1')
    await screen.findByRole('heading', { level: 1, name: 'Grow revenue' })
    const work = await screen.findByRole('region', { name: 'Projects & Processes' })
    expect(within(work).getAllByRole('link', { name: 'Menu launch' })).toHaveLength(1)
    expect(work).toHaveTextContent('1 · 1 of 2 tasks done')
    const tasks = await screen.findByRole('region', { name: 'Tasks' })
    expect(within(tasks).getByRole('link', { name: 'Print the menus' })).toHaveAttribute('href', '/work/tasks/task-1')
    expect(within(tasks).getByRole('link', { name: 'Brief the floor' })).toHaveAttribute('href', '/work/tasks/task-2')
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(document.body.textContent?.toLowerCase()).not.toContain('cascade')
  })

  it.each([['objective', 'objectives'], ['work-line', 'work_lines']] as const)(
    'shows the %s change history, read from its own table once opened',
    async (kind, table) => {
      renderRecord(kind, kind === 'objective' ? 'obj-1' : 'wl-1')
      await screen.findByRole('heading', { level: 1, name: kind === 'objective' ? 'Grow revenue' : 'Menu launch' })
      fireEvent.click(await screen.findByRole('button', { name: 'History' }))
      const history = await screen.findByRole('region', { name: 'History' })
      expect(await within(history).findByText('Test Viewer')).toBeInTheDocument()
      expect(history).toHaveTextContent('Old name → Renamed goal')
      expect(historyLoad).toHaveBeenCalledWith(table, kind === 'objective' ? 'obj-1' : 'wl-1')
    },
  )

  it('shows the parent Objective as a fact and the Task contribution in Work, never as a linked-work row', async () => {
    renderRecord('work-line', 'wl-1')
    await screen.findByRole('heading', { level: 1, name: 'Menu launch' })
    expect(within(facts()).getByRole('link', { name: 'Grow revenue' })).toHaveAttribute('href', '/work/objectives/obj-1')
    const tasks = await screen.findByRole('region', { name: 'Tasks' })
    expect(tasks).toHaveTextContent('1 of 2 done')
    expect(within(tasks).getByRole('link', { name: 'Brief the floor' })).toHaveAttribute('href', '/work/tasks/task-2')
    expect(screen.queryByRole('region', { name: 'Linked work' })).toBeNull()
    expect(document.querySelector('[data-field-key="name"] .record-field__value')?.textContent).toBe('Menu launch')
  })

  it('keeps a Task-only Objective contribution separate from a missing parent', async () => {
    currentObjectiveId = null
    renderRecord('work-line', 'wl-1')
    await screen.findByRole('heading', { level: 1, name: 'Menu launch' })
    await waitFor(() => expect(within(facts()).getByRole('button', { name: 'Edit Objective' })).toHaveTextContent('+ Set Objective'))
    expect(within(facts()).queryByRole('link', { name: 'Grow revenue' })).not.toBeInTheDocument()
  })

  it('shows an unlinked Project honestly: no parent fact for a reader, a Set prompt for a manager', async () => {
    vi.mocked(loadCatalogRecordData).mockImplementation(async (kind, id) => {
      if (kind !== 'work-line' || id !== 'wl-1') return null
      const result = recordData(kind, currentPeriodYear, null)
      result.context.relationsById = new Map([['wl-1', { groups: [], tasks: [] }]])
      result.context.progressById = new Map([['wl-1', { done: 0, total: 0 }]])
      return result
    })
    renderRecord('work-line', 'wl-1')
    await screen.findByRole('heading', { level: 1, name: 'Menu launch' })
    await waitFor(() => expect(within(facts()).getByRole('button', { name: 'Edit Objective' })).toHaveTextContent('+ Set Objective'))
    expect(within(facts()).queryByRole('link')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/No linked/)
  })

  it('leads a Process with its occurrences and offers the first step while it has none', async () => {
    const processData = recordData('work-line', 2026, null)
    processData.row = { ...processData.row, id: 'wl-process', name: 'Café Opening', type: 'process', objectiveId: null }
    processData.context.relationsById = new Map([['wl-process', { groups: [], tasks: [] }]])
    processData.process = { cadence: null, steps: [], occurrences: [] }
    vi.mocked(loadCatalogRecordData).mockResolvedValue(processData)

    renderRecord('work-line', 'wl-process')
    await screen.findByRole('heading', { level: 1, name: 'Café Opening' })
    expect(await screen.findByTestId('process-controls')).toHaveTextContent('Manager setup recovery')
    expect(screen.getByRole('button', { name: 'Add first step' })).toBeInTheDocument()
    expect(screen.getByText('Chosen for each occurrence')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })
})

it('saves an Objective period through its existing record API and reloads the displayed value', async () => {
  renderRecord('objective', 'obj-1')
  await screen.findByRole('heading', { level: 1, name: 'Grow revenue' })
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Period' }))
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
  await screen.findByRole('heading', { level: 1, name: 'Menu launch' })
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }))

  expect(writeText).toHaveBeenCalledWith(new URL('/mos/work/projects/wl-1', window.location.origin).href)
})

it('removes a Project Objective relation through its existing record API', async () => {
  renderRecord('work-line', 'wl-1')
  await screen.findByRole('heading', { level: 1, name: 'Menu launch' })
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Objective' }))
  fireEvent.click(screen.getByRole('combobox', { name: 'Objective' }))
  fireEvent.click(screen.getByRole('option', { name: 'Not set' }))
  await waitFor(() => expect(updateWorkLine).toHaveBeenCalledWith('wl-1', { objective_id: null }))
  await waitFor(() => expect(within(facts()).queryByRole('link', { name: 'Grow revenue' })).not.toBeInTheDocument())
})

it('does not offer Not set when an own-BU editor must retain the Business Unit', async () => {
  runtimeAuthority.scopes = {
    workline_org: false,
    objective_org: false,
    workline_bu_ids: ['bu-1'],
    objective_bu_ids: [],
  }

  renderRecord('work-line', 'wl-1')
  await screen.findByRole('heading', { level: 1, name: 'Menu launch' })
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Business Unit' }))

  const picker = screen.getByRole('combobox', { name: 'Business Unit' })
  fireEvent.click(picker)
  expect(screen.queryByRole('option', { name: 'Not set' })).not.toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Retail Ops' })).toBeInTheDocument()
})

it('renders definition-level Process Teams and leaves unbound ones out', async () => {
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
  await screen.findByRole('heading', { level: 1, name: 'Café Opening' })
  expect(screen.getByText('Chosen for each occurrence')).toBeInTheDocument()
  const steps = await screen.findByRole('region', { name: 'Steps' })
  expect(within(steps).getByText('Definition Team')).toBeInTheDocument()
  // A step prints what it has: no Supervisor or Supervisor Team rows when none is bound.
  expect(within(steps).queryByText('Not set')).not.toBeInTheDocument()
  expect(within(steps).queryByText('Supervisor')).not.toBeInTheDocument()
  expect(within(steps).queryByText('occurrence-team')).not.toBeInTheDocument()
})

it.each(['panel', 'page'] as const)('keeps the org-readable Work record available in %s mode for members', async (mode) => {
  const member = auth()
  if (member.status === 'authenticated') member.viewer.accessRoles = ['member']
  runtimeAuthority.scopes = {
    workline_org: false,
    objective_org: false,
    workline_bu_ids: [],
    objective_bu_ids: [],
  }
  render(<AuthContext.Provider value={member}><I18nProvider><MemoryRouter>
    <CatalogRecordDocument kind="work-line" id="wl-1" mode={mode} />
  </MemoryRouter></I18nProvider></AuthContext.Provider>)
  expect(await screen.findByRole('heading', { name: 'Menu launch' })).toBeInTheDocument()
  expect(loadCatalogRecordData).toHaveBeenCalledWith('work-line', 'wl-1', 'p1')
  await expectMemberReadOnly('Test Viewer (Accountable) manages this Project or Process. You can add tasks.')
  // Read-only appears ONCE, as one line under the facts, in either mode.
  expect(screen.getAllByRole('note')).toHaveLength(1)
  expect(document.body.textContent).not.toContain('catalog changes')
})

it('keeps Objectives readable by members through the shared record renderer', async () => {
  const member = auth()
  if (member.status === 'authenticated') member.viewer.accessRoles = ['member']
  runtimeAuthority.scopes = {
    workline_org: false,
    objective_org: false,
    workline_bu_ids: [],
    objective_bu_ids: [],
  }
  render(<AuthContext.Provider value={member}><I18nProvider><MemoryRouter>
    <CatalogRecordDocument kind="objective" id="obj-1" mode="panel" />
  </MemoryRouter></I18nProvider></AuthContext.Provider>)
  expect(await screen.findByRole('heading', { name: 'Grow revenue' })).toBeInTheDocument()
  await expectMemberReadOnly('You can add tasks.')
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
