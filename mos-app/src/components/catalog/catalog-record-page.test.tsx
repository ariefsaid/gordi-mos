// The Objective and Project/Process record pages: one header that answers, one scrolling body.
// Seams under test: the page through its public props, with the real authority hook running over a
// mocked RPC read, so every affordance below follows WorkWriteScopes the way production does.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AuthContext, type AuthState } from '@/auth/context'
import { installDisabledBlur } from '@/test/browser-focus-fixup'
import type { WorkWriteScopes } from '@/lib/db/work-authority'
import type { KeyResultRow } from '@/lib/db/objective-key-results'

vi.mock('@/lib/db/objectives', () => ({ updateObjective: vi.fn(), listObjectivesAll: vi.fn(), renameObjective: vi.fn(), setObjectiveArchived: vi.fn() }))
vi.mock('@/lib/db/work-lines', () => ({ updateWorkLine: vi.fn(), listWorkLinesAll: vi.fn(), renameWorkLine: vi.fn(), setWorkLineArchived: vi.fn() }))
vi.mock('@/lib/db/process-steps', () => ({ createProcessStep: vi.fn() }))
vi.mock('@/lib/db/objective-key-results', () => ({
  listKeyResults: vi.fn(),
  createKeyResult: vi.fn(),
  updateKeyResultTargets: vi.fn(),
  updateKeyResultCurrentValue: vi.fn(),
  deleteKeyResult: vi.fn(),
}))
vi.mock('@/lib/db/directory', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/db/directory')>()),
  getPeople: vi.fn(async () => [{ id: 'p-dewi', full_name: 'Dewi Director' }, { id: 'p-maya', full_name: 'Maya Marketing' }]),
}))
vi.mock('@/lib/db/record-history', async (orig) => ({ ...(await orig<typeof import('@/lib/db/record-history')>()), countRecordHistory: vi.fn(), loadRecordHistory: vi.fn() }))
// The occurrence data is lifted into the record (the header carries the Start primary); the body
// stub exposes ready Teams without duplicating the header's action.
const occurrenceData = vi.hoisted(() => ({
  current: null as null | import('@/components/processes/use-process-occurrences').ProcessOccurrencesData,
}))
vi.mock('@/components/processes/use-process-occurrences', () => ({ useProcessOccurrences: () => occurrenceData.current }))
vi.mock('@/components/processes/process-occurrence-controls', () => ({
  ProcessOccurrenceControls: ({ data }: {
    data?: import('@/components/processes/use-process-occurrences').ProcessOccurrencesData
  }) => (
    <div data-testid="occurrences">
      <section className="process-occurrence-controls__start">
        {data?.startable.map((run) => <span key={`${run.owning_team_id}:${run.period_key}`}>{run.team_name}</span>)}
      </section>
    </div>
  ),
}))
const editorModule = vi.hoisted(() => ({ loads: 0 }))
vi.mock('./objective-writeup-editor', () => {
  editorModule.loads += 1
  return { ObjectiveWriteupEditor: () => <p>write-up editor</p> }
})
vi.mock('@/lib/db/objective-writeup', async (orig) => ({ ...(await orig<typeof import('@/lib/db/objective-writeup')>()), readWriteUp: vi.fn() }))
vi.mock('./catalog-record-loader', () => ({ loadCatalogRecordData: vi.fn(), loadCatalogRecordEditDirectory: vi.fn() }))
vi.mock('@/lib/db/work-authority', () => ({
  emptyWorkWriteScopes: () => ({
    workline_org: false, objective_org: false, workline_bu_ids: [], objective_bu_ids: [],
    objective_content_org: false, objective_content_bu_ids: [],
  }),
  getWorkWriteScopes: vi.fn(),
}))

import { updateObjective, listObjectivesAll, renameObjective, setObjectiveArchived } from '@/lib/db/objectives'
import { updateWorkLine, listWorkLinesAll } from '@/lib/db/work-lines'
import { createProcessStep } from '@/lib/db/process-steps'
import { listKeyResults } from '@/lib/db/objective-key-results'
import { getPeople } from '@/lib/db/directory'
import { countRecordHistory, loadRecordHistory } from '@/lib/db/record-history'
import { readWriteUp } from '@/lib/db/objective-writeup'
import { getWorkWriteScopes } from '@/lib/db/work-authority'
import { loadCatalogRecordData, loadCatalogRecordEditDirectory, type CatalogRecordData } from './catalog-record-loader'
import type { CatalogRelationGroup, CatalogRelationTask, CatalogRow } from './catalog-collection-adapter'
import { CatalogRecordDocument } from './catalog-record-document'

const scopes = (over: Partial<WorkWriteScopes>): WorkWriteScopes => ({
  workline_org: false, objective_org: false, workline_bu_ids: [], objective_bu_ids: [],
  objective_content_org: false, objective_content_bu_ids: [], ...over,
})
const ADMIN = scopes({ objective_org: true, objective_content_org: true, workline_org: true })
const OPS_LEAD = scopes({ objective_content_org: true, workline_org: true })
const BU_HEAD = scopes({ objective_content_bu_ids: ['bu-1'], workline_bu_ids: ['bu-1'] })
const MEMBER = scopes({})

function auth(): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p-dewi', org_id: 'org-1', user_id: 'u1', full_name: 'Dewi Director', email: 'viewer@example.test',
        must_change_password: false, archived_at: null, created_at: '2026-08-01', updated_at: '2026-08-01',
      },
      roles: [], isManager: false, accessRoles: [], affiliated: [],
    },
    signOut: vi.fn(),
  }
}

const kr = (over: Partial<KeyResultRow> = {}): KeyResultRow => ({
  id: 'kr-1', objective_id: 'obj-1', what: 'Weekday average ticket', target_value: 85000, current_value: 72000,
  unit: 'IDR', due_date: '2026-12-31', owner_person_id: 'p-maya', ...over,
})

const task = (id: string, title: string, status: CatalogRelationTask['status'], over: Partial<CatalogRelationTask> = {}): CatalogRelationTask => ({
  id, title, status, lastActivityAt: '2026-09-30T00:00:00Z', dueDate: null, picPersonId: 'p-maya', ...over,
})

interface ObjectiveOptions {
  row?: Partial<CatalogRow>
  linked?: { id: string; name: string; type: 'project' | 'process'; bu?: string }[]
  tasks?: CatalogRelationTask[]
  contributions?: CatalogRelationGroup[]
}

function objectiveData(opts: ObjectiveOptions = {}): CatalogRecordData {
  const row: CatalogRow = {
    id: 'obj-1', name: 'Grow revenue', archived_at: null, businessUnitId: 'bu-1', isCompanyWide: false,
    accountablePersonId: 'p-dewi', periodYear: 2026, periodQuarter: 4, ...opts.row,
  }
  const linked = opts.linked ?? []
  const tasks = opts.tasks ?? []
  const groups = [...linked.map((wl) => ({
    id: wl.id, name: wl.name, relationship: 'direct' as const, entity: 'work-line' as const,
    objectiveId: 'obj-1', workLineId: wl.id, taskCount: tasks.length, done: tasks.filter((t) => t.status === 'Done').length,
    total: tasks.length, tasks,
  })), ...(opts.contributions ?? [])]
  return {
    row,
    context: {
      traceById: new Map(),
      relationsById: new Map([[row.id, { groups, tasks }]]),
      relationsKind: 'objective',
      progressById: new Map([[row.id, { done: tasks.filter((t) => t.status === 'Done').length, total: tasks.length }]]),
      businessUnitsById: new Map([['bu-1', 'Retail Ops']]),
      peopleById: new Map([['p-dewi', 'Dewi Director'], ['p-maya', 'Maya Marketing']]),
      objectiveOptions: [],
    },
    process: null,
    peopleById: new Map([['p-dewi', 'Dewi Director'], ['p-maya', 'Maya Marketing']]),
    roleNamesById: new Map(),
    owningTeams: new Map(),
    workLinesById: new Map(linked.map((wl) => [wl.id, {
      id: wl.id, name: wl.name, type: wl.type, objectiveId: 'obj-1', businessUnitId: wl.bu ?? 'bu-1', responsiblePersonId: 'p-maya',
    }])),
  }
}

function workLineData(type: 'project' | 'process', opts: { tasks?: CatalogRelationTask[]; steps?: number; archived?: boolean } = {}): CatalogRecordData {
  const tasks = opts.tasks ?? []
  const row: CatalogRow = {
    id: 'wl-1', name: type === 'project' ? 'Menu launch' : 'Café opening', type, archived_at: opts.archived ? '2026-09-01T00:00:00Z' : null,
    objectiveId: 'obj-1', businessUnitId: 'bu-1', accountablePersonId: 'p-dewi', responsiblePersonId: 'p-maya',
  }
  const groups = [{
    id: 'obj-1', name: 'Grow revenue', relationship: 'direct' as const, entity: 'objective' as const,
    objectiveId: 'obj-1', workLineId: 'wl-1', taskCount: tasks.length, done: 0, total: tasks.length, tasks,
  }]
  return {
    row,
    context: {
      traceById: new Map(),
      relationsById: new Map([[row.id, { groups, tasks }]]),
      relationsKind: 'work_line',
      progressById: new Map([[row.id, { done: 0, total: tasks.length }]]),
      businessUnitsById: new Map([['bu-1', 'Retail Ops']]),
      peopleById: new Map([['p-dewi', 'Dewi Director'], ['p-maya', 'Maya Marketing']]),
      objectiveOptions: [{ value: 'obj-1', label: 'Grow revenue' }],
    },
    process: type === 'process'
      ? {
          cadence: { id: 'c1', work_line_id: 'wl-1', cadence_kind: 'daily', active: true, timezone: 'Asia/Jakarta', anchor_date: null },
          steps: Array.from({ length: opts.steps ?? 0 }, (_, i) => ({
            id: `s${i}`, work_line_id: 'wl-1', title: `Step ${i + 1}`, description: null, position: i, due_offset_days: 0,
            pic_person_id: 'p-maya', pic_role_id: null, supervisor_person_id: null, supervisor_role_id: null, checklist_items: [], archived_at: null,
          })),
          occurrences: [],
        }
      : null,
    peopleById: new Map([['p-dewi', 'Dewi Director'], ['p-maya', 'Maya Marketing']]),
    roleNamesById: new Map(),
    owningTeams: new Map(),
    workLinesById: new Map(),
  }
}

const dueRun = (team: string, teamId: string) => ({
  work_line_id: 'wl-1', process_name: 'Café opening', owning_team_id: teamId, team_name: team, period_key: '2026-10-01', scheduled_date: '2026-10-01',
})
const startRun = vi.fn(async () => {})
const occurrences = (startable: ReturnType<typeof dueRun>[], over: Partial<NonNullable<typeof occurrenceData.current>> = {}) => {
  occurrenceData.current = {
    state: 'ready', occurrences: [], startable, startableTeamIds: new Set(), closableRunIds: new Set(), authorityError: false,
    actionError: false, setActionError: vi.fn(), startingKey: null, startError: false, load: async () => {}, retry: vi.fn(), start: startRun, ...over,
  }
}

let data: CatalogRecordData
const onCreateTask = vi.fn()

function renderRecord(kind: 'objective' | 'work-line' = 'objective', mode: 'page' | 'panel' = 'page', taskAddedRef?: { current: boolean }, locale: 'en' | 'id' = 'en') {
  return render(
    <AuthContext.Provider value={auth()}>
      <I18nProvider initialLocale={locale}>
        <MemoryRouter>
          <CatalogRecordDocument kind={kind} id={kind === 'objective' ? 'obj-1' : 'wl-1'} mode={mode} onCreateTask={onCreateTask} taskAddedRef={taskAddedRef} />
        </MemoryRouter>
      </I18nProvider>
    </AuthContext.Provider>,
  )
}

const facts = () => screen.getByRole('list', { name: 'Key facts' })
const setup = () => screen.queryByRole('region', { name: /started$/ })

function setWideRecordPage() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(min-width: 1280px)' || query === '(min-width: 768px)', media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
    onchange: null, dispatchEvent: vi.fn(),
  })) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  editorModule.loads = 0
  occurrences([])
  data = objectiveData()
  vi.mocked(getWorkWriteScopes).mockResolvedValue(ADMIN)
  vi.mocked(loadCatalogRecordData).mockImplementation(async () => data)
  vi.mocked(loadCatalogRecordEditDirectory).mockResolvedValue({
    businessUnitsById: new Map([['bu-1', 'Retail Ops']]),
    peopleById: new Map([['p-dewi', 'Dewi Director'], ['p-maya', 'Maya Marketing']]),
    objectiveOptions: [{ value: 'obj-1', label: 'Grow revenue' }],
  })
  vi.mocked(listKeyResults).mockResolvedValue([])
  vi.mocked(readWriteUp).mockResolvedValue({ writeUp: null, updatedAt: '2026-09-30T00:00:00Z' })
  vi.mocked(countRecordHistory).mockResolvedValue(0)
  vi.mocked(loadRecordHistory).mockResolvedValue({ entries: [], names: new Map() })
  vi.mocked(listObjectivesAll).mockResolvedValue([{ id: 'obj-2', name: 'Improve margin' }] as never)
  vi.mocked(listWorkLinesAll).mockResolvedValue([])
  vi.mocked(updateWorkLine).mockResolvedValue(undefined)
  vi.mocked(updateObjective).mockResolvedValue(undefined)
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
  })) as never
})

describe('header: the record answers what, state, who, when', () => {
  it('has no tabs and no eyebrow, and names the owner with the role spelled out', async () => {
    renderRecord()
    await screen.findByRole('heading', { level: 1, name: 'Grow revenue' })
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(document.querySelector('.record-viewer__type')).toBeNull()
    const strip = facts()
    expect(strip).toHaveTextContent('Active')
    expect(strip).toHaveTextContent(/Accountable\s*·\s*Dewi Director/)
    expect(strip).toHaveTextContent('Q4')
    expect(strip).toHaveTextContent('2026')
    expect(strip).toHaveTextContent('Retail Ops')
    expect(strip).not.toHaveTextContent('Responsible')
    expect(within(strip).queryByText(/^A$/)).toBeNull()
  })

  it('renames in place for an admin: the heading edits and saves through the record API', async () => {
    const user = userEvent.setup()
    renderRecord()
    await screen.findByRole('heading', { level: 1, name: 'Grow revenue' })
    await user.click(await screen.findByRole('button', { name: 'Edit Name' }))
    const input = screen.getByRole('textbox', { name: 'Name' })
    await user.clear(input)
    await user.type(input, 'Grow weekday revenue{Enter}')
    await waitFor(() => expect(renameObjective).toHaveBeenCalledWith('obj-1', 'Grow weekday revenue'))
  })

  it('shows Project owners as Responsible then Accountable and the parent Objective as a link fact', async () => {
    data = workLineData('project', { tasks: [task('t1', 'Print menus', 'Open')] })
    renderRecord('work-line')
    await screen.findByRole('heading', { level: 1, name: 'Menu launch' })
    const strip = facts()
    const text = strip.textContent ?? ''
    expect(text.indexOf('Responsible')).toBeGreaterThan(-1)
    expect(text.indexOf('Responsible')).toBeLessThan(text.indexOf('Accountable'))
    expect(strip).toHaveTextContent(/Responsible\s*·\s*Maya Marketing/)
    expect(within(strip).getByRole('link', { name: 'Grow revenue' })).toHaveAttribute('href', '/work/objectives/obj-1')
    expect(strip).toHaveTextContent('Project')
  })

  it('uses an h2 title in a panel so the page keeps one h1', async () => {
    renderRecord('objective', 'panel')
    expect(await screen.findByRole('heading', { level: 2, name: 'Grow revenue' })).toBeInTheDocument()
  })
})

describe('Get started lists only what is missing, and its buttons work', () => {
  it('keeps the setup action primary until the key-result list has actually loaded', async () => {
    let resolveRows!: (rows: KeyResultRow[]) => void
    vi.mocked(listKeyResults).mockReturnValue(new Promise((resolve) => { resolveRows = resolve }))
    renderRecord()
    await screen.findByRole('heading', { level: 1, name: 'Grow revenue' })
    await waitFor(() => expect(listKeyResults).toHaveBeenCalledWith('obj-1'))
    const keyResults = screen.getByRole('region', { name: 'Key results' })
    const started = screen.getByRole('region', { name: 'Get this Objective started' })
    expect(within(keyResults).queryByRole('button', { name: 'Add key result' })).toBeNull()
    expect(within(started).getByRole('button', { name: 'Link Project or Process' })).toHaveClass('btn-primary')

    resolveRows([])
    expect(await within(keyResults).findByRole('button', { name: 'Add key result' })).toHaveClass('btn-primary')
  })

  it('gives the loaded empty Key results section the Objective’s next-action emphasis', async () => {
    renderRecord()
    const keyResults = await screen.findByRole('region', { name: 'Key results' })
    const addKeyResult = await within(keyResults).findByRole('button', { name: 'Add key result' })
    expect(addKeyResult).toHaveClass('btn-primary')
    const started = await screen.findByRole('region', { name: 'Get this Objective started' })
    expect(within(started).getByRole('button', { name: 'Link Project or Process' })).not.toHaveClass('btn-primary')
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1)
  })

  it('makes Save the only primary action while a key-result editor is open', async () => {
    const user = userEvent.setup()
    renderRecord()
    const keyResults = await screen.findByRole('region', { name: 'Key results' })
    await user.click(await within(keyResults).findByRole('button', { name: 'Add key result' }))
    const save = await screen.findByRole('button', { name: 'Save' })
    expect(save).toHaveClass('btn-primary')
    expect(within(await screen.findByRole('region', { name: 'Get this Objective started' }))
      .getByRole('button', { name: 'Link Project or Process' })).not.toHaveClass('btn-primary')
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1)
  })

  it('keeps Key results visible and gives its Add action priority while the success measure is missing', async () => {
    renderRecord()
    const region = await screen.findByRole('region', { name: 'Get this Objective started' })
    const keyResults = await screen.findByRole('region', { name: 'Key results' })
    await within(keyResults).findByText('No key results yet.')
    expect(keyResults).toHaveTextContent('No key results yet.')
    expect(await within(keyResults).findByRole('button', { name: 'Add key result' })).toHaveClass('btn-primary')
    expect(within(region).queryByText('Set targets')).toBeNull()
    expect(within(region).getByText('Link work')).toBeInTheDocument()
    expect(within(region).queryByRole('button', { name: 'Add key result' })).toBeNull()
    expect(within(region).queryByText('Add tasks')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add task' })).toBeNull()
    expect(document.body.textContent).not.toMatch(/0 \/ 0|No linked|No linked tasks/)
    // One primary on the screen: Add key result. Setup remains available as a secondary action.
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1)
    expect(within(region).getByRole('button', { name: 'Link Project or Process' })).toHaveClass('btn-outline')
  })

  it('withdrawing the Link picker puts focus back on the button that opened it', async () => {
    const user = userEvent.setup()
    vi.mocked(listWorkLinesAll).mockResolvedValue([
      { id: 'wl-a', name: 'Weekday promo post', type: 'process', objective_id: null, archived_at: null, business_unit_id: 'bu-1' },
    ] as never)
    renderRecord()
    const region = await screen.findByRole('region', { name: 'Get this Objective started' })
    const opener = within(region).getByRole('button', { name: 'Link Project or Process' })
    await user.click(opener)
    await screen.findByRole('listbox')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Link Project or Process' })).toBeNull())
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Get this Objective started' })).getByRole('button', { name: 'Link Project or Process' })).toHaveFocus())
  })

  it('cancelling the blank key-result row returns focus to the section Add action', async () => {
    const user = userEvent.setup()
    renderRecord()
    const keyResults = await screen.findByRole('region', { name: 'Key results' })
    await user.click(await within(keyResults).findByRole('button', { name: 'Add key result' }))
    await screen.findByRole('textbox', { name: 'Key result' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Key results' })).getByRole('button', { name: 'Add key result' })).toHaveFocus())
  })

  it('the Key results Add action opens a blank row ready for the name', async () => {
    const user = userEvent.setup()
    renderRecord()
    const keyResults = await screen.findByRole('region', { name: 'Key results' })
    await user.click(await within(keyResults).findByRole('button', { name: 'Add key result' }))
    expect(await screen.findByRole('textbox', { name: 'Key result' })).toHaveFocus()
  })

  it('Link Project or Process opens a type-to-find picker of Projects and Processes the viewer manages', async () => {
    const user = userEvent.setup()
    vi.mocked(listWorkLinesAll).mockResolvedValue([
      { id: 'wl-a', name: 'Weekday promo post', type: 'process', objective_id: null, archived_at: null, business_unit_id: 'bu-1' },
      { id: 'wl-b', name: 'Archived thing', type: 'project', objective_id: null, archived_at: '2026-01-01', business_unit_id: 'bu-1' },
      { id: 'wl-c', name: 'Lunch set menu', type: 'project', objective_id: 'obj-2', archived_at: null, business_unit_id: 'bu-1' },
    ] as never)
    renderRecord()
    const region = await screen.findByRole('region', { name: 'Get this Objective started' })
    await user.click(within(region).getByRole('button', { name: 'Link Project or Process' }))
    const list = await screen.findByRole('listbox')
    const search = screen.getByRole('combobox', { name: 'Filter Link Project or Process' })
    expect(search).toHaveAttribute('placeholder', 'Filter Link Project or Process')
    const names = within(list).getAllByRole('option').map((o) => o.textContent)
    expect(names).toEqual(['Weekday promo post', 'Lunch set menu (linked to Improve margin)'])
  })

  it('groups the picker under Not linked yet and Linked to another Objective headings', async () => {
    const user = userEvent.setup()
    vi.mocked(listWorkLinesAll).mockResolvedValue([
      { id: 'wl-c', name: 'Lunch set menu', type: 'project', objective_id: 'obj-2', archived_at: null, business_unit_id: 'bu-1' },
      { id: 'wl-a', name: 'Weekday promo post', type: 'process', objective_id: null, archived_at: null, business_unit_id: 'bu-1' },
    ] as never)
    renderRecord()
    const region = await screen.findByRole('region', { name: 'Get this Objective started' })
    await user.click(within(region).getByRole('button', { name: 'Link Project or Process' }))
    const free = await screen.findByRole('group', { name: 'Not linked yet' })
    const other = screen.getByRole('group', { name: 'Linked to another Objective' })
    expect(within(free).getAllByRole('option').map((o) => o.textContent)).toEqual(['Weekday promo post'])
    expect(within(other).getAllByRole('option').map((o) => o.textContent)).toEqual(['Lunch set menu (linked to Improve margin)'])
  })

  describe('an optimistic link', () => {
    const linkedObjective = (contributions?: CatalogRelationGroup[]) => {
      vi.mocked(listKeyResults).mockResolvedValue([kr()])
      data = objectiveData({ linked: [{ id: 'wl-1', name: 'Menu launch', type: 'project' }], tasks: [task('t1', 'Print menus', 'Open')], contributions })
      vi.mocked(listWorkLinesAll).mockResolvedValue([
        { id: 'wl-a', name: 'Weekday promo post', type: 'process', objective_id: null, archived_at: null, business_unit_id: 'bu-1', responsible_person_id: 'p-maya' },
      ] as never)
    }

    async function pickPromo(user: ReturnType<typeof userEvent.setup>) {
      const work = await screen.findByRole('region', { name: 'Projects & Processes' })
      await user.click(within(work).getByRole('button', { name: 'Link Project or Process' }))
      await user.click(await screen.findByRole('option', { name: 'Weekday promo post' }))
      return work
    }

    it('shows the linked row at once, before the write or the re-read has finished', async () => {
      const user = userEvent.setup()
      linkedObjective()
      vi.mocked(updateWorkLine).mockReturnValue(new Promise(() => {}))
      renderRecord()
      const work = await pickPromo(user)
      expect(within(work).getByRole('link', { name: 'Weekday promo post' })).toBeInTheDocument()
      expect(within(work).getByText('2')).toBeInTheDocument()
    })

    it('rolls the row back and offers a retry when the write fails', async () => {
      const user = userEvent.setup()
      linkedObjective()
      let deny: (reason: Error) => void = () => {}
      vi.mocked(updateWorkLine).mockReturnValueOnce(new Promise<void>((_, reject) => { deny = reject }))
      renderRecord()
      const work = await pickPromo(user)
      expect(within(work).getByRole('link', { name: 'Weekday promo post' })).toBeInTheDocument()
      deny(new Error('denied'))
      expect(await screen.findByText("Couldn't link", { exact: false })).toBeInTheDocument()
      expect(within(work).queryByRole('link', { name: 'Weekday promo post' })).toBeNull()
      expect(within(work).getByRole('link', { name: 'Menu launch' })).toBeInTheDocument()
    })

    it('a failed link of work already shown through this Objective\'s Tasks puts that row back as it was', async () => {
      const user = userEvent.setup()
      linkedObjective([{
        id: 'wl-a', name: 'Weekday promo post', relationship: 'contribution', entity: 'work-line',
        objectiveId: 'obj-9', workLineId: 'wl-a', taskCount: 1, done: 0, total: 1,
        tasks: [task('t9', 'Hand out flyers', 'Open')],
      }])
      let deny: (reason: Error) => void = () => {}
      vi.mocked(updateWorkLine).mockReturnValueOnce(new Promise<void>((_, reject) => { deny = reject }))
      renderRecord()
      const work = await pickPromo(user)
      expect(within(work).queryByText('via tasks')).toBeNull()
      deny(new Error('denied'))
      expect(await screen.findByText("Couldn't link", { exact: false })).toBeInTheDocument()
      expect(within(work).getByRole('link', { name: 'Weekday promo post' })).toBeInTheDocument()
      expect(within(work).getByText('via tasks')).toBeInTheDocument()
    })

    it('keeps the row when the write succeeds but the re-read fails (the link is real)', async () => {
      const user = userEvent.setup()
      linkedObjective()
      renderRecord()
      await screen.findByRole('region', { name: 'Projects & Processes' })
      vi.mocked(loadCatalogRecordData).mockRejectedValue(new Error('offline'))
      const work = await pickPromo(user)
      await waitFor(() => expect(updateWorkLine).toHaveBeenCalledWith('wl-a', { objective_id: 'obj-1' }))
      expect(within(work).getByRole('link', { name: 'Weekday promo post' })).toBeInTheDocument()
      expect(screen.queryByText("Couldn't link", { exact: false })).toBeNull()
    })
  })

  it('linking an unlinked Project writes work_lines.objective_id and reloads the record', async () => {
    const user = userEvent.setup()
    vi.mocked(listWorkLinesAll).mockResolvedValue([
      { id: 'wl-a', name: 'Weekday promo post', type: 'process', objective_id: null, archived_at: null, business_unit_id: 'bu-1' },
    ] as never)
    renderRecord()
    const region = await screen.findByRole('region', { name: 'Get this Objective started' })
    await user.click(within(region).getByRole('button', { name: 'Link Project or Process' }))
    await user.click(await screen.findByRole('option', { name: 'Weekday promo post' }))
    await waitFor(() => expect(updateWorkLine).toHaveBeenCalledWith('wl-a', { objective_id: 'obj-1' }))
    await waitFor(() => expect(vi.mocked(loadCatalogRecordData).mock.calls.length).toBeGreaterThan(1))
  })

  it('moving a Project from another Objective asks first, and Cancel leaves it where it is', async () => {
    const user = userEvent.setup()
    vi.mocked(listWorkLinesAll).mockResolvedValue([
      { id: 'wl-c', name: 'Lunch set menu', type: 'project', objective_id: 'obj-2', archived_at: null, business_unit_id: 'bu-1' },
    ] as never)
    renderRecord()
    const region = await screen.findByRole('region', { name: 'Get this Objective started' })
    await user.click(within(region).getByRole('button', { name: 'Link Project or Process' }))
    await user.click(await screen.findByRole('option', { name: /Lunch set menu/ }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Move Lunch set menu to this Objective?')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(updateWorkLine).not.toHaveBeenCalled()
  })

  it('only candidates the viewer may manage are offered, and nobody who manages none sees the action', async () => {
    const user = userEvent.setup()
    vi.mocked(getWorkWriteScopes).mockResolvedValue(scopes({ objective_org: true, objective_content_org: true, workline_bu_ids: ['bu-2'] }))
    vi.mocked(listWorkLinesAll).mockResolvedValue([
      { id: 'wl-a', name: 'Own unit one', type: 'project', objective_id: null, archived_at: null, business_unit_id: 'bu-2' },
      { id: 'wl-d', name: 'Other unit', type: 'project', objective_id: null, archived_at: null, business_unit_id: 'bu-1' },
    ] as never)
    renderRecord()
    const region = await screen.findByRole('region', { name: 'Get this Objective started' })
    await user.click(within(region).getByRole('button', { name: 'Link Project or Process' }))
    const list = await screen.findByRole('listbox')
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['Own unit one'])
  })

  it('with targets set and nothing linked, Get started shows Link work only', async () => {
    vi.mocked(listKeyResults).mockResolvedValue([kr()])
    renderRecord()
    const region = await screen.findByRole('region', { name: 'Get this Objective started' })
    expect(within(region).queryByText('Set targets')).toBeNull()
    expect(within(region).getByText('Link work')).toBeInTheDocument()
    expect(within(region).getByRole('button', { name: 'Link Project or Process' })).toHaveClass('btn-primary')
  })

  it('with work linked and no tasks, Get started shows Add tasks, and its button opens the task create for the one linked Project', async () => {
    const user = userEvent.setup()
    vi.mocked(listKeyResults).mockResolvedValue([kr()])
    data = objectiveData({ linked: [{ id: 'wl-1', name: 'Menu launch', type: 'project' }] })
    renderRecord()
    const region = await screen.findByRole('region', { name: 'Get this Objective started' })
    expect(within(region).queryByText('Set targets')).toBeNull()
    expect(within(region).queryByText('Link work')).toBeNull()
    await user.click(within(region).getByRole('button', { name: 'Add task' }))
    expect(onCreateTask).toHaveBeenCalledWith('wl-1')
  })

  it('Add task chooses among the Objective\'s linked work when there are several', async () => {
    const user = userEvent.setup()
    vi.mocked(listKeyResults).mockResolvedValue([kr()])
    data = objectiveData({ linked: [{ id: 'wl-1', name: 'Menu launch', type: 'project' }, { id: 'wl-2', name: 'Promo post', type: 'process' }] })
    renderRecord()
    const region = await screen.findByRole('region', { name: 'Get this Objective started' })
    await user.click(within(region).getByRole('button', { name: 'Add task' }))
    expect(onCreateTask).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('option', { name: 'Promo post' }))
    expect(onCreateTask).toHaveBeenCalledWith('wl-2')
  })

  it('a fully set-up Objective has no setup region and one primary, Add task, in the header', async () => {
    vi.mocked(listKeyResults).mockResolvedValue([kr()])
    data = objectiveData({
      linked: [{ id: 'wl-1', name: 'Menu launch', type: 'project' }],
      tasks: [task('t1', 'Print menus', 'Open')],
    })
    renderRecord()
    await screen.findByRole('heading', { level: 1, name: 'Grow revenue' })
    await screen.findByRole('region', { name: 'Key results' })
    await waitFor(() => expect(document.querySelectorAll('.btn-primary')).toHaveLength(1))
    expect(setup()).toBeNull()
    expect(document.querySelector('.btn-primary')).toHaveTextContent('Add task')
  })

  it('a Project with no tasks shows Add the first task; once it has tasks the header carries Add task', async () => {
    const user = userEvent.setup()
    data = workLineData('project')
    const { unmount } = renderRecord('work-line')
    const region = await screen.findByRole('region', { name: 'Get this Project started' })
    await user.click(within(region).getByRole('button', { name: 'Add the first task' }))
    expect(onCreateTask).toHaveBeenCalledWith('wl-1')
    unmount()
    data = workLineData('project', { tasks: [task('t1', 'Print menus', 'Open')] })
    renderRecord('work-line')
    await screen.findByRole('heading', { level: 1, name: 'Menu launch' })
    expect(screen.queryByRole('region', { name: /started$/ })).toBeNull()
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1)
    expect(document.querySelector('.btn-primary')).toHaveTextContent('Add task')
    // The header owns this action once Tasks exist; the section does not repeat it.
    expect(within(screen.getByRole('region', { name: 'Tasks' })).queryByRole('button', { name: 'Add task' })).toBeNull()
  })

  it('a Process with many steps keeps adding one click away, inside the folded list', async () => {
    const user = userEvent.setup()
    data = workLineData('process', { steps: 7 })
    renderRecord('work-line')
    const toggle = await screen.findByRole('button', { name: /^Steps/ })
    await user.click(toggle)
    await user.click(await screen.findByRole('button', { name: 'Add step' }))
    await user.type(await screen.findByRole('textbox', { name: 'Step name' }), 'Lock up')
    await user.click(screen.getByRole('combobox', { name: 'Who does it' }))
    await user.click(await screen.findByRole('option', { name: 'Maya Marketing' }))
    await user.click(screen.getByRole('button', { name: 'Save step' }))
    await waitFor(() => expect(createProcessStep).toHaveBeenCalledWith({ workLineId: 'wl-1', title: 'Lock up', picPersonId: 'p-maya', position: 7 }))
    // The folded list stays open and the Add control is back, with focus on it.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add step' })).toHaveFocus())
  })

  it('cancelling the step form in a long Process puts focus back on the Add control', async () => {
    const user = userEvent.setup()
    data = workLineData('process', { steps: 7 })
    renderRecord('work-line')
    await user.click(await screen.findByRole('button', { name: /^Steps/ }))
    await user.click(await screen.findByRole('button', { name: 'Add step' }))
    await screen.findByRole('textbox', { name: 'Step name' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add step' })).toHaveFocus())
    expect(screen.queryByRole('textbox', { name: 'Step name' })).toBeNull()
  })

  it('the step form says so when the people list fails, and Try again reloads it', async () => {
    const user = userEvent.setup()
    data = workLineData('process', { steps: 0 })
    vi.mocked(getPeople).mockRejectedValueOnce(new Error('down'))
    renderRecord('work-line')
    const region = await screen.findByRole('region', { name: 'Get this Process started' })
    await user.click(within(region).getByRole('button', { name: 'Add first step' }))
    const form = await screen.findByRole('form', { name: 'Add step' })
    expect(await within(form).findByText("Couldn't load the people list.")).toBeInTheDocument()
    await user.click(within(form).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(within(form).queryByText("Couldn't load the people list.")).toBeNull())
  })

  it('does not show an empty occurrence section while an incomplete Process is loading', async () => {
    data = workLineData('process', { steps: 0 })
    occurrences([], { state: 'loading' })
    renderRecord('work-line')
    await screen.findByRole('region', { name: 'Get this Process started' })
    expect(screen.queryByRole('region', { name: 'Current and next action' })).toBeNull()
  })

  it('a Process with no steps shows Add first step; saving a step writes it for the chosen person and clears the row', async () => {
    const user = userEvent.setup()
    data = workLineData('process', { steps: 0 })
    renderRecord('work-line')
    const region = await screen.findByRole('region', { name: 'Get this Process started' })
    expect(screen.queryByRole('region', { name: 'Current and next action' })).toBeNull()
    await user.click(within(region).getByRole('button', { name: 'Add first step' }))
    await user.type(await screen.findByRole('textbox', { name: 'Step name' }), 'Open the till')
    await user.click(screen.getByRole('combobox', { name: 'Who does it' }))
    await user.click(await screen.findByRole('option', { name: 'Maya Marketing' }))
    await user.click(screen.getByRole('button', { name: 'Save step' }))
    await waitFor(() => expect(createProcessStep).toHaveBeenCalledWith({ workLineId: 'wl-1', title: 'Open the till', picPersonId: 'p-maya', position: 0 }))
  })

  it('a rejected Step save restores its enabled action with the chosen draft ready to retry', async () => {
    const restore = installDisabledBlur()
    try {
      const user = userEvent.setup()
      let rejectStep: (reason: Error) => void = () => {}
      const failedStep = new Promise<void>((_resolve, reject) => { rejectStep = reject })
      vi.mocked(createProcessStep)
        .mockReturnValueOnce(failedStep)
        .mockResolvedValueOnce(undefined)
      data = workLineData('process', { steps: 0 })
      renderRecord('work-line')
      const setupRegion = await screen.findByRole('region', { name: 'Get this Process started' })
      await user.click(within(setupRegion).getByRole('button', { name: 'Add first step' }))
      const form = await screen.findByRole('form', { name: 'Add step' })
      const title = await within(form).findByRole('textbox', { name: 'Step name' })
      await user.type(title, 'Open the till')
      const pic = within(form).getByRole('combobox', { name: 'Who does it' })
      await user.click(pic)
      await user.click(await screen.findByRole('option', { name: 'Maya Marketing' }))
      const save = within(form).getByRole('button', { name: 'Save step' })
      await user.click(save)
      expect(await within(form).findByRole('button', { name: /saving/i })).toBeDisabled()

      await act(async () => {
        rejectStep(new Error('offline'))
        await failedStep.catch(() => undefined)
      })
      expect(await within(form).findByRole('button', { name: 'Retry' })).toBeInTheDocument()
      await waitFor(() => expect(save).toHaveFocus())
      expect(title).toHaveValue('Open the till')
      expect(pic).toHaveTextContent('Maya Marketing')

      await user.click(within(form).getByRole('button', { name: 'Retry' }))
      await waitFor(() => expect(createProcessStep).toHaveBeenCalledTimes(2))
      const args = { workLineId: 'wl-1', title: 'Open the till', picPersonId: 'p-maya', position: 0 }
      expect(createProcessStep).toHaveBeenNthCalledWith(1, args)
      expect(createProcessStep).toHaveBeenNthCalledWith(2, args)
      await waitFor(() => expect(screen.queryByRole('form', { name: 'Add step' })).toBeNull())
    } finally { restore() }
  })
})

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

it('without a host callback, Add task goes to task create for that Project in the Tasks route', async () => {
  const user = userEvent.setup()
  data = workLineData('project')
  render(
    <AuthContext.Provider value={auth()}>
      <I18nProvider>
        <MemoryRouter>
          <CatalogRecordDocument kind="work-line" id="wl-1" mode="page" />
          <LocationProbe />
        </MemoryRouter>
      </I18nProvider>
    </AuthContext.Provider>,
  )
  const region = await screen.findByRole('region', { name: 'Get this Project started' })
  await user.click(within(region).getByRole('button', { name: 'Add the first task' }))
  expect(screen.getByTestId('location')).toHaveTextContent('/work/tasks?create=1&work_line=wl-1')
})

describe('Open full page', () => {
  const widen = (wide: boolean) => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: wide && query.includes('768'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    })) as never
  }
  const renderPanel = (onOpenPage: () => void) => render(
    <AuthContext.Provider value={auth()}>
      <I18nProvider>
        <MemoryRouter>
          <CatalogRecordDocument kind="objective" id="obj-1" mode="panel" onOpenPage={onOpenPage} />
        </MemoryRouter>
      </I18nProvider>
    </AuthContext.Provider>,
  )

  it('a phone panel offers it in the menu, because the panel bar is gone there', async () => {
    const user = userEvent.setup()
    const onOpenPage = vi.fn()
    widen(false)
    renderPanel(onOpenPage)
    await screen.findByRole('heading', { level: 2, name: 'Grow revenue' })
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Open full page' }))
    expect(onOpenPage).toHaveBeenCalledTimes(1)
  })

  it('a wide panel leaves it to its own bar', async () => {
    const user = userEvent.setup()
    widen(true)
    renderPanel(vi.fn())
    await screen.findByRole('heading', { level: 2, name: 'Grow revenue' })
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.queryByRole('menuitem', { name: 'Open full page' })).toBeNull()
  })
})

describe('role-correct affordances', () => {
  it('does not call a member view only when Start occurrence is available', async () => {
    vi.mocked(getWorkWriteScopes).mockResolvedValue(MEMBER)
    data = workLineData('process', { steps: 2 })
    occurrences([dueRun('Café Operations', 'team-1')])
    renderRecord('work-line')

    const start = await screen.findByRole('button', { name: 'Start occurrence' })
    expect(start).toHaveClass('btn-primary')
    expect(screen.getByRole('note')).toHaveTextContent('Dewi Director is Accountable for this Process. Ask a work manager or admin to edit it. You can start an occurrence.')
    expect(screen.getByRole('note')).not.toHaveTextContent('View only')
  })

  it('shows an unset Business Unit as a fact to a viewer who cannot edit it', async () => {
    vi.mocked(getWorkWriteScopes).mockResolvedValue(MEMBER)
    data = workLineData('project')
    data.row = { ...data.row, businessUnitId: null }
    renderRecord('work-line')

    await screen.findByRole('heading', { level: 1, name: 'Menu launch' })
    const field = document.querySelector('[data-field-key="businessUnit"]')!
    expect(field).toHaveAttribute('data-editable', 'false')
    expect(field).toHaveTextContent('Not set')
    expect(field).not.toHaveTextContent('Set Business Unit')
  })

  it('keeps the Set Business Unit prompt for an authorized editor', async () => {
    data = workLineData('project')
    data.row = { ...data.row, businessUnitId: null }
    renderRecord('work-line')

    await screen.findByRole('heading', { level: 1, name: 'Menu launch' })
    const editor = await screen.findByRole('button', { name: 'Edit Business Unit' })
    expect(editor).toHaveTextContent('Set Business Unit')
  })

  it('a member sees no setup, no structure edits, no menu and one line naming who sets targets', async () => {
    vi.mocked(getWorkWriteScopes).mockResolvedValue(MEMBER)
    vi.mocked(listKeyResults).mockResolvedValue([kr()])
    data = objectiveData({ linked: [{ id: 'wl-1', name: 'Menu launch', type: 'project' }], tasks: [task('t1', 'Print menus', 'Open')] })
    renderRecord()
    await screen.findByRole('heading', { level: 1, name: 'Grow revenue' })
    await screen.findByRole('region', { name: 'Key results' })
    expect(setup()).toBeNull()
    expect(screen.getByRole('note')).toHaveTextContent('Dewi Director (Accountable) sets targets and links work. You can add tasks.')
    expect(screen.getByRole('note')).not.toHaveTextContent('View only')
    expect(screen.queryAllByRole('button', { name: /^Edit / })).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Link Project or Process|Add key result/ })).toBeNull()
  })

  it.each([
    ['ops lead', OPS_LEAD],
    ['BU head', BU_HEAD],
  ])('%s updates current values and the write-up, never targets or structure', async (_name, viewer) => {
    vi.mocked(getWorkWriteScopes).mockResolvedValue(viewer)
    vi.mocked(listKeyResults).mockResolvedValue([kr()])
    vi.mocked(readWriteUp).mockResolvedValue({ writeUp: [{ type: 'paragraph', content: [{ type: 'text', text: 'Why we do this', styles: {} }] }], updatedAt: 'x' })
    data = objectiveData({ linked: [{ id: 'wl-1', name: 'Menu launch', type: 'project' }], tasks: [task('t1', 'Print menus', 'Open')] })
    renderRecord()
    const krs = await screen.findByRole('region', { name: 'Key results' })
    expect(await within(krs).findByRole('button', { name: 'Edit current value: Weekday average ticket' })).toBeInTheDocument()
    expect(within(krs).queryByRole('button', { name: /^Edit key result/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add key result' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Edit Accountable/ })).toBeNull()
    expect(screen.getByRole('note')).toHaveTextContent('Dewi Director (Accountable) sets targets and links work. You can update current values and the write-up.')
    expect(await screen.findByRole('button', { name: 'Edit write-up' })).toBeInTheDocument()
  })

  it('an admin may rename, archive and edit every structural fact', async () => {
    renderRecord()
    await screen.findByRole('heading', { level: 1, name: 'Grow revenue' })
    for (const label of ['Edit Name', 'Edit Accountable', 'Edit Period', 'Edit Quarter', 'Edit Business Unit']) {
      expect(await screen.findByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.queryByRole('note')).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy link' })).toBeInTheDocument()
  })
})

describe('the write-up stays lazy', () => {
  it('imports the editor only when the write-up opens', async () => {
    const user = userEvent.setup()
    vi.mocked(listKeyResults).mockResolvedValue([kr()])
    data = objectiveData({ linked: [{ id: 'wl-1', name: 'Menu launch', type: 'project' }], tasks: [task('t1', 'Print menus', 'Open')] })
    renderRecord()
    await screen.findByRole('region', { name: 'Write-up' })
    expect(editorModule.loads).toBe(0)
    expect(screen.queryByText('write-up editor')).toBeNull()
    await user.click(await screen.findByRole('button', { name: 'Write why this Objective matters' }))
    expect(await screen.findByText('write-up editor')).toBeInTheDocument()
    expect(editorModule.loads).toBe(1)
  })

  it('reads as a short excerpt with a Read button for a member, and opens the editor module only on demand', async () => {
    const user = userEvent.setup()
    vi.mocked(getWorkWriteScopes).mockResolvedValue(MEMBER)
    vi.mocked(readWriteUp).mockResolvedValue({ writeUp: [{ type: 'paragraph', content: [{ type: 'text', text: 'Weekday lunch is our slow spot.', styles: {} }] }], updatedAt: 'x' })
    renderRecord()
    const region = await screen.findByRole('region', { name: 'Write-up' })
    expect(await within(region).findByText('Weekday lunch is our slow spot.')).toBeInTheDocument()
    expect(editorModule.loads).toBe(0)
    await user.click(within(region).getByRole('button', { name: 'Read write-up' }))
    expect(await screen.findByText('write-up editor')).toBeInTheDocument()
  })

  it('is omitted for a member when the Objective has no write-up', async () => {
    vi.mocked(getWorkWriteScopes).mockResolvedValue(MEMBER)
    renderRecord()
    await screen.findByRole('heading', { level: 1, name: 'Grow revenue' })
    await waitFor(() => expect(readWriteUp).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: 'Write-up' })).toBeNull()
  })
})

describe('sections read like a document', () => {
  const populated = () => {
    vi.mocked(listKeyResults).mockResolvedValue([kr()])
    data = objectiveData({
      linked: [{ id: 'wl-1', name: 'Menu launch', type: 'project' }],
      tasks: [
        task('t1', 'Print menus', 'Done'),
        task('t2', 'Brief the floor', 'Blocked', { dueDate: '2026-10-03' }),
      ],
    })
  }

  it('keeps the Objective task total in Tasks, not repeated beside Projects & Processes', async () => {
    populated()
    // One task sits on the Objective itself, so the aggregate is 1 of 3 although linked work carries 2.
    data.context = { ...data.context, progressById: new Map([['obj-1', { done: 1, total: 3 }]]) }
    renderRecord()
    const work = await screen.findByRole('region', { name: 'Projects & Processes' })
    expect(work.querySelector('.rp-section__count')).toHaveTextContent('1')
    expect(work).not.toHaveTextContent('1 / 3 Tasks done')
    expect(await screen.findByRole('region', { name: 'Tasks' })).toHaveTextContent('1 / 3 Tasks done')
  })

  it.each([
    ['en', 'page'], ['en', 'panel'], ['id', 'page'], ['id', 'panel'],
  ] as const)('names Tasks in direct and contributed work progress in %s on the %s host', async (locale, mode) => {
    populated()
    const contribution = {
      id: 'wl-2', name: 'Promotion routine', relationship: 'contribution' as const, entity: 'work-line' as const,
      workLineId: 'wl-2', taskCount: 1, done: 0, total: 1, tasks: [task('t3', 'Share promotion', 'Open')],
    }
    const relations = data.context.relationsById.get('obj-1')!
    data.context = {
      ...data.context,
      relationsById: new Map([['obj-1', { ...relations, groups: [...relations.groups, contribution] }]]),
      progressById: new Map([['obj-1', { done: 1, total: 3 }]]),
    }
    renderRecord('objective', mode, undefined, locale)
    const work = await screen.findByRole('region', { name: locale === 'id' ? 'Proyek & Proses' : 'Projects & Processes' })
    const unit = locale === 'id' ? 'Tugas selesai' : 'Tasks done'
    // The header counts linked records; each row counts that work's Tasks; the Task section owns the aggregate.
    expect(work.querySelector('.rp-section__count')).toHaveTextContent(/^2$/)
    const direct = within(work).getByRole('link', { name: 'Menu launch' }).closest('li')!
    const contributed = within(work).getByRole('link', { name: 'Promotion routine' }).closest('li')!
    expect(direct).toHaveTextContent(`1 / 2 ${unit}`)
    expect(contributed).toHaveTextContent(`0 / 1 ${unit}`)
    expect(work).not.toHaveTextContent(`1 / 3 ${unit}`)
    expect(await screen.findByRole('region', { name: locale === 'id' ? 'Tugas' : 'Tasks' })).toHaveTextContent(`1 / 3 ${unit}`)
  })

  it('a member with nothing to add is told it is view only', async () => {
    vi.mocked(getWorkWriteScopes).mockResolvedValue(MEMBER)
    data = objectiveData()
    renderRecord()
    await screen.findByRole('heading', { level: 1, name: 'Grow revenue' })
    const keyResults = await screen.findByRole('region', { name: 'Key results' })
    await within(keyResults).findByText('No key results yet.')
    expect(keyResults).toHaveTextContent('No key results yet.')
    expect(await screen.findByRole('note')).toHaveTextContent('View only · Dewi Director (Accountable) sets targets and links work.')
  })

  it('a Process step prints only what it has: no grid of Not set', async () => {
    data = workLineData('process', { steps: 2 })
    renderRecord('work-line')
    const steps = await screen.findByRole('region', { name: 'Steps' })
    expect(screen.getByRole('region', { name: 'Current and next action' })).toBeInTheDocument()
    expect(within(steps).queryByText('Not set')).toBeNull()
    expect(within(steps).queryByText('Supervisor')).toBeNull()
    expect(within(steps).getAllByText('PIC')).toHaveLength(2)
  })

  it('lists linked work with its type and progress, and tasks with status, PIC and due', async () => {
    populated()
    renderRecord()
    const work = await screen.findByRole('region', { name: 'Projects & Processes' })
    expect(within(work).getByRole('link', { name: 'Menu launch' })).toHaveAttribute('href', '/work/projects/wl-1')
    expect(within(work).getByText('Project')).toBeInTheDocument()
    const tasks = await screen.findByRole('region', { name: 'Tasks' })
    const row = within(tasks).getByRole('link', { name: 'Brief the floor' }).closest('li')!
    expect(row).toHaveTextContent('Blocked')
    expect(row).toHaveTextContent('Maya')
    expect(row).toHaveTextContent('3 Oct')
    expect(within(tasks).getByRole('link', { name: 'Print menus' })).toHaveAttribute('href', '/work/tasks/t1')
  })

  it('shows five tasks and a Show all control for the rest', async () => {
    const user = userEvent.setup()
    vi.mocked(listKeyResults).mockResolvedValue([kr()])
    data = objectiveData({
      linked: [{ id: 'wl-1', name: 'Menu launch', type: 'project' }],
      tasks: Array.from({ length: 7 }, (_, i) => task(`t${i}`, `Task number ${i}`, 'Open')),
    })
    renderRecord()
    const tasks = await screen.findByRole('region', { name: 'Tasks' })
    expect(within(tasks).getAllByRole('link')).toHaveLength(5)
    await user.click(within(tasks).getByRole('button', { name: 'Show all 7' }))
    expect(within(tasks).getAllByRole('link')).toHaveLength(7)
  })

  async function unlinkViaRowMenu(user: ReturnType<typeof userEvent.setup>, work: HTMLElement) {
    await user.click(within(work).getByRole('button', { name: 'Actions for Menu launch' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Unlink' }))
  }

  it('keeps Unlink out of the row: the row offers one overflow trigger, and the menu opens from the keyboard', async () => {
    const user = userEvent.setup()
    populated()
    renderRecord()
    const work = await screen.findByRole('region', { name: 'Projects & Processes' })
    expect(within(work).queryByRole('button', { name: /^Unlink/ })).toBeNull()
    const trigger = within(work).getByRole('button', { name: 'Actions for Menu launch' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    trigger.focus()
    await user.keyboard('{Enter}')
    const item = await screen.findByRole('menuitem', { name: 'Unlink' })
    await waitFor(() => expect(item).toHaveFocus())
    await user.keyboard('{Enter}')
    await waitFor(() => expect(updateWorkLine).toHaveBeenCalledWith('wl-1', { objective_id: null }))
  })

  it('unlinks a directly linked Project through its row menu', async () => {
    const user = userEvent.setup()
    populated()
    renderRecord()
    const work = await screen.findByRole('region', { name: 'Projects & Processes' })
    await unlinkViaRowMenu(user, work)
    await waitFor(() => expect(updateWorkLine).toHaveBeenCalledWith('wl-1', { objective_id: null }))
  })

  it('a failed unlink reports the failure with a retry, and announces nothing as done', async () => {
    const user = userEvent.setup()
    populated()
    vi.mocked(updateWorkLine).mockRejectedValueOnce(new Error('denied'))
    renderRecord()
    const work = await screen.findByRole('region', { name: 'Projects & Processes' })
    await unlinkViaRowMenu(user, work)
    expect(await screen.findByText("Couldn't unlink", { exact: false })).toBeInTheDocument()
    expect(screen.queryByText('Unlinked Menu launch.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('after Unlink, keyboard focus lands on the notice\'s Undo, not on the page', async () => {
    const user = userEvent.setup()
    populated()
    renderRecord()
    const work = await screen.findByRole('region', { name: 'Projects & Processes' })
    await unlinkViaRowMenu(user, work)
    const undo = await screen.findByRole('button', { name: 'Undo' })
    await waitFor(() => expect(undo).toHaveFocus())
  })

  it('Undo after an unlink links the Project again', async () => {
    const user = userEvent.setup()
    populated()
    renderRecord()
    const work = await screen.findByRole('region', { name: 'Projects & Processes' })
    await unlinkViaRowMenu(user, work)
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(updateWorkLine).toHaveBeenLastCalledWith('wl-1', { objective_id: 'obj-1' }))
  })

  it('fetches and renders the History count on a wide page', async () => {
    setWideRecordPage()
    vi.mocked(countRecordHistory).mockResolvedValue(7)
    renderRecord()

    const toggle = await screen.findByRole('button', { name: /History/ })
    await waitFor(() => expect(countRecordHistory).toHaveBeenCalledWith('objectives', 'obj-1'))
    await waitFor(() => expect(toggle).toHaveTextContent('History7'))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('folds History closed and reads it only when opened', async () => {
    const user = userEvent.setup()
    populated()
    renderRecord()
    const toggle = await screen.findByRole('button', { name: 'History' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(loadRecordHistory).not.toHaveBeenCalled()
    await user.click(toggle)
    await waitFor(() => expect(loadRecordHistory).toHaveBeenCalledWith('objectives', 'obj-1'))
  })
})

describe('archive is reversible', () => {
  it('archives from the menu with an Undo, and an archived record shows the pill and no primary', async () => {
    const user = userEvent.setup()
    vi.mocked(listKeyResults).mockResolvedValue([kr()])
    data = objectiveData({ linked: [{ id: 'wl-1', name: 'Menu launch', type: 'project' }], tasks: [task('t1', 'Print menus', 'Open')] })
    renderRecord()
    await screen.findByRole('heading', { level: 1, name: 'Grow revenue' })
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }))
    expect(await screen.findByText('Grow revenue archived.')).toBeInTheDocument()
    expect(setObjectiveArchived).toHaveBeenCalledWith('obj-1', true)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(facts()).toHaveTextContent('Archived')
    expect(screen.queryByRole('button', { name: 'Add task' })).toBeNull()
  })
})

describe('returning from the task create frame', () => {
  it('says Task added once, and clears the flag so a later visit does not say it again', async () => {
    const flag = { current: true }
    data = workLineData('project', { tasks: [task('t1', 'Print menus', 'Open')] })
    renderRecord('work-line', 'panel', flag)
    expect(await screen.findByText('Task added.')).toBeInTheDocument()
    expect(flag.current).toBe(false)
  })

  it('says nothing when no task was added', async () => {
    data = workLineData('project', { tasks: [task('t1', 'Print menus', 'Open')] })
    renderRecord('work-line', 'panel', { current: false })
    await screen.findByRole('heading', { level: 2, name: 'Menu launch' })
    expect(screen.queryByText('Task added.')).toBeNull()
  })
})

describe('a Process\'s header primary is Start occurrence', () => {
  it('shows one primary and starts the one ready run without a duplicate body button', async () => {
    const user = userEvent.setup()
    data = workLineData('process', { steps: 2 })
    occurrences([dueRun('Café Operations', 'team-1')])
    renderRecord('work-line')
    await screen.findByRole('heading', { level: 1, name: 'Café opening' })
    const primary = await screen.findByRole('button', { name: 'Start occurrence' })
    // It is the primary variant, and the ONE primary action on the record — demotion or a second
    // primary would fail here, not just the role/name lookup.
    expect(primary).toHaveClass('btn-primary')
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1)
    const header = (await screen.findByRole('heading', { level: 1, name: 'Café opening' })).closest('header') as HTMLElement
    expect(within(header).getByRole('button', { name: 'Start occurrence' })).toBe(primary)
    expect(screen.queryByRole('button', { name: 'Start · Café Operations' })).toBeNull()
    await user.click(primary)
    expect(startRun).toHaveBeenCalledWith(dueRun('Café Operations', 'team-1'))
  })

  it('with several Teams ready, the primary opens a chooser and starts the selected Team', async () => {
    const user = userEvent.setup()
    const marketingRun = dueRun('Marketing', 'team-2')
    data = workLineData('process', { steps: 2 })
    occurrences([dueRun('Café Operations', 'team-1'), marketingRun])
    renderRecord('work-line')
    await user.click(await screen.findByRole('button', { name: 'Start occurrence' }))
    const chooser = await screen.findByRole('combobox', { name: 'Choose a Team' })
    expect(chooser).toHaveAttribute('aria-expanded', 'true')
    expect(document.activeElement).toHaveClass('picker__search')
    await user.click(await screen.findByRole('option', { name: 'Marketing' }))
    expect(startRun).toHaveBeenCalledWith(marketingRun)
    expect(screen.queryByRole('button', { name: 'Start · Marketing' })).toBeNull()
  })

  it('has no primary when nothing is ready to start, when the Process has no steps yet, or when it is archived', async () => {
    data = workLineData('process', { steps: 2 })
    occurrences([])
    const first = renderRecord('work-line')
    await screen.findByRole('heading', { level: 1, name: 'Café opening' })
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(0)
    first.unmount()

    data = workLineData('process', { steps: 2, archived: true })
    occurrences([dueRun('Café Operations', 'team-1')])
    const second = renderRecord('work-line')
    await screen.findByRole('heading', { level: 1, name: 'Café opening' })
    expect(screen.queryByRole('button', { name: 'Start occurrence' })).toBeNull()
    second.unmount()

    data = workLineData('process', { steps: 0 })
    occurrences([dueRun('Café Operations', 'team-1')])
    renderRecord('work-line')
    await screen.findByRole('region', { name: 'Get this Process started' })
    expect(screen.queryByRole('button', { name: 'Start occurrence' })).toBeNull()
  })

  it('reports a failed start beside the header, once', async () => {
    data = workLineData('process', { steps: 2 })
    occurrences([dueRun('Café Operations', 'team-1')], { startError: true })
    renderRecord('work-line')
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't start")
  })
})
