// Record relationship coverage for the canonical Objective ⇄ Project/Process documents.
// Work is the primary overview; Details is a facts-only secondary surface.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AuthContext, type AuthState } from '@/auth/context'
import type { TaskListRow } from '@/lib/db/tasks.types'

vi.mock('@/lib/db/objectives', () => ({ updateObjective: vi.fn() }))
vi.mock('@/lib/db/work-lines', () => ({ updateWorkLine: vi.fn() }))
vi.mock('@/components/processes/process-occurrence-controls', () => ({
  ProcessOccurrenceControls: ({ canManageSetup, setupIncomplete }: { canManageSetup?: boolean; setupIncomplete?: boolean }) => (
    <div data-testid="process-controls">{setupIncomplete ? (canManageSetup ? 'Manager setup recovery' : 'Member setup recovery') : 'Current and next actions'}</div>
  ),
}))
vi.mock('./catalog-record-loader', () => ({ loadCatalogRecordData: vi.fn(), loadCatalogRecordEditDirectory: vi.fn() }))
const runtimeAuthority = vi.hoisted(() => ({
  scopes: {
    workline_org: true,
    objective_org: true,
    workline_bu_ids: [] as string[],
    objective_bu_ids: [] as string[],
  },
}))
vi.mock('./use-work-write-authority', () => ({
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

async function openDetailsTab() {
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Work' })).toHaveAttribute('aria-selected', 'true'))
  fireEvent.click(screen.getByRole('tab', { name: 'Details' }))
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true'))
}

beforeEach(() => {
  vi.clearAllMocks()
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
})

describe('record relationship grammar', () => {
  it('keeps Objective work in one Work region and Details limited to facts', async () => {
    renderRecord('objective', 'obj-1')
    const record = await screen.findByRole('heading', { name: 'Grow revenue' })
    expect(record).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Work' })).toHaveAttribute('aria-selected', 'true'))
    const work = screen.getByRole('tabpanel')
    expect(within(work).getByTestId('catalog-record-progress')).toHaveTextContent('1 / 2 tasks done')
    expect(within(work).getAllByRole('link', { name: 'Menu launch' })).toHaveLength(1)
    expect(within(work).getByRole('link', { name: 'Print the menus' })).toHaveAttribute('href', '/work/tasks/task-1')
    expect(within(work).getByRole('link', { name: 'Brief the floor' })).toHaveAttribute('href', '/work/tasks/task-2')
    expect(screen.queryByRole('tab', { name: 'Activity' })).not.toBeInTheDocument()

    await openDetailsTab()
    const details = screen.getByRole('tabpanel')
    expect(within(details).getByText('2026')).toBeInTheDocument()
    expect(within(details).queryByRole('link', { name: 'Menu launch' })).not.toBeInTheDocument()
    expect(within(details).queryByRole('link', { name: 'Print the menus' })).not.toBeInTheDocument()
    expect(document.body.textContent?.toLowerCase()).not.toContain('cascade')
  })

  it('shows the direct parent and Task contribution in Work without a duplicate Details link', async () => {
    renderRecord('work-line', 'wl-1')
    await screen.findByRole('heading', { name: 'Menu launch' })
    const work = screen.getByRole('tabpanel')
    expect(within(work).getByRole('link', { name: 'Grow revenue' })).toHaveAttribute('href', '/work/objectives/obj-1')
    expect(within(work).getByRole('link', { name: 'Contributes to: Improve margin' })).toHaveAttribute('href', '/work/objectives/obj-2')
    expect(document.querySelector('[data-field-key="name"]')).toBeNull()
    expect(within(work).getByTestId('catalog-record-progress')).toHaveTextContent('1 / 2 tasks done')
    expect(within(work).getByRole('link', { name: 'Brief the floor' })).toHaveAttribute('href', '/work/tasks/task-2')

    await openDetailsTab()
    const details = screen.getByRole('tabpanel')
    expect(within(details).getByText('Grow revenue')).toBeInTheDocument()
    expect(within(details).queryByRole('link', { name: 'Grow revenue' })).not.toBeInTheDocument()
    expect(within(details).queryByTestId('catalog-record-links')).not.toBeInTheDocument()
  })

  it('keeps a Task-only Objective contribution separate from a missing direct parent', async () => {
    currentObjectiveId = null
    renderRecord('work-line', 'wl-1')
    await screen.findByRole('heading', { name: 'Menu launch' })
    const work = screen.getByRole('tabpanel')
    expect(within(work).getByTestId('catalog-record-progress')).toHaveTextContent('1 / 2 tasks done')
    expect(within(work).getByRole('link', { name: 'Contributes to: Improve margin' })).toHaveAttribute('href', '/work/objectives/obj-2')
    expect(within(work).queryByRole('link', { name: 'Grow revenue' })).not.toBeInTheDocument()
    expect(document.querySelector('[data-field-key="name"]')).toBeNull()
    await openDetailsTab()
    expect(within(screen.getByRole('tabpanel')).getByText('Not set')).toBeInTheDocument()
  })

  it('shows an unlinked Work Line honestly when it has no parent or contribution', async () => {
    vi.mocked(loadCatalogRecordData).mockImplementation(async (kind, id) => {
      if (kind !== 'work-line' || id !== 'wl-1') return null
      const result = recordData(kind, currentPeriodYear, null)
      result.context.relationsById = new Map([['wl-1', { groups: [], tasks: [] }]])
      result.context.progressById = new Map([['wl-1', { done: 0, total: 0 }]])
      return result
    })
    renderRecord('work-line', 'wl-1')
    await screen.findByRole('heading', { name: 'Menu launch' })
    const work = screen.getByRole('tabpanel')
    expect(within(work).getByText('No linked Objective yet.')).toBeInTheDocument()
    expect(within(work).queryByRole('link', { name: /Objective/ })).not.toBeInTheDocument()
    await openDetailsTab()
    expect(within(screen.getByRole('tabpanel')).getByText('Not set')).toBeInTheDocument()
  })

  it('puts Process occurrence work first, with definition facts and Steps kept secondary', async () => {
    const processData = recordData('work-line', 2026, null)
    processData.row = { ...processData.row, id: 'wl-process', name: 'Café Opening', type: 'process', objectiveId: null }
    processData.context.relationsById = new Map([['wl-process', { groups: [], tasks: [] }]])
    processData.process = { cadence: null, steps: [], occurrences: [] }
    vi.mocked(loadCatalogRecordData).mockResolvedValue(processData)

    renderRecord('work-line', 'wl-process')
    await screen.findByRole('heading', { name: 'Café Opening' })
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Work' })).toHaveAttribute('aria-selected', 'true'))
    expect(screen.getByTestId('process-controls')).toHaveTextContent('Manager setup recovery')

    await openDetailsTab()
    expect(screen.getByText('Chosen for each occurrence')).toBeInTheDocument()
    expect(screen.queryByTestId('process-controls')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Steps' }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('No active steps defined yet.')
  })
})

it('saves an Objective period through its existing record API and reloads the displayed value', async () => {
  renderRecord('objective', 'obj-1')
  await screen.findByRole('heading', { name: 'Grow revenue' })
  await openDetailsTab()
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
  await openDetailsTab()
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Objective' }))
  fireEvent.click(screen.getByRole('combobox', { name: 'Objective' }))
  fireEvent.click(screen.getByRole('option', { name: 'Not set' }))
  await waitFor(() => expect(updateWorkLine).toHaveBeenCalledWith('wl-1', { objective_id: null }))
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Grow revenue' })).not.toBeInTheDocument())
})

it('does not offer Not set when an own-BU editor must retain the Business Unit', async () => {
  runtimeAuthority.scopes = {
    workline_org: false,
    objective_org: false,
    workline_bu_ids: ['bu-1'],
    objective_bu_ids: [],
  }

  renderRecord('work-line', 'wl-1')
  await screen.findByRole('heading', { name: 'Menu launch' })
  await openDetailsTab()
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Business Unit' }))

  const picker = screen.getByRole('combobox', { name: 'Business Unit' })
  fireEvent.click(picker)
  expect(screen.queryByRole('option', { name: 'Not set' })).not.toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Retail Ops' })).toBeInTheDocument()
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
  await openDetailsTab()
  expect(screen.getByText('Chosen for each occurrence')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Steps' }))
  const steps = screen.getByRole('tabpanel')
  expect(within(steps).getByText('Definition Team')).toBeInTheDocument()
  expect(within(steps).getAllByText('Not set')).toHaveLength(2)
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
  expect(screen.queryByRole('button', { name: 'Edit Name' })).toBeNull()
  await openDetailsTab()
  // Read-only appears ONCE, at the top of Details, in plain language — never per field and never
  // duplicated in the footer, in EITHER mode (panel or full page — read-only never depends on it).
  const notes = document.querySelectorAll('.record-viewer__permission-note')
  expect(notes).toHaveLength(1)
  expect(notes[0]).toHaveTextContent('You can view this, but not edit it.')
  expect(document.body.textContent).not.toContain('catalog changes')
  // The keyboard-hint footnote is gone; Enter/Esc still work, they are just not narrated.
  expect(document.querySelector('.record-viewer__edit-hint')).toBeNull()
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
  await openDetailsTab()
  expect(screen.queryByRole('button', { name: 'Edit Name' })).toBeNull()
})


it('keeps the record readable when edit choices fail and restores editing after Retry', async () => {
  vi.mocked(loadCatalogRecordEditDirectory).mockRejectedValueOnce(new Error('unavailable'))
  renderRecord('work-line', 'wl-1')
  expect(await screen.findByRole('heading', { name: 'Menu launch' })).toBeInTheDocument()
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load edit choices')
  await openDetailsTab()
  expect(screen.queryByRole('button', { name: 'Edit Accountable' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('button', { name: 'Edit Accountable' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).toBeNull()
})
