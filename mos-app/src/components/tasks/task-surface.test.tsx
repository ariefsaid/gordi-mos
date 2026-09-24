import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { TaskListRow, ChecklistItemRow, TaskEventRow } from '@/lib/db/tasks.types'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'
import { I18nProvider } from '@/i18n/I18nProvider'

// ── Mock the data layer ──────────────────────────────────────────────────────
vi.mock('../../lib/db/tasks', () => ({
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateTaskRaci: vi.fn(),
  updateTaskFields: vi.fn(),
  addChecklistItem: vi.fn(),
  toggleChecklistItem: vi.fn(),
  reorderChecklistItem: vi.fn(),
  deleteChecklistItem: vi.fn(),
  archiveTask: vi.fn(),
  unarchiveTask: vi.fn(),
}))
vi.mock('../../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
  getPersonTeams: vi.fn(),
  getTeamsByIds: vi.fn(),
  getDownlinePersonIds: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../lib/comments/postComment', () => ({
  listComments: vi.fn(),
  postComment: vi.fn(),
}))
vi.mock('../../lib/db/objectives', () => ({
  listObjectives: vi.fn().mockResolvedValue([]),
  readObjective: vi.fn().mockResolvedValue(null),
}))

import { getTask, createTask, updateTaskStatus, updateTaskFields, toggleChecklistItem, unarchiveTask, archiveTask } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople, getDownlinePersonIds } from '@/lib/db/directory'
import * as directoryApi from '@/lib/db/directory'
import { listComments, postComment } from '@/lib/comments/postComment'
import { TaskSurface } from './task-surface'
import { listObjectives, readObjective } from '@/lib/db/objectives'

const mockGetTask = vi.mocked(getTask)
const mockCreateTask = vi.mocked(createTask)
const mockUpdateTaskStatus = vi.mocked(updateTaskStatus)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockGetPeople = vi.mocked(getPeople)
const mockGetPersonTeams = (directoryApi as unknown as {
  getPersonTeams: ReturnType<typeof vi.fn>
}).getPersonTeams
const mockGetTeamsByIds = (directoryApi as unknown as {
  getTeamsByIds: ReturnType<typeof vi.fn>
}).getTeamsByIds
const mockListComments = vi.mocked(listComments)
const mockPostComment = vi.mocked(postComment)

const VIEWER_ID = 'viewer-person-id'

const mockPerson: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'uid', full_name: 'Cahya Cafe',
  email: 'cahya@example.test', must_change_password: false, archived_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const mockRole: RolesRow = {
  id: 'role-1', org_id: 'org', business_unit_id: 'bu-1',
  name: 'CEO', reports_to_role_id: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const authedState: AuthState = {
  status: 'authenticated',
  viewer: { person: mockPerson, roles: [mockRole], isManager: false, accessRoles: [], affiliated: [] },
  signOut: async () => {},
}

// F1 (2026-09-24 independent review): the real PostgREST error for `.single()` matching 0 rows
// carries `code: 'PGRST116'` — its message never contains the literal string "PGRST116" (it reads
// e.g. "JSON object requested, multiple (or no) rows returned"). Build the same shape getTask
// throws (lib/db/tasks.ts's dbError), not a fake message the real client would never produce.
function missingTaskError(): Error & { code: string } {
  return Object.assign(
    new Error('getTask failed — JSON object requested, multiple (or no) rows returned'),
    { code: 'PGRST116' },
  )
}

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-abc', org_id: 'org', title: 'Fix the coffee machine',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID,
    consulted_person_ids: [], informed_person_ids: [],
    description: 'The espresso machine on floor 2 is broken.',
    due_date: '2026-06-20', objective_id: null, work_line_id: null,
    last_activity_at: '2026-06-11T08:00:00Z',
    archived_at: null, created_by: VIEWER_ID,
    created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
    ...overrides,
  }
}

const mockBUs: BusinessUnitOption[] = [
  { id: 'bu-1', name: 'Cafe Operations' },
  { id: 'bu-2', name: 'Sales' },
]
const mockPeople: PersonOption[] = [
  { id: VIEWER_ID, full_name: 'Cahya Cafe' },
  { id: 'other-id', full_name: 'Other Person' },
]
const mockTeams = [
  { id: 'team-cafe', name: 'Cafe Team', businessUnitId: 'bu-1' },
  { id: 'team-sales', name: 'Sales Team', businessUnitId: 'bu-2' },
]

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listObjectives).mockResolvedValue([])
  vi.mocked(readObjective).mockResolvedValue(null)
  // Per-task drafts and focus state are isolated so one test cannot leak composer content.
  sessionStorage.clear()
  mockGetBusinessUnits.mockResolvedValue(mockBUs)
  mockGetPeople.mockResolvedValue(mockPeople)
  mockGetPersonTeams.mockResolvedValue(mockTeams)
  mockGetTeamsByIds.mockResolvedValue(mockTeams)
  // vi.resetAllMocks() above wipes the factory-level seed; the record's edit/archive gates and
  // PIC picker read the viewer's downline, so it must be re-seeded like every other read.
  vi.mocked(getDownlinePersonIds).mockResolvedValue([])
  mockListComments.mockResolvedValue([])
  mockPostComment.mockResolvedValue('comment-new')
  mockUpdateTaskStatus.mockResolvedValue()
  mockCreateTask.mockResolvedValue('new-task-id')
})

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>
}

function renderSurface(props: Partial<Parameters<typeof TaskSurface>[0]> = {}, auth: AuthState = authedState) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/tasks/task-abc']}>
        <TaskSurface taskId="task-abc" mode="view" width="full" {...props} />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

// Value-first record grammar: a field renders its VALUE first and swaps in its control only when
// the row is activated. Click the field's edit affordance, then query its control.
function activateFieldByKey(key: string) {
  const btn = document.querySelector(`[data-field-key="${key}"] [data-field-edit]`) as HTMLElement
  fireEvent.click(btn)
}

function chooseRecordOption(label: string) {
  fireEvent.click(screen.getByRole('combobox'))
  fireEvent.click(screen.getByRole('option', { name: label }))
}

function chooseRecordOverflow(label: string) {
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
  fireEvent.click(screen.getByRole('menuitem', { name: label }))
}

function choosePickerOption(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }))
  fireEvent.click(screen.getByRole('option', { name: option }))
}

function renderIndonesianSurface() {
  return render(
    <I18nProvider initialLocale="id">
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/tasks/task-abc']}>
          <TaskSurface taskId="task-abc" mode="view" width="full" />
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
  )
}

function renderSurfaceRoute(path: string) {
  return render(
    <AuthContext.Provider value={authedState}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        <Routes>
          <Route path="/work/tasks/new" element={<TaskSurface taskId={null} mode="create" width="full" />} />
          <Route path="/work/tasks/:taskId" element={<TaskSurface taskId="task-abc" mode="view" width="full" />} />
          <Route path="/work/tasks" element={<div data-testid="tasks-list">Tasks list</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

// ── View mode ────────────────────────────────────────────────────────────────
describe('TaskSurface — view mode', () => {
  it('keeps an archived Objective link readable while excluding it from new attribution', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask({ objective_id: 'archived-objective' }), checklist: [], events: [] })
    vi.mocked(listObjectives).mockResolvedValue([{ id: 'active-objective', name: 'Current Objective' }])
    vi.mocked(readObjective).mockResolvedValue({
      id: 'archived-objective', name: 'Archived Objective', archived_at: '2026-07-01T00:00:00Z',
      business_unit_id: null, accountable_person_id: null, period_year: null, updated_at: '',
    })
    renderSurface()
    expect((await screen.findAllByRole('link', { name: 'Archived Objective' }))[0]).toHaveAttribute('href', '/work/objectives/archived-objective')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Objective' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Objective' }))
    expect(screen.getByRole('option', { name: 'Current Objective' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Archived Objective' })).toBeNull()
  })

  it('AC-070 (TaskSurface): renders title, status, typed ownership, checklist, activity, and completion', async () => {
    const task = makeTask()
    const checklist: ChecklistItemRow[] = [{
      id: 'item-0', org_id: 'org', task_id: 'task-abc', label: 'Inspect coil',
      is_done: false, position: 0, created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
    }]
    const events: TaskEventRow[] = [{
      id: 'evt-1', org_id: 'org', task_id: 'task-abc', actor_person_id: VIEWER_ID,
      event_type: 'created', from_value: null, to_value: null, created_at: '2026-06-11T00:00:00Z',
    }]
    mockGetTask.mockResolvedValue({ task, checklist, events })

    renderSurface()

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' })).toBeInTheDocument()
    })
    // Status/action stay in the compact header; the full work path and context remain in one view.
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /task ownership/i })).toBeInTheDocument()
    const ownership = document.querySelector('[data-content-slot="ownership"]') as HTMLElement
    expect(within(ownership).getByText('PIC')).toBeInTheDocument()
    expect(within(ownership).getByText('Supervisor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark complete' })).toBeInTheDocument()
    expect(screen.queryByText(/RACI|Responsible \(R\)|Accountable \(A\)|Consulted|Informed/)).toBeNull()
    expect(screen.getByRole('region', { name: /checklist/i })).toBeInTheDocument()
    expect(screen.getByText('Inspect coil')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /activity/i })).toBeInTheDocument()
  })

  it('navigates directly to the related Objective from a standalone Task record', async () => {
    vi.mocked(listObjectives).mockResolvedValue([{ id: 'obj-direct', name: 'Grow direct orders' }])
    mockGetTask.mockResolvedValue({
      task: makeTask({ objective_id: 'obj-direct' }), checklist: [], events: [],
    })
    render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/work/tasks/task-abc']}>
          <LocationProbe />
          <TaskSurface taskId="task-abc" mode="view" width="full" />
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    const objectiveLink = await screen.findByRole('link', { name: 'Grow direct orders' })
    expect(objectiveLink).toHaveAttribute('href', '/work/objectives/obj-direct')
    fireEvent.click(objectiveLink)
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/work/objectives/obj-direct'))
  })

  it('AC-I02: Indonesian locale localizes the task record chrome and feed', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })

    renderIndonesianSurface()

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' })).toBeInTheDocument())
    expect(screen.getByRole('region', { name: 'Detail tugas' })).toBeInTheDocument()
    expect(screen.getByText('Kepemilikan tugas')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Checklist' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Aktivitas' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Komentar' })).toBeInTheDocument()
    expect(screen.getByText(/jadilah yang pertama berkomentar/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kirim komentar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tandai selesai' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByText('Task details')).toBeNull()
  })

  it('AC-R01: full width renders the work-first document with all work regions visible', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderSurface()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    // Description and checklist lead; compact owner/due context stays visible before discussion.
    expect(screen.getByRole('region', { name: /task details/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /checklist/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /activity/i })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).toBeNull()
    // The shared RecordViewer owns identity + every ordered Task work/context slot.
    expect(document.querySelector('.record-viewer--page')).toBeTruthy()
    const regions = [...document.querySelectorAll('[data-content-slot]')]
      .map((node) => (node as HTMLElement).dataset.contentSlot)
    expect(regions).toEqual(['content', 'checklist', 'ownership', 'activity', 'relations'])
  })

  it('AC-P3-CM-004: renders task comments in the live task surface', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    mockListComments.mockResolvedValue([
      { id: 'comment-1', author_id: VIEWER_ID, body: 'Please check the blocker', created_at: '2026-07-05T01:00:00Z' },
    ])

    renderSurface()

    await waitFor(() => expect(screen.getByText('Please check the blocker')).toBeInTheDocument())
    expect(mockListComments).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'task',
      entityId: 'task-abc',
    }))
  })

  it('preserves and posts a comment draft when the record moves from panel to page context', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    function PresentationHarness() {
      const [width, setWidth] = useState<'drawer' | 'full'>('drawer')
      return (
        <AuthContext.Provider value={authedState}>
          <MemoryRouter initialEntries={['/work/tasks/task-abc']}>
            <TaskSurface
              taskId="task-abc"
              mode="view"
              width={width}
              onOpenPage={() => setWidth('full')}
            />
          </MemoryRouter>
        </AuthContext.Provider>
      )
    }
    render(<PresentationHarness />)

    const composer = await screen.findByRole('textbox', { name: /comment/i })
    const draft = 'Need the serial number before I can order the part.'
    fireEvent.change(composer, { target: { value: draft } })
    expect(screen.getByRole('region', { name: /checklist/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /activity/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /open full page/i }))
    await waitFor(() => expect(document.querySelector('.record-viewer--page')).toBeInTheDocument())
    const pageComposer = screen.getByRole('textbox', { name: /comment/i })
    expect(pageComposer).toHaveValue(draft)

    fireEvent.click(screen.getByRole('button', { name: /post comment/i }))
    await waitFor(() => expect(mockPostComment).toHaveBeenCalledWith(expect.objectContaining({ body: draft })))
    await waitFor(() => expect(screen.getByRole('textbox', { name: /comment/i })).toHaveValue(''))
  })

  it('issue 584 review: posting a comment threads the viewer as actorId/actorName + the active locale', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    mockListComments.mockResolvedValue([])
    renderSurface()

    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    const box = screen.getByRole('textbox', { name: /^comment$/i })
    fireEvent.change(box, { target: { value: 'On it' } })
    fireEvent.click(screen.getByRole('button', { name: /post comment/i }))

    // #584 review: pins actorId/actorName/locale so a call-site regression (e.g. dropping the
    // viewer wiring) fails here rather than silently shipping a blank-actor notification.
    await waitFor(() => expect(mockPostComment).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'task', entityId: 'task-abc', body: 'On it',
      actorId: VIEWER_ID, actorName: 'Cahya Cafe', locale: 'en',
    })))
  })

  it('copies the canonical Task URL from a nested collection stack', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    mockGetTask.mockResolvedValue({ task: makeTask({ responsible_person_id: 'other-id', accountable_person_id: VIEWER_ID }), checklist: [], events: [] })
    render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter basename="/mos" initialEntries={['/mos/work/tasks?record=task-abc']}>
          <TaskSurface taskId="task-abc" mode="view" width="full" />
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }))

    expect(writeText).toHaveBeenCalledWith(new URL('/mos/work/tasks/task-abc', window.location.origin).href)
  })

  it('AC-R05: full width keeps the archived banner + Unarchive above the two columns', async () => {
    const { unarchiveTask } = await import('@/lib/db/tasks')
    vi.mocked(unarchiveTask).mockResolvedValue()
    mockGetTask.mockResolvedValue({ task: makeTask({ responsible_person_id: 'other-id', archived_at: '2026-06-12T00:00:00Z' }), checklist: [], events: [] })
    renderSurface()
    await waitFor(() => screen.getByText(/this task is archived/i))
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menuitem', { name: /unarchive/i })).toBeInTheDocument()
  })

  it('AC-070 (TaskSurface): shows the loading skeleton initially', () => {
    mockGetTask.mockReturnValue(new Promise(() => {}))
    renderSurface()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('AC-070 (TaskSurface): shows the not-found panel when getTask rejects', async () => {
    mockGetTask.mockRejectedValue(missingTaskError())
    renderSurface()
    await waitFor(() => expect(screen.getByText(/task not found/i)).toBeInTheDocument())
  })

  it('R-T-3: demotes the not-found heading to h2 when a PageFamilyFrame owns the page h1 (identityHeadingLevel=2)', async () => {
    mockGetTask.mockRejectedValue(missingTaskError())
    renderSurface({ identityHeadingLevel: 2 })
    // Inside the focused-record PageFamilyFrame the region-3 head is the page h1, so the not-found
    // panel must nest as an h2 — never a second h1 (R-T-3 double-h1 fix).
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: /task not found/i })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('heading', { level: 1, name: /task not found/i })).not.toBeInTheDocument()
  })

  it('R-T-3: keeps the not-found heading an h1 in the default full-width host (identityHeadingLevel defaults to 1)', async () => {
    mockGetTask.mockRejectedValue(missingTaskError())
    renderSurface()
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: /task not found/i })).toBeInTheDocument(),
    )
  })

  // S9 (2026-09-24 cross-boundary scout): a transport failure (aborted fetch / 500) is not a
  // missing task — it must render the retryable ErrorState, never the "Task not found" copy, and
  // Retry must re-issue the exact same read.
  it('S9: shows ErrorState with a working Retry when getTask rejects with a non-PGRST116 (network/500) error', async () => {
    mockGetTask.mockRejectedValueOnce(new Error('Failed to fetch'))
    renderSurface()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.queryByText(/task not found/i)).not.toBeInTheDocument()

    mockGetTask.mockResolvedValueOnce({ task: makeTask(), checklist: [], events: [] })
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(mockGetTask).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText('Fix the coffee machine')).toBeInTheDocument())
  })

  // F1 (2026-09-24 independent review): getTask's own thrown message for a real missing task is
  // PostgREST's actual wording ("JSON object requested, multiple (or no) rows returned"), which
  // contains no "PGRST116"/"no rows" substring a text-only classifier could key on — only the
  // preserved `.code` does. This must render "Task not found", not the retryable ErrorState.
  it('F1: a real missing-task error (code PGRST116, no matching text in the message) still renders "Task not found"', async () => {
    mockGetTask.mockRejectedValue(missingTaskError())
    renderSurface()
    await waitFor(() => expect(screen.getByText(/task not found/i)).toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // F-11 (2026-09-24 independent review): at full width the retryable error must sit in the SAME
  // 820px reading column (`.record-doc`) the loaded record and "Task not found" both read as —
  // not spill full-bleed across the whole page-content region (text flush left, Retry stranded at
  // the far right, per the reviewed screenshot). Drawer width has no such column and is untouched.
  it('F-11: at full width, the retryable ErrorState renders inside .record-doc (the shared record column)', async () => {
    mockGetTask.mockRejectedValue(new Error('Failed to fetch'))
    renderSurface({ width: 'full' })
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(document.querySelector('.record-doc > .error-state')).toBeInTheDocument()
  })

  it('F-11: at drawer width, the retryable ErrorState renders without the page-only .record-doc column', async () => {
    mockGetTask.mockRejectedValue(new Error('Failed to fetch'))
    renderSurface({ width: 'drawer' })
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(document.querySelector('.record-doc')).not.toBeInTheDocument()
  })

  it('calls onClose (not navigate) after a successful archive', async () => {
    const onClose = vi.fn()
    mockGetTask.mockResolvedValue({ task: makeTask({ responsible_person_id: 'other-id' }), checklist: [], events: [] })
    const { archiveTask } = await import('@/lib/db/tasks')
    vi.mocked(archiveTask).mockResolvedValue()
    renderSurface({ onClose })
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    chooseRecordOverflow('Archive task')
    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('AC-071 (TaskSurface): inline status change calls updateTaskStatus', async () => {
    mockGetTask
      .mockResolvedValueOnce({ task: makeTask({ status: 'Open' }), checklist: [], events: [] })
      .mockResolvedValueOnce({ task: makeTask({ status: 'In Progress' }), checklist: [], events: [] })
    renderSurface()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    activateFieldByKey('status')
    chooseRecordOption('In Progress')
    await waitFor(() => {
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-abc', 'Open', 'In Progress', VIEWER_ID)
    })
  })

  it('updates Team and shows Business Unit once in task context', async () => {
    const initialTask = { ...makeTask(), team_id: 'team-cafe' }
    const refreshedTask = { ...makeTask({ business_unit_id: 'bu-2' }), team_id: 'team-sales' }
    mockGetTask
      .mockResolvedValueOnce({ task: initialTask, checklist: [], events: [] })
      .mockResolvedValueOnce({ task: refreshedTask, checklist: [], events: [] })
    mockGetTeamsByIds
      .mockResolvedValueOnce([mockTeams[0]])
      .mockResolvedValueOnce([mockTeams[1]])

    renderSurface()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Team' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Team' }))
    fireEvent.click(screen.getByRole('option', { name: 'Sales Team' }))

    await waitFor(() => expect(vi.mocked(updateTaskFields)).toHaveBeenCalledWith(
      'task-abc',
      { team_id: 'team-sales', business_unit_id: 'bu-2' },
      VIEWER_ID,
      null,
    ))
    await waitFor(() => expect(screen.getAllByText('Sales Team')).toHaveLength(1))
    expect(document.querySelector('[data-field-key="businessUnit"]')).toHaveTextContent('Sales')
  })
})

// ── Mutation handlers (self-coverage — these previously relied transitively on
//    pages/TaskDetail.test.tsx; pin them directly to the new unit so PR-B can't
//    drop the proof of behavior-preservation silently) ──────────────────────────
describe('TaskSurface — mutation handlers', () => {
  const item: ChecklistItemRow = {
    id: 'item-9', org_id: 'org', task_id: 'task-abc', label: 'Drain reservoir',
    is_done: false, position: 0, created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
  }

  it('checklist toggle (optimistic): calls toggleChecklistItem with the new done state', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [item], events: [] })
    vi.mocked(toggleChecklistItem).mockResolvedValue()
    renderSurface()
    await waitFor(() => screen.getByText('Drain reservoir'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Drain reservoir' }))
    await waitFor(() =>
      expect(vi.mocked(toggleChecklistItem)).toHaveBeenCalledWith('item-9', true, 'task-abc', VIEWER_ID),
    )
  })

  it('checklist toggle (rollback): reverts the checkbox when the write rejects', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [item], events: [] })
    vi.mocked(toggleChecklistItem).mockRejectedValue(new Error('write failed'))
    renderSurface()
    await waitFor(() => screen.getByText('Drain reservoir'))
    const cb = () => screen.getByRole('checkbox', { name: 'Drain reservoir' }) as HTMLInputElement
    expect(cb().checked).toBe(false)
    fireEvent.click(cb())
    await waitFor(() => expect(vi.mocked(toggleChecklistItem)).toHaveBeenCalled())
    // optimistic flips on, the catch arm rolls back to off
    await waitFor(() => expect(cb().checked).toBe(false))
  })

  it('PIC reassignment (rollback): restores the previous PIC when the write rejects', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    vi.mocked(updateTaskFields).mockRejectedValue(new Error('write failed'))
    // #742's PIC-value rule accepts a new PIC only from the writer's self + downline, so the
    // picker offers other-id only while the viewer holds them in their downline — mirror and DB agree.
    vi.mocked(getDownlinePersonIds).mockResolvedValue(['other-id'])
    renderSurface()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    // V3 Issue 5: PIC is now a shared RecordViewer/RecordField picker.
    activateFieldByKey('pic')
    chooseRecordOption('Other Person')
    await waitFor(() => expect(vi.mocked(updateTaskFields)).toHaveBeenCalledWith(
      // 4th arg (#742 AC-059): the previous PIC value, threaded through for the from/to event.
      'task-abc', { responsible_person_id: 'other-id' }, VIEWER_ID, VIEWER_ID,
    ))
    // Optimistic reassignment rolled back to the previous PIC after the write rejects.
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'PIC' })).toHaveTextContent('Cahya Cafe'))
  })

  // I3: archiving reports the id back to the host (so the table drops the row).
  it('keeps the record open after failed archive and lets the user retry', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask({ responsible_person_id: 'other-id' }), checklist: [], events: [] })
    vi.mocked(archiveTask).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce()
    const onClose = vi.fn()
    const onTaskArchived = vi.fn()
    renderSurface({ onClose, onTaskArchived })
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive task' }))
    fireEvent.click(await screen.findByRole('button', { name: /^archive$/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't save")
    expect(onClose).not.toHaveBeenCalled()
    expect(onTaskArchived).not.toHaveBeenCalled()
    fireEvent.click(within(alert).getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(onTaskArchived).toHaveBeenCalledWith('task-abc'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('I3: confirming archive calls archiveTask then onTaskArchived with the id', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask({ responsible_person_id: 'other-id' }), checklist: [], events: [] })
    vi.mocked(archiveTask).mockResolvedValue(undefined)
    const onTaskArchived = vi.fn()
    renderSurface({ onTaskArchived, onClose: vi.fn() })
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive task' }))
    fireEvent.click(await screen.findByRole('button', { name: /^archive$/i }))
    await waitFor(() => expect(vi.mocked(archiveTask)).toHaveBeenCalledWith('task-abc', VIEWER_ID))
    expect(onTaskArchived).toHaveBeenCalledWith('task-abc')
  })

  it('unarchive: archived task surfaces Unarchive and calls unarchiveTask', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask({ responsible_person_id: 'other-id', archived_at: '2026-06-12T00:00:00Z' }), checklist: [], events: [] })
    vi.mocked(unarchiveTask).mockResolvedValue()
    renderSurface()
    await waitFor(() => screen.getByText(/this task is archived/i))
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /unarchive/i }))
    await waitFor(() => expect(vi.mocked(unarchiveTask)).toHaveBeenCalledWith('task-abc', VIEWER_ID))
  })
})

// ── Live region (AC-111, AC-034) — optimistic save/rollback announcements ─────
describe('TaskSurface — live region (AC-111)', () => {
  function liveRegion() {
    return document.querySelector('[aria-live="polite"]')
  }

  it('AC-111: a successful status change announces the new status', async () => {
    mockGetTask
      .mockResolvedValueOnce({ task: makeTask({ status: 'Open' }), checklist: [], events: [] })
      .mockResolvedValueOnce({ task: makeTask({ status: 'In Progress' }), checklist: [], events: [] })
    mockUpdateTaskStatus.mockResolvedValue()
    renderSurface()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    activateFieldByKey('status')
    chooseRecordOption('In Progress')
    await waitFor(() => expect(liveRegion()?.textContent).toMatch(/status changed to In Progress/i))
  })

  it('AC-111: a failed status change rolls back AND announces the revert', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask({ status: 'Open' }), checklist: [], events: [] })
    mockUpdateTaskStatus.mockRejectedValue(new Error('write failed'))
    renderSurface()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    activateFieldByKey('status')
    chooseRecordOption('Blocked')
    await waitFor(() => expect(mockUpdateTaskStatus).toHaveBeenCalled())
    // pill reverts to Open AND the live region announces the failure
    await waitFor(() => expect(liveRegion()?.textContent).toMatch(/couldn.t save|reverted/i))
  })

  it('AC-111: a successful checklist add announces it', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    const { addChecklistItem } = await import('@/lib/db/tasks')
    vi.mocked(addChecklistItem).mockResolvedValue()
    renderDrawer()
    const input = await screen.findByLabelText(/add checklist item/i)
    fireEvent.change(input, { target: { value: 'Buy beans' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(liveRegion()?.textContent).toMatch(/checklist item added/i))
  })

  it('AC-111: a failed checklist toggle reverts AND announces the rollback', async () => {
    const item: ChecklistItemRow = {
      id: 'item-x', org_id: 'org', task_id: 'task-abc', label: 'Wipe counter',
      is_done: false, position: 0, created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
    }
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [item], events: [] })
    vi.mocked(toggleChecklistItem).mockRejectedValue(new Error('write failed'))
    renderSurface()
    await waitFor(() => screen.getByText('Wipe counter'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wipe counter' }))
    await waitFor(() => expect(liveRegion()?.textContent).toMatch(/couldn.t save|reverted/i))
  })

  it('AC-111: a failed PIC reassignment reverts AND announces the rollback', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    vi.mocked(updateTaskFields).mockRejectedValue(new Error('write failed'))
    vi.mocked(getDownlinePersonIds).mockResolvedValue(['other-id'])
    renderSurface()
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    activateFieldByKey('pic')
    chooseRecordOption('Other Person')
    await waitFor(() => expect(liveRegion()?.textContent).toMatch(/couldn.t save|reverted/i))
  })
})

// ── Drawer width (Variant B chrome) ──────────────────────────────────────────
function renderDrawer(props: Partial<Parameters<typeof TaskSurface>[0]> = {}, auth: AuthState = authedState) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/tasks/task-abc']}>
        <TaskSurface taskId="task-abc" mode="view" width="drawer" {...props} />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('TaskSurface — drawer width (Variant B chrome)', () => {
  const checklist: ChecklistItemRow[] = [{
    id: 'item-0', org_id: 'org', task_id: 'task-abc', label: 'Inspect coil',
    is_done: false, position: 0, created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
  }]

  it('AC-R06 (drawer): compact single-column record keeps work sections and context visible', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist, events: [] })
    renderDrawer()
    await waitFor(() => screen.getByText('Fix the coffee machine'))
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByRole('region', { name: /task ownership/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /activity/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /checklist/i })).toBeInTheDocument()
    expect(screen.getByText('Inspect coil')).toBeInTheDocument()
    expect(document.querySelector('.record-viewer--panel')).toBeTruthy()
  })

  it('AC-R06 (drawer): all record sections stay visible without section navigation', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist, events: [] })
    renderDrawer()
    await waitFor(() => screen.getByText('Fix the coffee machine'))
    expect(screen.getByRole('region', { name: /task ownership/i })).toBeInTheDocument()
    expect(screen.getByText('Inspect coil')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /task details/i })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('AC-103 (drawer): changing status in the pinned header updates the pill and calls updateTaskStatus', async () => {
    mockGetTask
      .mockResolvedValueOnce({ task: makeTask({ status: 'Open' }), checklist: [], events: [] })
      .mockResolvedValueOnce({ task: makeTask({ status: 'In Progress' }), checklist: [], events: [] })
    const onTaskChanged = vi.fn()
    renderDrawer({ onTaskChanged })
    await waitFor(() => screen.getByText('Fix the coffee machine'))
    activateFieldByKey('status')
    chooseRecordOption('In Progress')
    await waitFor(() => expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-abc', 'Open', 'In Progress', VIEWER_ID))
    await waitFor(() => expect(onTaskChanged).toHaveBeenCalled())
  })

  it('archive lives in the header overflow at drawer width, leaving the footer quiet', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask({ responsible_person_id: 'other-id' }), checklist: [], events: [] })
    renderDrawer()
    await waitFor(() => screen.getByText('Fix the coffee machine'))
    const actions = document.querySelector('[data-viewer-region="actions"]')
    expect(actions).toBeTruthy()
    expect(within(actions as HTMLElement).queryByRole('button', { name: /archive task/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menuitem', { name: /archive task/i })).toBeInTheDocument()
  })

  it('GAP-2 (OD-91 #7): the drawer has no expand/collapse toggle — Open full page is the one escalation', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderDrawer()
    await waitFor(() => screen.getByText('Fix the coffee machine'))
    expect(screen.queryByRole('button', { name: /expand to full width|collapse to split/i })).toBeNull()
    // The drawer's own utility bar carries the one escalation verb instead.
    expect(screen.getByRole('button', { name: /open full page/i })).toBeInTheDocument()
  })

  it('AC-112 (drawer): archived deep-link shows the archived banner + Unarchive, edit affordances suppressed', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask({ responsible_person_id: 'other-id', archived_at: '2026-06-12T00:00:00Z' }), checklist, events: [] })
    vi.mocked(unarchiveTask).mockResolvedValue()
    renderDrawer()
    await waitFor(() => screen.getByText(/this task is archived/i))
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menuitem', { name: /unarchive/i })).toBeInTheDocument()
    // archived => no status trigger (read-only)
    expect(document.querySelector('[data-field-key="status"] select')).toBeNull()
  })

  it('AC-112 (drawer): not-found shows "Task not found" + All tasks link', async () => {
    mockGetTask.mockRejectedValue(missingTaskError())
    renderDrawer()
    await waitFor(() => expect(screen.getByText(/task not found/i)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /all tasks/i })).toBeInTheDocument()
  })

  it('drawer loading shows the skeleton', () => {
    mockGetTask.mockReturnValue(new Promise(() => {}))
    renderDrawer()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('read-only (non-editor) drawer hides the status trigger and archive', async () => {
    mockGetTask.mockResolvedValue({
      task: makeTask({ responsible_person_id: 'other-id', accountable_person_id: 'other-id' }),
      checklist: [], events: [],
    })
    renderDrawer()
    await waitFor(() => screen.getByText('Fix the coffee machine'))
    expect(document.querySelector('[data-field-key="status"] select')).toBeNull()
    expect(document.querySelector('.dw-foot')).toBeNull()
  })
})

// ── Create mode ──────────────────────────────────────────────────────────────
function renderCreate(auth: AuthState = authedState, onClose = vi.fn()) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/tasks/new']}>
        <TaskSurface taskId={null} mode="create" width="full" onClose={onClose} />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('TaskSurface — saved-view URL preservation', () => {
  it('AC-307: not-found link from /work/tasks/task-abc?view=mine points back to /work/tasks?view=mine', async () => {
    mockGetTask.mockRejectedValue(missingTaskError())
    renderSurfaceRoute('/work/tasks/task-abc?view=mine')
    const link = await screen.findByRole('link', { name: /all tasks/i })
    expect(link.getAttribute('href')).toBe('/work/tasks?view=mine')
  })

  it('AC-308: create cancel from /work/tasks/new?view=mine&r=other-id returns to /work/tasks?view=mine without losing the prefill on load', async () => {
    renderSurfaceRoute('/work/tasks/new?view=mine&r=other-id')
    const responsible = await screen.findByLabelText(/^pic$/i)
    expect(responsible).toHaveTextContent('Other Person')
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/work/tasks?view=mine'))
  })

  it('GAP-6 (OD-91 #11): create success from /work/tasks/new?view=mine returns to the collection with the view preserved + ?highlight=<id>', async () => {
    renderSurfaceRoute('/work/tasks/new?view=mine&r=other-id')
    await waitFor(() => screen.getByLabelText(/title/i))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Saved view task' } })
    // Supervisor starts empty and is required (AC-080/task-surface.tsx accountablePersonId) — a
    // valid submit needs it explicitly chosen.
    choosePickerOption('Supervisor', 'Cahya Cafe')
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    // After-create returns to the collection (not the drawer), preserving the view + flagging the new row.
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/work/tasks?view=mine&highlight=new-task-id'))
  })

  it('AC-311: archive success from /work/tasks/task-abc?view=mine returns to /work/tasks?view=mine', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask({ responsible_person_id: 'other-id' }), checklist: [], events: [] })
    vi.mocked(archiveTask).mockResolvedValue(undefined)
    renderSurfaceRoute('/work/tasks/task-abc?view=mine')
    await waitFor(() => screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' }))
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive task' }))
    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }))
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/work/tasks?view=mine'))
  })
})

describe('TaskSurface — create mode', () => {
  it('AC-080 (TaskSurface create): PIC defaults to creator, Supervisor starts empty (required), Team defaults to primary-role Team; all editable', async () => {
    renderCreate()
    await waitFor(() => {
      const teamPicker = screen.getByRole('combobox', { name: 'Team' })
      expect(teamPicker).toHaveTextContent('Cafe Team')
    })
    const rPicker = screen.getByRole('combobox', { name: 'PIC' })
    expect(rPicker).toHaveTextContent('Cahya Cafe')
    // Supervisor starts EMPTY — a deliberate v4 product decision (OD-REDESIGN-3/14/41,
    // task-surface.tsx accountablePersonId comment): PIC and Supervisor are distinct accountable
    // roles; auto-collapsing Supervisor to the creator/PIC defeats that model.
    const aPicker = screen.getByRole('combobox', { name: 'Supervisor' })
    expect(aPicker).toHaveTextContent(/select supervisor/i)
    expect(rPicker).not.toBeDisabled()
    expect(aPicker).not.toBeDisabled()
  })

  // #300: with focus in a dirty required field, a real browser click on Cancel runs
  // pointerdown → blur → pointerup/click — and the blur-triggered validation inserts an error
  // line ABOVE the inline action row, moving Cancel out from under the pointer, so the click
  // event never reaches the button. The fix fires the cancel on POINTERDOWN (before the blur
  // relayout). This test replays that exact sequence — pointerdown then blur, and deliberately
  // NO click, because in the buggy layout no click ever lands on the button — and asserts the
  // cancel still happened. Fails on the old onClick-only wiring.
  // ("issue 300" not "#300" in the title: the design-token lint bans #-hex-shaped string literals.)
  it('issue 300: first pointer-press on Cancel cancels even when blur validation relayouts mid-click', async () => {
    renderSurfaceRoute('/work/tasks/new?view=mine')
    const title = await screen.findByLabelText(/title/i)
    // Focused + dirty + invalid: typed then cleared, so the imminent blur inserts "Title is required".
    fireEvent.focus(title)
    fireEvent.change(title, { target: { value: 'draft' } })
    fireEvent.change(title, { target: { value: '' } })
    const cancel = screen.getByRole('button', { name: /cancel/i })
    // jsdom has no PointerEvent constructor, and RTL's fireEvent.pointerDown falls back to a bare
    // Event carrying NO `button` — which the handler's primary-button guard rightly rejects. A
    // MouseEvent typed 'pointerdown' carries button=0, matching what a real primary press sends.
    fireEvent(cancel, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
    fireEvent.blur(title)
    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/work/tasks?view=mine'))
    expect(mockCreateTask).not.toHaveBeenCalled()
  })

  it('issue 300: keyboard activation of Cancel (click with detail 0, no pointer sequence) still cancels', async () => {
    renderSurfaceRoute('/work/tasks/new?view=mine')
    const cancel = await screen.findByRole('button', { name: /cancel/i })
    // Enter/Space synthesize a click with detail 0 and no preceding pointerdown — the keyboard path.
    fireEvent.click(cancel)
    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/work/tasks?view=mine'))
  })

  it('issue 300: a pointer click (detail ≥ 1) without its pointerdown landing on Cancel does not cancel', async () => {
    // The click that FOLLOWS a pointer press is ignored (its pointerdown already ran the cancel) —
    // so a press that starts elsewhere and releases over Cancel must not cancel, and one press can
    // never cancel twice. Deleting the detail check in handleCancelClick turns this red.
    renderSurfaceRoute('/work/tasks/new?view=mine')
    const cancel = await screen.findByRole('button', { name: /cancel/i })
    fireEvent.click(cancel, { detail: 1 })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/work/tasks/new?view=mine')
  })

  it('AC-081 (TaskSurface create): empty Title blocks submit with a field error', async () => {
    renderCreate()
    await waitFor(() => screen.getByRole('button', { name: /create task/i }))
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    await waitFor(() => expect(screen.getByText(/title is required/i)).toBeInTheDocument())
    expect(mockCreateTask).not.toHaveBeenCalled()
  })

  // I4: the field-error TEXT must use the AA-darkened red (--status-lost-text /
  // --field-error-text), NOT base --destructive (~3.6:1, fails AA as small text).
  // The invalid field outline may stay --destructive (it's a non-text affordance).
  it('I4: the field-error helper text renders with the tc-field-error class', async () => {
    renderCreate()
    await waitFor(() => screen.getByRole('button', { name: /create task/i }))
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    const err = await screen.findByText(/title is required/i)
    expect(err).toHaveClass('tc-field-error')
  })

  // DO-15(b,c) (census-sweep R2 task-create F4/F5): while the directory resolves, the
  // Team/PIC/Supervisor fields render the shared LoadingShell grammar (role=status +
  // skeleton) with DIRECTORY-scoped labels — these fields load teams/people, not tasks.
  it('DO-15(b,c): resolving directory fields render LoadingShell with directory-scoped labels', async () => {
    mockGetBusinessUnits.mockReturnValue(new Promise(() => {}))
    mockGetPeople.mockReturnValue(new Promise(() => {}))
    renderCreate()
    const statuses = await screen.findAllByRole('status')
    const labels = statuses.map((el) => el.getAttribute('aria-label'))
    expect(labels).toContain('Loading teams…')
    expect(labels.filter((l) => l === 'Loading people…')).toHaveLength(2)
    // The shared skeleton grammar hosts the shell — no literal "Loading tasks" text.
    expect(document.querySelector('.tc-loading-field .skeleton-bar')).toBeTruthy()
    expect(screen.queryByText(/loading tasks/i)).toBeNull()
  })

  // DO-15(d) (census-sweep R2 task-create F6): the submit error names the problem and the
  // recovery — never the bare "Something went wrong" shrug.
  it('DO-15(d): failed submit shows an error naming the problem and the recovery', async () => {
    mockCreateTask.mockRejectedValue(new Error('boom'))
    renderCreate()
    await waitFor(() => screen.getByLabelText(/title/i))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Doomed task' } })
    choosePickerOption('Supervisor', 'Cahya Cafe')
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn.t be created/i)
    expect(alert).toHaveTextContent(/try again/i)
    expect(alert).not.toHaveTextContent(/something went wrong/i)
  })

  it('AC-107 (create drawer): at drawer width renders a "Create task" bar with no double card frame', async () => {
    render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/tasks/new']}>
          <TaskSurface taskId={null} mode="create" width="drawer" onClose={vi.fn()} />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await waitFor(() => screen.getByRole('button', { name: /create task/i }))
    expect(screen.getAllByText('Create task').length).toBeGreaterThan(0)
    expect(document.querySelector('.tc-create-drawer')).toBeTruthy()
    expect(document.querySelector('.tc-card')).toBeNull()
    // create still works at drawer width. Supervisor starts empty and is required (AC-080).
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Drawer task' } })
    choosePickerOption('Supervisor', 'Cahya Cafe')
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    await waitFor(() => expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Drawer task' })))
  })

  // DO-4 (census-sweep R2, task-create F1): CreateSurface honors showPanelUtility exactly like
  // ViewSurface — when the overlay host owns the chrome, the surface renders NO bar of its own.
  it('DO-4: showPanelUtility=false suppresses the create-mode chrome bar (host owns the chrome)', async () => {
    render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/tasks/new']}>
          <TaskSurface
            taskId={null} mode="create" width="drawer"
            onClose={vi.fn()}
            showPanelUtility={false}
          />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await waitFor(() => screen.getByRole('button', { name: /create task/i }))
    expect(document.querySelector('.dw-bar')).toBeNull()
    expect(screen.queryByRole('button', { name: /expand to full width/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull()
    // The form itself is intact (Cancel + submit still present).
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
  })

  // GAP-2 (OD-91 #7): expand-in-place is retired — the create-mode drawer bar carries no
  // expand toggle at any width (only the title + the one ✕).
  it('GAP-2: create-mode drawer bar shows NO expand toggle', async () => {
    render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/tasks/new']}>
          <TaskSurface taskId={null} mode="create" width="drawer" onClose={vi.fn()} />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await waitFor(() => screen.getByRole('button', { name: /create task/i }))
    expect(screen.queryByRole('button', { name: /expand to full width|collapse to split/i })).toBeNull()
    // The surface never carries the retired expanded-width class.
    expect(document.querySelector('.dw-surface-expanded')).toBeNull()
  })

  // C2: a successful create reports the new id back to the host (so the table
  // can refetch) before navigating.
  it('C2: successful create calls onTaskCreated with the new id', async () => {
    const onTaskCreated = vi.fn()
    render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/tasks/new']}>
          <TaskSurface taskId={null} mode="create" width="drawer" onClose={vi.fn()} onTaskCreated={onTaskCreated} />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await waitFor(() => screen.getByLabelText(/title/i))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Reportable task' } })
    // Supervisor starts empty and is required (AC-080) — a valid submit needs it chosen.
    choosePickerOption('Supervisor', 'Cahya Cafe')
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    await waitFor(() => expect(onTaskCreated).toHaveBeenCalledWith('new-task-id'))
  })

  it('AC-081 (TaskSurface create): valid submit calls createTask and navigates to the create task', async () => {
    renderCreate()
    await waitFor(() => screen.getByLabelText(/title/i))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'New Task Alpha' } })
    // Supervisor starts empty and is required (AC-080) — a valid submit needs it chosen.
    choosePickerOption('Supervisor', 'Cahya Cafe')
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({
        title: 'New Task Alpha', businessUnitId: 'bu-1', teamId: 'team-cafe',
        responsiblePersonId: VIEWER_ID, accountablePersonId: VIEWER_ID, createdBy: VIEWER_ID,
      }))
    })
  })

  // AC-108: inline-validate-ON-BLUR (design-plan §7) — the create form validates
  // a required field the moment focus leaves it empty, not only on submit.
  it('AC-108: blurring an empty Title renders an inline error (role=alert) + the error border class', async () => {
    renderCreate()
    const title = await screen.findByLabelText('Title')
    // Field starts clean — no error before interaction
    expect(screen.queryByText(/title is required/i)).toBeNull()
    fireEvent.blur(title)
    // Error appears below the field, announced, and the input carries the error class
    const err = await screen.findByText(/title is required/i)
    expect(err).toHaveAttribute('role', 'alert')
    // Error affordance: the ratified TextInput carries it on its root (destructive border);
    // aria-invalid on the input is the accessible oracle.
    expect(title.closest('.mk-textinput')).toHaveClass('mk-textinput--error')
    expect(title).toHaveAttribute('aria-invalid', 'true')
  })

  it('AC-108: a blur error clears once the field is filled (typing)', async () => {
    renderCreate()
    const title = await screen.findByLabelText('Title')
    fireEvent.blur(title)
    await screen.findByText(/title is required/i)
    fireEvent.change(title, { target: { value: 'Now it has a value' } })
    await waitFor(() => expect(screen.queryByText(/title is required/i)).toBeNull())
    expect(title.closest('.mk-textinput')).not.toHaveClass('mk-textinput--error')
  })

  it('AC-108: blurring an empty Team renders an inline error', async () => {
    // Auth with no role → no eligible Team, so the Team picker starts empty.
    const noRoleAuth: AuthState = {
      status: 'authenticated',
      viewer: { person: mockPerson, roles: [], isManager: false, accessRoles: [], affiliated: [] },
      signOut: async () => {},
    }
    mockGetPersonTeams.mockResolvedValueOnce([])
    renderCreate(noRoleAuth)
    const team = await screen.findByRole('combobox', { name: 'Team' })
    fireEvent.blur(team)
    const err = await screen.findByText(/team is required/i)
    expect(err).toHaveAttribute('role', 'alert')
    expect(team.closest('.picker')).toHaveClass('picker--error')
  })
})
