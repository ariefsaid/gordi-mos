import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { TaskListRow } from '@/lib/db/tasks.types'

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
}))

import { getTask } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { I18nProvider } from '@/i18n/I18nProvider'
import { TaskDrawer } from './task-drawer'

const mockGetTask = vi.mocked(getTask)
const VIEWER_ID = 'viewer-person-id'

// Width-regime stub: control which width queries match (1100 split / 920 band / 768 desktop).
function stubWidths({ split, band, desktop }: { split: boolean; band?: boolean; desktop?: boolean }) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => {
      let matches = false
      if (query.includes('1100')) matches = split
      else if (query.includes('920')) matches = band ?? false
      else if (query.includes('768')) matches = desktop ?? true
      return {
        matches, media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      }
    },
  })
}

const mockPerson: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'uid', full_name: 'Cahya Cafe',
  email: 'cahya@example.test', must_change_password: false, archived_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const mockRole: RolesRow = {
  id: 'role-1', org_id: 'org', business_unit_id: 'bu-1', name: 'CEO',
  reports_to_role_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const authedState: AuthState = {
  status: 'authenticated',
  viewer: { person: mockPerson, roles: [mockRole], isManager: false, accessRoles: [] },
  signOut: async () => {},
}

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-abc', org_id: 'org', title: 'Fix the coffee machine',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID,
    consulted_person_ids: [], informed_person_ids: [],
    description: 'desc', due_date: '2026-06-20', objective_id: null, work_line_id: null,
    last_activity_at: '2026-06-11T08:00:00Z',
    archived_at: null, created_by: VIEWER_ID,
    created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  stubWidths({ split: true, desktop: true }) // default: the ≥1100px non-modal split regime
  vi.mocked(getBusinessUnits).mockResolvedValue([{ id: 'bu-1', name: 'Cafe Operations' }])
  vi.mocked(getPeople).mockResolvedValue([{ id: VIEWER_ID, full_name: 'Cahya Cafe' }])
})

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>
}

function renderAt(path: string, mode: 'view' | 'create' = 'view') {
  return render(
    <AuthContext.Provider value={authedState}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        <Routes>
          <Route path="/work/tasks" element={<div data-testid="list-here">Tasks list</div>} />
          <Route path="/work/tasks/new" element={<TaskDrawer mode="create" />} />
          <Route path="/work/tasks/:taskId" element={<TaskDrawer mode={mode} />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('TaskDrawer (AC-101, AC-102)', () => {
  it('AC-101/102: reads :taskId and renders TaskSurface inside an aside labelled "Task detail"', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/work/tasks/task-abc')
    const aside = await screen.findByRole('complementary', { name: /task detail/i })
    await waitFor(() => expect(aside).toHaveTextContent('Fix the coffee machine'))
  })

  it('create mode renders an aside labelled "Create task"', async () => {
    renderAt('/work/tasks/new', 'create')
    expect(await screen.findByRole('complementary', { name: /create task/i })).toBeInTheDocument()
  })

  it('owner-eyes item 1: the drawer panel chrome label follows the ACTIVE locale (not a pinned string)', async () => {
    // The reported "Detail tugas in an English UI" leak would be a chrome label pinned to one
    // locale while content stays in another. The panel label is t('tasks.detail.title'); guard that
    // the aside's accessible name tracks the ACTIVE locale — Indonesian chrome ONLY under id, English
    // chrome under en — so a chrome/content locale split can never regress silently.
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })

    function renderWithLocale(locale: 'en' | 'id') {
      localStorage.setItem('mos.locale', locale)
      return render(
        <I18nProvider>
          <AuthContext.Provider value={authedState}>
            <MemoryRouter initialEntries={['/work/tasks/task-abc']}>
              <Routes>
                <Route path="/work/tasks/:taskId" element={<TaskDrawer mode="view" />} />
              </Routes>
            </MemoryRouter>
          </AuthContext.Provider>
        </I18nProvider>,
      )
    }

    const id = renderWithLocale('id')
    expect(await screen.findByRole('complementary', { name: 'Detail tugas' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Task detail' })).toBeNull()
    id.unmount()

    renderWithLocale('en')
    expect(await screen.findByRole('complementary', { name: 'Task detail' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Detail tugas' })).toBeNull()

    localStorage.removeItem('mos.locale')
  })

  it('GAP-2 (OD-91 #7): expand-in-place is retired — the drawer offers no expand/collapse toggle, only Open full page', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/work/tasks/task-abc')
    await screen.findByText('Fix the coffee machine')
    // No width toggle anywhere; the drawer stays the compact stacked record (never .record-doc).
    expect(screen.queryByRole('button', { name: /expand to full width|collapse to split/i })).toBeNull()
    expect(document.querySelector('.record-doc')).toBeNull()
    expect(document.querySelector('.dw-surface')).toBeTruthy()
  })
})

// GAP-2 (OD-REDESIGN-91 #7): expand-in-place is RETIRED. The drawer stays the compact stacked
// record at every width; the ONLY escalation to the full record document is "Open full page"
// (a navigation to the canonical /work/tasks/:id page), never an in-place width toggle.
describe('TaskDrawer — no expand-in-place (GAP-2)', () => {
  it('@≥1100px renders the COMPACT stacked drawer (never the in-place full record document)', async () => {
    stubWidths({ split: true, desktop: true })
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/work/tasks/task-abc')
    await screen.findByText('Fix the coffee machine')
    // Compact drawer: the .dw-surface stacked anatomy, NOT the full record document.
    expect(document.querySelector('.dw-surface')).toBeTruthy()
    expect(document.querySelector('.record-doc')).toBeNull()
    // The compact details panel suppresses its own identity <h1> (drawer header owns it).
    expect(document.querySelector('.record-details-compact')).toBeTruthy()
    // No width toggle exists at any width.
    expect(screen.queryByRole('button', { name: /expand to full width|collapse to split/i })).toBeNull()
  })

  it('<1100px (modal) stays the COMPACT stacked sheet with no expand toggle', async () => {
    stubWidths({ split: false, band: true, desktop: true })
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/work/tasks/task-abc')
    await screen.findByText('Fix the coffee machine')
    expect(document.querySelector('.record-doc')).toBeNull()
    expect(document.querySelector('.dw-surface')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /expand to full width/i })).toBeNull()
  })
})

// DO-4 (census-sweep R2, task-create F1): ONE create header. RecordPanelHost owns the chrome
// ("Create task" title · ✕); CreateSurface suppresses its own near-identical bar via
// showPanelUtility=false, so the doubled ~92–120px header and the second same-named close
// button are gone. GAP-2 (OD-91 #7): no expand toggle in that header at any width.
describe('TaskDrawer — single create header (DO-4), no expand toggle (GAP-2)', () => {
  it('DO-4: the create drawer renders ONE chrome bar — host-owned, no surface .dw-bar', async () => {
    renderAt('/work/tasks/new', 'create')
    const aside = await screen.findByRole('complementary', { name: /create task/i })
    // The host chrome is the one bar; the surface's duplicate bar is suppressed.
    expect(aside.querySelectorAll('.record-panel-chrome')).toHaveLength(1)
    expect(aside.querySelector('.dw-bar')).toBeNull()
    // Exactly ONE ✕ on the chrome dismiss axis (the host's own); Cancel stays in the foot.
    expect(screen.getAllByRole('button', { name: /^close/i })).toHaveLength(1)
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
  })

  it('GAP-2: the create header carries NO expand toggle at split width', async () => {
    renderAt('/work/tasks/new', 'create')
    await screen.findByRole('complementary', { name: /create task/i })
    expect(screen.queryByRole('button', { name: /expand to full width/i })).toBeNull()
  })
})

// D-B1 (OD-REDESIGN-22): the route drawer (/work/tasks/new + collapse-to-split) mounts
// RecordPanelHost directly, so before this fix Escape/close discarded a typed draft instantly
// with no confirm — the in-list overlay path already guards it. TaskDrawer now owns the same
// dirty leave-guard: a dirty create draft (or view-mode field edit) prompts "Discard unsaved
// changes?" on Escape/close, and a clean drawer still closes immediately.
describe('TaskDrawer — create/route dirty-guard (D-B1)', () => {
  it('typing a title then Escape shows the discard confirm and does NOT drop the draft', async () => {
    renderAt('/work/tasks/new', 'create')
    await screen.findByRole('complementary', { name: /create task/i })
    const title = screen.getByLabelText(/^title$/i)
    fireEvent.change(title, { target: { value: 'Draft that must not vanish' } })
    fireEvent.keyDown(title, { key: 'Escape' })
    // Guarded: the confirm appears; we did NOT leave to the list.
    expect(await screen.findByRole('dialog', { name: /discard unsaved changes/i })).toBeInTheDocument()
    expect(screen.queryByTestId('list-here')).toBeNull()
  })

  it('confirming discard leaves to the list (preserving the saved view)', async () => {
    renderAt('/work/tasks/new?view=mine', 'create')
    await screen.findByRole('complementary', { name: /create task/i })
    fireEvent.change(screen.getByLabelText(/^title$/i), { target: { value: 'Draft' } })
    fireEvent.keyDown(screen.getByLabelText(/^title$/i), { key: 'Escape' })
    const dialog = await screen.findByRole('dialog', { name: /discard unsaved changes/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /discard changes/i }))
    await waitFor(() => expect(screen.getByTestId('list-here')).toBeInTheDocument())
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/work/tasks?view=mine')
  })

  it('cancelling the confirm keeps the create drawer open with the draft intact', async () => {
    renderAt('/work/tasks/new', 'create')
    await screen.findByRole('complementary', { name: /create task/i })
    fireEvent.change(screen.getByLabelText(/^title$/i), { target: { value: 'Keep me' } })
    fireEvent.keyDown(screen.getByLabelText(/^title$/i), { key: 'Escape' })
    const dialog = await screen.findByRole('dialog', { name: /discard unsaved changes/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /^cancel$/i }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /discard unsaved changes/i })).toBeNull())
    // Still on the create drawer, draft preserved.
    expect(screen.getByRole('complementary', { name: /create task/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/^title$/i)).toHaveValue('Keep me')
    expect(screen.queryByTestId('list-here')).toBeNull()
  })

  it('the host ✕ chrome button on a DIRTY create draft also routes through the guard', async () => {
    // DO-4: the create drawer's one ✕ is the HOST's own close (the surface bar is suppressed).
    renderAt('/work/tasks/new', 'create')
    await screen.findByRole('complementary', { name: /create task/i })
    fireEvent.change(screen.getByLabelText(/^title$/i), { target: { value: 'Draft' } })
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }))
    expect(await screen.findByRole('dialog', { name: /discard unsaved changes/i })).toBeInTheDocument()
    expect(screen.queryByTestId('list-here')).toBeNull()
  })

  it('a CLEAN (untouched) create drawer still closes immediately on Escape — no confirm', async () => {
    renderAt('/work/tasks/new', 'create')
    const aside = await screen.findByRole('complementary', { name: /create task/i })
    fireEvent.keyDown(aside, { key: 'Escape' })
    await waitFor(() => expect(screen.getByTestId('list-here')).toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: /discard unsaved changes/i })).toBeNull()
  })
})

describe('TaskDrawer — focus regime (AC-110)', () => {
  it('AC-110: ≥1100px split renders a non-modal aside (no role=dialog, no aria-modal, no scrim)', async () => {
    stubWidths({ split: true, desktop: true })
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/work/tasks/task-abc')
    const aside = await screen.findByRole('complementary', { name: /task detail/i })
    expect(aside.getAttribute('role')).toBeNull()         // it IS an <aside>, not a dialog
    expect(aside.getAttribute('aria-modal')).toBeNull()
    expect(document.querySelector('.drawer-scrim')).toBeNull()
  })

  it('AC-110: <1100px renders role=dialog + aria-modal + a scrim', async () => {
    stubWidths({ split: false, band: true, desktop: true })
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/work/tasks/task-abc')
    const dialog = await screen.findByRole('dialog', { name: /task detail/i })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.querySelector('.drawer-scrim')).toBeTruthy()
  })

  it('AC-110: in the modal regime, clicking the scrim closes the drawer (→ /tasks)', async () => {
    stubWidths({ split: false, band: true, desktop: true })
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/work/tasks/task-abc')
    await screen.findByRole('dialog', { name: /task detail/i })
    fireEvent.click(document.querySelector('.drawer-scrim')!)
    await waitFor(() => expect(screen.getByTestId('list-here')).toBeInTheDocument())
  })

  it('AC-306: closing /work/tasks/task-abc?view=overdue returns to /work/tasks?view=overdue', async () => {
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/work/tasks/task-abc?view=overdue')
    await screen.findByRole('complementary', { name: /task detail/i })
    fireEvent.click(screen.getByRole('button', { name: /close \(esc\)/i }))
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/work/tasks?view=overdue'))
  })

  it('AC-307: modal scrim close preserves ?view=', async () => {
    stubWidths({ split: false, band: true, desktop: true })
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/work/tasks/task-abc?view=overdue')
    await screen.findByRole('dialog', { name: /task detail/i })
    fireEvent.click(document.querySelector('.drawer-scrim')!)
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/work/tasks?view=overdue'))
  })

  it('AC-308: modal Escape preserves ?view=', async () => {
    stubWidths({ split: false, band: true, desktop: true })
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/work/tasks/task-abc?view=overdue')
    const dialog = await screen.findByRole('dialog', { name: /task detail/i })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/work/tasks?view=overdue'))
  })

  it('AC-309: create close from /work/tasks/new?view=mine returns to /work/tasks?view=mine', async () => {
    // DO-4 journey step: the one create ✕ is now the host's own close button.
    renderAt('/work/tasks/new?view=mine', 'create')
    await screen.findByRole('complementary', { name: /create task/i })
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }))
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/work/tasks?view=mine'))
  })

  it('AC-110: in the modal regime, Esc closes the drawer', async () => {
    stubWidths({ split: false, band: true, desktop: true })
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/work/tasks/task-abc')
    const dialog = await screen.findByRole('dialog', { name: /task detail/i })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.getByTestId('list-here')).toBeInTheDocument())
  })

  it('AC-110 (overlay band 920–1100): renders the modal as a right-side sheet (drawer-sheet, not full-screen)', async () => {
    stubWidths({ split: false, band: true, desktop: true })
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/work/tasks/task-abc')
    await screen.findByRole('dialog', { name: /task detail/i })
    expect(document.querySelector('.drawer-modal.drawer-sheet')).toBeTruthy()
    expect(document.querySelector('.drawer-modal.drawer-fullscreen')).toBeNull()
  })

  it('AC-110 (mobile <768): renders the modal full-screen', async () => {
    stubWidths({ split: false, band: false, desktop: false })
    mockGetTask.mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
    renderAt('/work/tasks/task-abc')
    await screen.findByRole('dialog', { name: /task detail/i })
    expect(document.querySelector('.drawer-modal.drawer-fullscreen')).toBeTruthy()
    expect(document.querySelector('.drawer-modal.drawer-sheet')).toBeNull()
  })
})
