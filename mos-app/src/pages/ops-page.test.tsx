// OpsPage + OpsAddForm unit tests — TDD, AC-tagged (P2-3b)
// All behavior assertions; no mocks-of-themselves.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AuthState } from '@/auth/context'

vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('../lib/db/ops-log', () => ({
  listLogEntries: vi.fn(),
  addLogEntry: vi.fn(),
  editLogEntry: vi.fn(),
  archiveLogEntry: vi.fn(),
  unarchiveLogEntry: vi.fn(),
  getTodayOpsSummary: vi.fn(),
}))
import { listLogEntries, addLogEntry, archiveLogEntry } from '@/lib/db/ops-log'

vi.mock('../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
}))
import { getBusinessUnits } from '@/lib/db/directory'

vi.mock('../lib/db/tasks', () => ({
  listTasks: vi.fn(),
  createTask: vi.fn(),
  getTask: vi.fn(),
  archiveTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateTaskFields: vi.fn(),
  updateTaskRaci: vi.fn(),
  getTaskTitlesByIds: vi.fn(),
}))
import { getTaskTitlesByIds, listTasks } from '@/lib/db/tasks'

const mockUseAuth = vi.mocked(useAuth)
const mockListLogEntries = vi.mocked(listLogEntries)
const mockAddLogEntry = vi.mocked(addLogEntry)
const mockArchiveLogEntry = vi.mocked(archiveLogEntry)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockGetTaskTitlesByIds = vi.mocked(getTaskTitlesByIds)
const mockListTasks = vi.mocked(listTasks)

// useIsDesktop reads matchMedia('(min-width: 768px)') synchronously on first paint.
// applyViewport(true) = desktop (≥768px); applyViewport(false) = phone (~390px).
function applyViewport(isDesktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(min-width: 768px)' ? isDesktop : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}
applyViewport(true) // desktop by default

const VIEWER: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: '40000000-0000-0000-0000-000000000001',
      org_id: '10000000-0000-0000-0000-000000000001',
      user_id: 'auth-user-001',
      full_name: 'Cahya Cafe',
      email: 'cahya@gordi.id',
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    roles: [
      {
        id: 'role-001',
        org_id: '10000000-0000-0000-0000-000000000001',
        business_unit_id: '20000000-0000-0000-0000-000000000001',
        name: 'Cafe Ops Lead',
        reports_to_role_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    isManager: false,
    accessRoles: [],
  },
  signOut: vi.fn(),
}

const BU_KITCHEN = { id: '20000000-0000-0000-0000-000000000001', name: 'Kitchen and Bar' }
const BU_ROASTERY = { id: '20000000-0000-0000-0000-000000000002', name: 'Roastery' }

const ENTRY_1 = {
  id: 'e-001',
  org_id: '10000000-0000-0000-0000-000000000001',
  business_unit_id: BU_KITCHEN.id,
  origin: 'manual' as const,
  event_type: 'qc' as const,
  title: 'Roast batch Ethiopia Guji selesai QC',
  detail: null,
  occurred_at: '2026-06-12T05:00:00Z', // 12:00 WIB
  needs_attention: false,
  linked_task_id: null,
  archived_at: null,
  created_by: '40000000-0000-0000-0000-000000000001',
  created_at: '2026-06-12T05:00:00Z',
  updated_at: '2026-06-12T05:00:00Z',
}

const ENTRY_2 = {
  ...ENTRY_1,
  id: 'e-002',
  event_type: 'production' as const,
  title: 'Batch produksi selesai',
  occurred_at: '2026-06-12T04:00:00Z', // 11:00 WIB (older)
  business_unit_id: BU_ROASTERY.id,
}

const ENTRY_3 = {
  ...ENTRY_1,
  id: 'e-003',
  event_type: 'follow_up' as const,
  title: 'Stock opname tertunda',
  occurred_at: '2026-06-12T06:00:00Z', // 13:00 WIB (newest)
  needs_attention: true,
}

import { OpsPage } from './ops-page'
import { OpsAddForm } from './ops-add-form'

async function renderOps(auth: AuthState = VIEWER) {
  mockUseAuth.mockReturnValue(auth)
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(
      <MemoryRouter initialEntries={['/ops']}>
        <Routes>
          <Route path="/ops" element={<OpsPage />} />
          <Route path="/ops/new" element={<OpsAddForm />} />
        </Routes>
      </MemoryRouter>,
    )
    await Promise.resolve()
  })
  return utils
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetBusinessUnits.mockResolvedValue([BU_KITCHEN, BU_ROASTERY])
  mockGetTaskTitlesByIds.mockResolvedValue([])
  mockListTasks.mockResolvedValue([]) // add-form linked-task picker source (FR-045)
  // Default: 3 entries, newest first
  mockListLogEntries.mockResolvedValue([ENTRY_3, ENTRY_1, ENTRY_2])
})

afterEach(() => applyViewport(true)) // restore desktop so phone tests don't leak

// ── AC-060: feed renders newest-first with source badge, type, title ──────────
describe('AC-060: feed renders newest-first with source badge, type, title', () => {
  it('renders rows in occurred_at desc order, each showing BU name, type, title', async () => {
    await renderOps()
    await waitFor(() => {
      // All 3 titles present
      expect(screen.getByText('Stock opname tertunda')).toBeInTheDocument()
      expect(screen.getByText('Roast batch Ethiopia Guji selesai QC')).toBeInTheDocument()
      expect(screen.getByText('Batch produksi selesai')).toBeInTheDocument()
    })

    // Source badge: BU name text present
    const badges = screen.getAllByTestId('ops-source-badge')
    expect(badges.length).toBeGreaterThan(0)

    // Type text present (muted, not a badge)
    expect(screen.getAllByTestId('ops-type-text').length).toBeGreaterThan(0)

    // WIB time on each row: UTC 06/05/04:00Z → 13:00/12:00/11:00 WIB (proves +7 shift)
    expect(screen.getByText('13:00')).toBeInTheDocument()
    expect(screen.getByText('12:00')).toBeInTheDocument()
    expect(screen.getByText('11:00')).toBeInTheDocument()
  })

  it('orders rows newest-first on screen', async () => {
    await renderOps()
    await waitFor(() => expect(screen.getByText('Stock opname tertunda')).toBeInTheDocument())

    const items = screen.getAllByRole('listitem')
    const texts = items.map(li => li.textContent ?? '')
    const idxNewest = texts.findIndex(t => t.includes('Stock opname tertunda'))
    const idxMiddle = texts.findIndex(t => t.includes('Roast batch Ethiopia Guji selesai QC'))
    const idxOldest = texts.findIndex(t => t.includes('Batch produksi selesai'))
    expect(idxNewest).toBeLessThan(idxMiddle)
    expect(idxMiddle).toBeLessThan(idxOldest)
  })
})

// ── AC-061: detail meta line (muted, mono for IDs) ───────────────────────────
describe('AC-061: detail meta line renders', () => {
  it('renders detail text when present', async () => {
    mockListLogEntries.mockResolvedValue([
      { ...ENTRY_1, detail: 'Batch #R-882 · 25.0 kg' },
    ])
    await renderOps()
    await waitFor(() =>
      expect(screen.getByText(/Batch #R-882/)).toBeInTheDocument(),
    )
  })

  it('omits detail line when null', async () => {
    mockListLogEntries.mockResolvedValue([{ ...ENTRY_1, detail: null }])
    await renderOps()
    await waitFor(() => expect(screen.getByText(ENTRY_1.title)).toBeInTheDocument())
    expect(screen.queryByTestId('ops-detail')).not.toBeInTheDocument()
  })
})

// ── AC-062: needs-attention amber tint + left rule ────────────────────────────
describe('AC-062: needs-attention row carries amber tint + left rule', () => {
  it('needs_attention=true → row has data-attn attribute', async () => {
    mockListLogEntries.mockResolvedValue([ENTRY_3])
    await renderOps()
    await waitFor(() => expect(screen.getByText('Stock opname tertunda')).toBeInTheDocument())
    const attnRow = document.querySelector('[data-attn="true"]')
    expect(attnRow).not.toBeNull()
  })

  it('needs_attention=false → no data-attn', async () => {
    mockListLogEntries.mockResolvedValue([ENTRY_1])
    await renderOps()
    await waitFor(() => expect(screen.getByText(ENTRY_1.title)).toBeInTheDocument())
    expect(document.querySelector('[data-attn="true"]')).toBeNull()
  })

  it('needs-attention row has a sr-only "Needs attention" label (not color-only, WCAG SC 1.4.1)', async () => {
    mockListLogEntries.mockResolvedValue([ENTRY_3])
    await renderOps()
    await waitFor(() => expect(screen.getByText('Stock opname tertunda')).toBeInTheDocument())
    // sr-only text communicates the state to AT
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
  })
})

// ── AC-063: linked-task reference client-side resolved (no embed) ────────────
describe('AC-063: linked-task reference rendered from client-side resolve (no cross-schema embed)', () => {
  it('renders linked task title as a link when resolved', async () => {
    mockGetTaskTitlesByIds.mockResolvedValue([
      { id: 'task-9', title: 'SOP stock opname', status: 'Blocked' },
    ])
    mockListLogEntries.mockResolvedValue([{ ...ENTRY_1, linked_task_id: 'task-9' }])
    await renderOps()
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /SOP stock opname/i })).toBeInTheDocument(),
    )
    // No cross-schema embed: getTaskTitlesByIds called with the task ids
    expect(mockGetTaskTitlesByIds).toHaveBeenCalledWith(['task-9'])
  })

  it('omits linked-task line when linked_task_id is null', async () => {
    mockListLogEntries.mockResolvedValue([{ ...ENTRY_1, linked_task_id: null }])
    await renderOps()
    await waitFor(() => expect(screen.getByText(ENTRY_1.title)).toBeInTheDocument())
    expect(screen.queryByTestId('linked-task-ref')).not.toBeInTheDocument()
  })
})

// ── AC-064: source and type filters narrow the feed ───────────────────────────
describe('AC-064: source and type filters narrow the feed', () => {
  it('selecting a source filter calls listLogEntries with businessUnitId', async () => {
    await renderOps()
    await waitFor(() => expect(screen.getByText(ENTRY_1.title)).toBeInTheDocument())

    // Clear previous calls
    mockListLogEntries.mockClear()
    mockListLogEntries.mockResolvedValue([ENTRY_1])

    const sourceSelect = screen.getByLabelText(/business unit/i)
    fireEvent.change(sourceSelect, { target: { value: BU_KITCHEN.id } })

    await waitFor(() => {
      expect(mockListLogEntries).toHaveBeenCalledWith(
        expect.objectContaining({ businessUnitId: BU_KITCHEN.id }),
      )
    })
  })

  it('selecting a type filter calls listLogEntries with eventType', async () => {
    await renderOps()
    await waitFor(() => expect(screen.getByText(ENTRY_1.title)).toBeInTheDocument())

    mockListLogEntries.mockClear()
    mockListLogEntries.mockResolvedValue([ENTRY_1])

    const typeSelect = screen.getByLabelText(/type/i)
    fireEvent.change(typeSelect, { target: { value: 'qc' } })

    await waitFor(() => {
      expect(mockListLogEntries).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'qc' }),
      )
    })
  })

  it('selecting "All" clears the source filter', async () => {
    await renderOps()
    await waitFor(() => expect(screen.getByText(ENTRY_1.title)).toBeInTheDocument())

    const sourceSelect = screen.getByLabelText(/business unit/i)
    fireEvent.change(sourceSelect, { target: { value: BU_KITCHEN.id } })

    mockListLogEntries.mockClear()
    mockListLogEntries.mockResolvedValue([ENTRY_3, ENTRY_1, ENTRY_2])

    fireEvent.change(sourceSelect, { target: { value: '' } })

    await waitFor(() => {
      const calls = mockListLogEntries.mock.calls
      const last = calls.at(-1)?.[0] ?? {}
      expect(last.businessUnitId).toBeFalsy()
    })
  })
})

// ── AC-065: archived toggle reveals archived entries ─────────────────────────
describe('AC-065: archived toggle reveals archived entries', () => {
  it('toggle off hides archived; on calls listLogEntries({ includeArchived: true })', async () => {
    await renderOps()
    await waitFor(() => expect(screen.getByText(ENTRY_1.title)).toBeInTheDocument())

    const archivedEntry = { ...ENTRY_1, id: 'e-arch', archived_at: '2026-06-12T03:00:00Z', title: 'Archived entry' }
    mockListLogEntries.mockResolvedValue([archivedEntry])

    const toggle = screen.getByLabelText(/show archived/i)
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(mockListLogEntries).toHaveBeenCalledWith(
        expect.objectContaining({ includeArchived: true }),
      )
    })
  })

  it('archived entries show an "Archived" tag', async () => {
    const archivedEntry = { ...ENTRY_1, id: 'e-arch', archived_at: '2026-06-12T03:00:00Z', title: 'Archived entry' }
    // First load: normal entry; second load (after toggle): archived entry
    mockListLogEntries
      .mockResolvedValueOnce([ENTRY_1])
      .mockResolvedValueOnce([archivedEntry])
    await renderOps()
    await waitFor(() => expect(screen.getByText('Roast batch Ethiopia Guji selesai QC')).toBeInTheDocument())

    const toggle = screen.getByLabelText(/show archived/i)
    fireEvent.click(toggle)

    await waitFor(() => expect(screen.getByText('Archived entry')).toBeInTheDocument())
    expect(screen.getByText('Archived')).toBeInTheDocument()
  })
})

// ── AC-066: feed empty / loading / error states ───────────────────────────────
describe('AC-066: feed empty/loading/error states', () => {
  it('loading state: shows skeleton with aria-busy', async () => {
    // Never resolves
    mockListLogEntries.mockImplementation(() => new Promise(() => {}))
    mockUseAuth.mockReturnValue(VIEWER)
    render(
      <MemoryRouter initialEntries={['/ops']}>
        <Routes>
          <Route path="/ops" element={<OpsPage />} />
        </Routes>
      </MemoryRouter>,
    )
    const busyEl = await screen.findByRole('status')
    expect(busyEl).toHaveTextContent(/loading/i)
  })

  it('error state: shows inline error banner with Retry', async () => {
    mockListLogEntries.mockRejectedValue(new Error('network error'))
    await renderOps()
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load the Daily Log/i),
    )
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('error state: toolbar/filters remain usable (not unmounted)', async () => {
    mockListLogEntries.mockRejectedValue(new Error('fail'))
    await renderOps()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    // Filters still rendered
    expect(screen.getByLabelText(/business unit/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/type/i)).toBeInTheDocument()
  })

  it('empty state: shows "No log entries yet today." with add CTA', async () => {
    mockListLogEntries.mockResolvedValue([])
    await renderOps()
    await waitFor(() =>
      expect(screen.getByText(/No log entries yet today/i)).toBeInTheDocument(),
    )
    // Multiple "add log entry" links may exist (toolbar + empty state); just ensure at least one
    const addLinks = screen.getAllByRole('link', { name: /add log entry/i })
    expect(addLinks.length).toBeGreaterThanOrEqual(1)
  })

  it('filtered empty state shows Clear filters and resets the query to unfiltered', async () => {
    await renderOps()
    await waitFor(() => expect(screen.getByText(ENTRY_1.title)).toBeInTheDocument())

    mockListLogEntries.mockClear()
    mockListLogEntries.mockResolvedValue([])
    fireEvent.change(screen.getByLabelText(/business unit/i), { target: { value: BU_KITCHEN.id } })

    await waitFor(() => {
      expect(screen.getByText(/No Kitchen and Bar log entries match/i)).toBeInTheDocument()
    })

    mockListLogEntries.mockClear()
    mockListLogEntries.mockResolvedValue([ENTRY_3, ENTRY_1, ENTRY_2])
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }))

    await waitFor(() => {
      expect(mockListLogEntries).toHaveBeenCalledWith({ includeArchived: false })
    })
  })
})

// ── AC-067: phone reflow with 44px add target ─────────────────────────────────
describe('AC-067: phone reflow with 44px add target', () => {
  it('at ~390px, rows use the phone block layout (not the desktop row)', async () => {
    applyViewport(false) // phone
    const { container } = await renderOps()
    await waitFor(() => expect(screen.getByText(ENTRY_1.title)).toBeInTheDocument())

    // Rows reflow to the phone block layout, and the desktop row layout is absent
    expect(container.querySelectorAll('.ops-row-inner--phone').length).toBe(3)
    expect(container.querySelector('.ops-row-inner--desktop')).toBeNull()
  })

  it('at ~390px, the needs-attention tint is preserved on the reflowed row', async () => {
    applyViewport(false) // phone
    const { container } = await renderOps()
    await waitFor(() => expect(screen.getByText('Stock opname tertunda')).toBeInTheDocument())
    // ENTRY_3 (needs_attention) keeps its amber row treatment in phone layout
    expect(container.querySelector('.ops-row--attn[data-attn="true"]')).not.toBeNull()
  })

  it('at ~390px, exposes the sticky 44px "+ Add log entry" submit bar', async () => {
    applyViewport(false) // phone
    const { container } = await renderOps()
    await waitFor(() => expect(screen.getByText(ENTRY_1.title)).toBeInTheDocument())

    // The phone-only full-width submit bar exists (min-height 44px target, FR-038)…
    const submitBar = container.querySelector('.ops-submit-bar')
    expect(submitBar).not.toBeNull()
    const submitBtn = submitBar!.querySelector('.btn-primary') as HTMLElement | null
    expect(submitBtn).not.toBeNull()
    expect(submitBtn).toHaveAccessibleName(/add log entry/i)
    // …and the desktop toolbar add button is NOT rendered at phone width
    expect(container.querySelector('.ops-toolbar-add')).toBeNull()
  })

  it('at ~390px, renders row actions in their own in-flow container with 44px touch targets', async () => {
    applyViewport(false)
    const { container } = await renderOps()
    await waitFor(() => expect(screen.getByText(ENTRY_1.title)).toBeInTheDocument())

    const row = screen.getByText(ENTRY_1.title).closest('.ops-row') as HTMLElement
    const actions = row.querySelector('[data-testid="ops-row-actions"]') as HTMLElement | null
    expect(actions).not.toBeNull()
    expect(actions).toHaveClass('ops-row-actions', 'ops-row-actions--phone')
    expect(actions?.classList.contains('ops-row-actions--overlay')).toBe(false)

    const edit = within(actions as HTMLElement).getByRole('link', { name: /edit/i })
    const archive = within(actions as HTMLElement).getByRole('button', { name: /archive/i })
    expect(edit).toHaveClass('ops-edit-btn', 'ops-edit-btn--touch')
    expect(archive).toHaveClass('ops-archive-btn', 'ops-archive-btn--touch')

    expect(container.querySelector('.ops-row-actions--overlay')).toBeNull()
  })

  it('on desktop, rows use the desktop row layout (control case)', async () => {
    const { container } = await renderOps() // desktop default
    await waitFor(() => expect(screen.getByText(ENTRY_1.title)).toBeInTheDocument())
    expect(container.querySelectorAll('.ops-row-inner--desktop').length).toBe(3)
    expect(container.querySelector('.ops-row-inner--phone')).toBeNull()
    expect(container.querySelector('.ops-submit-bar')).toBeNull()
  })

  it('the feed has proper ARIA list structure', async () => {
    await renderOps()
    await waitFor(() => expect(screen.getByText(ENTRY_1.title)).toBeInTheDocument())
    expect(screen.getByRole('list', { name: /daily log/i })).toBeInTheDocument()
  })
})

// ── AC-070: add-form defaults (primary BU, other, now) ────────────────────────
describe('AC-070: add-form defaults (primary BU, other, now)', () => {
  async function renderAddForm(auth: AuthState = VIEWER) {
    mockUseAuth.mockReturnValue(auth)
    let utils!: ReturnType<typeof render>
    await act(async () => {
      utils = render(
        <MemoryRouter initialEntries={['/ops/new']}>
          <Routes>
            <Route path="/ops" element={<OpsPage />} />
            <Route path="/ops/new" element={<OpsAddForm />} />
          </Routes>
        </MemoryRouter>,
      )
      await Promise.resolve()
    })
    return utils
  }

  it('business unit defaults to the creator\'s primary unit', async () => {
    await renderAddForm()
    await waitFor(() => expect(screen.getByLabelText(/business unit/i)).toBeInTheDocument())
    const buSelect = screen.getByLabelText(/business unit/i) as HTMLSelectElement
    expect(buSelect.value).toBe('20000000-0000-0000-0000-000000000001')
  })

  it('event type defaults to "Other"', async () => {
    await renderAddForm()
    await waitFor(() => expect(screen.getByLabelText(/^type$/i)).toBeInTheDocument())
    const typeSelect = screen.getByLabelText(/^type$/i) as HTMLSelectElement
    expect(typeSelect.value).toBe('other')
  })

  it('occurred_at defaults to now (datetime-local input present)', async () => {
    await renderAddForm()
    await waitFor(() => expect(screen.getByLabelText(/occurred at/i)).toBeInTheDocument())
    const dtInput = screen.getByLabelText(/occurred at/i) as HTMLInputElement
    expect(dtInput.type).toBe('datetime-local')
    expect(dtInput.value).toBeTruthy()
  })
})

// ── AC-071: submit disabled until title + business unit present ───────────────
describe('AC-071: submit disabled until title + business unit present', () => {
  async function renderAddForm() {
    mockUseAuth.mockReturnValue(VIEWER)
    let utils!: ReturnType<typeof render>
    await act(async () => {
      utils = render(
        <MemoryRouter initialEntries={['/ops/new']}>
          <Routes>
            <Route path="/ops" element={<OpsPage />} />
            <Route path="/ops/new" element={<OpsAddForm />} />
          </Routes>
        </MemoryRouter>,
      )
      await Promise.resolve()
    })
    return utils
  }

  it('submit is disabled when title is blank', async () => {
    await renderAddForm()
    await waitFor(() => expect(screen.getByRole('button', { name: /add log entry/i })).toBeInTheDocument())
    const submit = screen.getByRole('button', { name: /add log entry/i })
    expect(submit).toBeDisabled()
  })

  it('submit becomes enabled when title is filled', async () => {
    await renderAddForm()
    await waitFor(() => expect(screen.getByLabelText(/title/i)).toBeInTheDocument())
    const titleInput = screen.getByLabelText(/title/i)
    fireEvent.change(titleInput, { target: { value: 'Something happened' } })
    const submit = screen.getByRole('button', { name: /add log entry/i })
    expect(submit).not.toBeDisabled()
  })

  it('submit stays disabled when no Business Unit is chosen (even with a title), then enables once one is picked', async () => {
    // A creator with no role has no primary BU → the BU select starts empty.
    const VIEWER_NO_BU: AuthState = {
      ...VIEWER,
      viewer: { ...VIEWER.viewer, roles: [] },
    }
    mockUseAuth.mockReturnValue(VIEWER_NO_BU)
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/ops/new']}>
          <Routes>
            <Route path="/ops" element={<OpsPage />} />
            <Route path="/ops/new" element={<OpsAddForm />} />
          </Routes>
        </MemoryRouter>,
      )
      await Promise.resolve()
    })
    await waitFor(() => expect(screen.getByLabelText(/title/i)).toBeInTheDocument())

    const buSelect = screen.getByLabelText(/business unit/i) as HTMLSelectElement
    expect(buSelect.value).toBe('') // no primary BU

    // Title present but BU still empty → submit disabled
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Floor incident' } })
    const submit = screen.getByRole('button', { name: /add log entry/i })
    expect(submit).toBeDisabled()

    // Choosing a BU satisfies the inline-required field → submit enables
    fireEvent.change(buSelect, { target: { value: BU_KITCHEN.id } })
    expect(submit).not.toBeDisabled()
  })
})

// ── AC-072: add-form submits needs-attention/occurred_at/linked-task ──────────
describe('AC-072: add-form submits needs-attention/occurred_at/linked-task', () => {
  async function renderAddForm() {
    mockUseAuth.mockReturnValue(VIEWER)
    let utils!: ReturnType<typeof render>
    await act(async () => {
      utils = render(
        <MemoryRouter initialEntries={['/ops/new']}>
          <Routes>
            <Route path="/ops" element={<OpsPage />} />
            <Route path="/ops/new" element={<OpsAddForm />} />
          </Routes>
        </MemoryRouter>,
      )
      await Promise.resolve()
    })
    return utils
  }

  it('dispatches correct payload including needs_attention, occurredAt, never org_id/created_by', async () => {
    mockAddLogEntry.mockResolvedValue('new-entry-id')
    await renderAddForm()
    await waitFor(() => expect(screen.getByLabelText(/title/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Floor incident logged' } })

    const naCheckbox = screen.getByLabelText(/needs attention/i)
    fireEvent.click(naCheckbox)

    await act(async () => {
      fireEvent.submit(screen.getByRole('form', { name: /add log entry/i }))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mockAddLogEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Floor incident logged',
          needsAttention: true,
          businessUnitId: expect.any(String),
          eventType: expect.any(String),
        }),
      )
      // origin is 'manual' implicit — the form never sends org_id/created_by
      const call = mockAddLogEntry.mock.calls[0][0]
      expect(Object.keys(call)).not.toContain('org_id')
      expect(Object.keys(call)).not.toContain('created_by')
    })
  })
})

// ── AC-073: new entry appears in feed without full reload ─────────────────────
describe('AC-073: new entry appears in feed without full reload', () => {
  it('after successful submit, feed re-fetches and shows new entry', async () => {
    const newEntry = {
      ...ENTRY_1,
      id: 'e-new',
      title: 'Newly logged item',
      occurred_at: '2026-06-12T07:00:00Z',
    }
    // First call: initial load; second call: after submit
    mockListLogEntries
      .mockResolvedValueOnce([ENTRY_1])
      .mockResolvedValueOnce([newEntry, ENTRY_1])
    mockAddLogEntry.mockResolvedValue('e-new')

    await renderOps()
    await waitFor(() => expect(screen.getByText(ENTRY_1.title)).toBeInTheDocument())

    // Navigate to add form
    const addLink = screen.getAllByRole('link', { name: /add log entry/i })[0]
    fireEvent.click(addLink)

    await waitFor(() => expect(screen.getByLabelText(/title/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Newly logged item' } })

    await act(async () => {
      fireEvent.submit(screen.getByRole('form', { name: /add log entry/i }))
      await Promise.resolve()
    })

    // After submit, navigates back to /ops and re-fetches
    await waitFor(() => {
      expect(screen.getByText('Newly logged item')).toBeInTheDocument()
    }, { timeout: 3000 })
  })
})

// ── Edit/archive affordance: archive row ──────────────────────────────────────
describe('Archive affordance (author-gated)', () => {
  it('shows archive button on own entry and calls archiveLogEntry', async () => {
    mockListLogEntries
      .mockResolvedValueOnce([ENTRY_1]) // initial
      .mockResolvedValueOnce([]) // after archive re-fetch
    mockArchiveLogEntry.mockResolvedValue()

    await renderOps()
    await waitFor(() => expect(screen.getByText(ENTRY_1.title)).toBeInTheDocument())

    const archiveBtn = screen.getByRole('button', { name: /archive/i })
    await act(async () => {
      fireEvent.click(archiveBtn)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mockArchiveLogEntry).toHaveBeenCalledWith(ENTRY_1.id)
    })
  })
})
