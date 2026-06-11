// TDD: UpdatesPage — write pane states, validation, mutations (PR-b, AC-031..038, AC-030 timing signal)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '../auth/context'
import { AuthContext } from '../auth/context'
import type { PeopleRow, RolesRow } from '../lib/database.types'
import type { MyUpdate } from '../lib/db/weeklyUpdates.types'

// ── Mock the data layer ───────────────────────────────────────────────────────
vi.mock('../lib/db/weeklyUpdates', () => ({
  getMyUpdate:    vi.fn(),
  upsertDraft:    vi.fn(),
  submit:         vi.fn(),
  reopen:         vi.fn(),
  addLine:        vi.fn(),
  updateLine:     vi.fn(),
  removeLine:     vi.fn(),
  listTeamUpdates: vi.fn(),
}))

import {
  getMyUpdate, upsertDraft, submit, reopen,
} from '../lib/db/weeklyUpdates'
import UpdatesPage from './UpdatesPage'

const mockGetMyUpdate  = vi.mocked(getMyUpdate)
const mockUpsertDraft  = vi.mocked(upsertDraft)
const mockSubmit       = vi.mocked(submit)
const mockReopen       = vi.mocked(reopen)

// ── Viewer fixtures ───────────────────────────────────────────────────────────
const VIEWER_ID = 'viewer-person-id'

const mockPerson: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'uid', full_name: 'Dina Pratiwi',
  email: 'dina@gordi.id', archived_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const mockRole: RolesRow = {
  id: 'role-1', org_id: 'org', business_unit_id: 'bu-1',
  name: 'Kitchen Lead', reports_to_role_id: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

const authedState: AuthState = {
  status: 'authenticated',
  viewer: { person: mockPerson, roles: [mockRole], isManager: false },
  signOut: async () => {},
}
const managerState: AuthState = {
  status: 'authenticated',
  viewer: { person: mockPerson, roles: [mockRole], isManager: true },
  signOut: async () => {},
}

// ── Data fixtures ─────────────────────────────────────────────────────────────
const DRAFT_UPDATE: MyUpdate = {
  update: {
    id: 'upd-1', org_id: 'org', person_id: VIEWER_ID,
    week_start: '2026-06-08',
    summary: 'Produksi stabil minggu ini',
    status: 'draft',
    submitted_at: null,
    created_by: VIEWER_ID,
    created_at: '2026-06-10T08:00:00Z', updated_at: '2026-06-10T08:00:00Z',
  },
  items: [
    { id: 'item-1', org_id: 'org', weekly_update_id: 'upd-1',
      label: 'Finalisasi menu seasonal Q3', progress: 'in_progress', position: 1,
      created_at: '2026-06-10T08:00:00Z', updated_at: '2026-06-10T08:00:00Z' },
  ],
}

// on-time submit (before Fri 17:00 WIB = 10:00:00Z)
const SUBMITTED_UPDATE: MyUpdate = {
  update: {
    ...DRAFT_UPDATE.update,
    status: 'submitted',
    submitted_at: '2026-06-12T08:00:00Z', // Fri 15:00 WIB — on time
  },
  items: DRAFT_UPDATE.items,
}

const LATE_SUBMITTED_UPDATE: MyUpdate = {
  update: {
    ...DRAFT_UPDATE.update,
    status: 'submitted',
    submitted_at: '2026-06-13T05:00:00Z', // Sat 12:00 WIB — late
  },
  items: DRAFT_UPDATE.items,
}

// ── Render helper ─────────────────────────────────────────────────────────────
function renderPage(auth: AuthState = authedState) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/updates']}>
        <UpdatesPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UpdatesPage write pane — loading state (AC-038)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading skeletons while getMyUpdate is pending (AC-038)', async () => {
    // Never resolves during this test — stays loading
    mockGetMyUpdate.mockReturnValue(new Promise(() => {}))
    renderPage()
    // Should show skeleton placeholder
    expect(screen.getByTestId('write-pane-skeleton')).toBeTruthy()
    // Save/Submit not visible while loading
    expect(screen.queryByRole('button', { name: /save draft/i })).toBeNull()
  })
})

describe('UpdatesPage write pane — error state (AC-038)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows inline error + Retry when getMyUpdate rejects (AC-038)', async () => {
    mockGetMyUpdate.mockRejectedValue(new Error('network error'))
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeTruthy()
    )
    expect(screen.getByText(/couldn't load your update/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
  })
})

describe('UpdatesPage write pane — empty (no update this week) (AC-032, AC-033)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMyUpdate.mockResolvedValue(null)
  })

  it('renders the write card with empty textarea and zero lines (AC-032)', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByLabelText(/this week's summary/i)).toBeTruthy())
    const textarea = screen.getByLabelText(/this week's summary/i)
    expect((textarea as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryAllByTestId('update-line-row')).toHaveLength(0)
  })

  it('Save draft is enabled when update is empty (AC-033)', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: /save draft/i })).toBeTruthy())
    const saveBtn = screen.getByRole('button', { name: /save draft/i })
    expect(saveBtn).not.toBeDisabled()
    expect(saveBtn.getAttribute('aria-disabled')).not.toBe('true')
  })

  it('Submit is disabled when summary is empty and zero lines (AC-033)', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: /submit update/i })).toBeTruthy())
    const submitBtn = screen.getByRole('button', { name: /submit update/i })
    // Either native disabled or aria-disabled
    const isDisabled =
      submitBtn.hasAttribute('disabled') || submitBtn.getAttribute('aria-disabled') === 'true'
    expect(isDisabled).toBe(true)
  })

  it('Submit enables after adding a summary (AC-033)', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByLabelText(/this week's summary/i)).toBeTruthy())
    const textarea = screen.getByLabelText(/this week's summary/i)
    fireEvent.change(textarea, { target: { value: 'Some summary' } })
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /submit update/i })
      const disabled = btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true'
      expect(disabled).toBe(false)
    })
  })

  it('both Save draft and Submit are co-located from first paint (AC-032, IxD bar)', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save draft/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /submit update/i })).toBeTruthy()
    })
  })
})

describe('UpdatesPage write pane — draft with content (AC-032, AC-034, AC-035)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMyUpdate.mockResolvedValue(DRAFT_UPDATE)
    mockUpsertDraft.mockResolvedValue('upd-1')
  })

  it('renders summary text and existing lines (AC-032)', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByDisplayValue('Produksi stabil minggu ini')).toBeTruthy())
    expect(screen.getAllByTestId('update-line-row')).toHaveLength(1)
    expect(screen.getByDisplayValue('Finalisasi menu seasonal Q3')).toBeTruthy()
  })

  it('Add line button is present in draft mode (AC-034)', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: /add line/i })).toBeTruthy())
  })

  it('clicking Add line appends a new line row with default in_progress marker (AC-034)', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /add line/i }))
    fireEvent.click(screen.getByRole('button', { name: /add line/i }))
    await waitFor(() =>
      expect(screen.getAllByTestId('update-line-row')).toHaveLength(2)
    )
    // The new row should have an in_progress marker
    const rows = screen.getAllByTestId('update-line-row')
    expect(rows[1].textContent).toMatch(/in progress/i)
  })

  it('Save draft dispatches upsertDraft with status draft and shows quiet confirm (AC-035)', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /save draft/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save draft/i }))
    })
    await waitFor(() => expect(mockUpsertDraft).toHaveBeenCalledOnce())
    // The call must NOT include a status field (data layer forces 'draft') — verify no status arg
    const callArg = mockUpsertDraft.mock.calls[0][0]
    expect(callArg).not.toHaveProperty('status')
    // Quiet confirm shown in aria-live region
    await waitFor(() => expect(screen.getByText(/draft saved/i)).toBeTruthy())
  })

  it('quiet Draft saved confirm is in an aria-live polite region (AC-035, a11y)', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /save draft/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save draft/i }))
    })
    await waitFor(() => screen.getByText(/draft saved/i))
    // The live region must be in the document
    const liveRegion = document.querySelector('[aria-live="polite"]')
    expect(liveRegion).toBeTruthy()
    expect(liveRegion!.textContent).toMatch(/draft saved/i)
  })

  it('Submit dispatches submit() and transitions to read-only locked state (AC-036)', async () => {
    mockSubmit.mockResolvedValue(undefined)
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /submit update/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /submit update/i }))
    })
    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith('upd-1')
      // After submit: pane should show Reopen button and no Save draft
      expect(screen.getByRole('button', { name: /reopen/i })).toBeTruthy()
      expect(screen.queryByRole('button', { name: /save draft/i })).toBeNull()
    })
  })

  it('line remove button triggers removal from list (AC-034)', async () => {
    renderPage()
    await waitFor(() => screen.getAllByTestId('update-line-row'))
    const removeBtn = screen.getByRole('button', { name: /remove line/i })
    fireEvent.click(removeBtn)
    await waitFor(() =>
      expect(screen.queryAllByTestId('update-line-row')).toHaveLength(0)
    )
  })

  it('reorder up/down buttons are present on each line row (AC-034)', async () => {
    renderPage()
    await waitFor(() => screen.getAllByTestId('update-line-row'))
    expect(screen.getByRole('button', { name: /reorder line/i })).toBeTruthy()
  })
})

describe('UpdatesPage write pane — submitted (locked) state (AC-031, AC-037)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMyUpdate.mockResolvedValue(SUBMITTED_UPDATE)
    mockReopen.mockResolvedValue(undefined)
  })

  it('summary and lines are read-only — no textarea, no line inputs (AC-031)', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: /reopen/i })).toBeTruthy())
    // No textarea — summary rendered as static text
    expect(screen.queryByLabelText(/this week's summary/i)).toBeNull()
    // No add line button
    expect(screen.queryByRole('button', { name: /add line/i })).toBeNull()
    // No remove / reorder buttons
    expect(screen.queryByRole('button', { name: /remove line/i })).toBeNull()
  })

  it('Reopen button is shown, Save draft and Submit are not (AC-031)', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: /reopen/i })).toBeTruthy())
    expect(screen.queryByRole('button', { name: /save draft/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /submit update/i })).toBeNull()
  })

  it('Reopen dispatches reopen() and returns to editable state (AC-037)', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /reopen/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /reopen/i }))
    })
    await waitFor(() => {
      expect(mockReopen).toHaveBeenCalledWith('upd-1')
      // Back to editable: Save draft visible again
      expect(screen.getByRole('button', { name: /save draft/i })).toBeTruthy()
    })
  })

  it('submitted on-time shows "on time" signal (§2.5 design-plan)', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: /reopen/i })).toBeTruthy())
    expect(screen.getByText(/on time/i)).toBeTruthy()
  })
})

describe('UpdatesPage write pane — submitted late signal (§2.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMyUpdate.mockResolvedValue(LATE_SUBMITTED_UPDATE)
  })

  it('submitted late shows "late" signal (§2.5 design-plan)', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: /reopen/i })).toBeTruthy())
    expect(screen.getByText(/late/i)).toBeTruthy()
  })
})

describe('UpdatesPage write pane — save error on draft (coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMyUpdate.mockResolvedValue(DRAFT_UPDATE)
    mockUpsertDraft.mockRejectedValue(new Error('network error'))
  })

  it('shows inline error alert when Save draft fails (§5.1 error state)', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /save draft/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save draft/i }))
    })
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  })
})

describe('UpdatesPage write pane — reorder lines (AC-034)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Two lines to test reorder
    mockGetMyUpdate.mockResolvedValue({
      ...DRAFT_UPDATE,
      items: [
        { id: 'item-1', org_id: 'org', weekly_update_id: 'upd-1', label: 'First line', progress: 'done', position: 1, created_at: '', updated_at: '' },
        { id: 'item-2', org_id: 'org', weekly_update_id: 'upd-1', label: 'Second line', progress: 'in_progress', position: 2, created_at: '', updated_at: '' },
      ],
    })
  })

  it('renders two line rows with reorder handles (AC-034)', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByTestId('update-line-row')).toHaveLength(2))
    const handles = screen.getAllByRole('button', { name: /reorder line/i })
    expect(handles).toHaveLength(2)
  })

  it('keyboard reorder — ArrowUp on first handle does not crash (AC-034)', async () => {
    renderPage()
    await waitFor(() => screen.getAllByRole('button', { name: /reorder line/i }))
    const handles = screen.getAllByRole('button', { name: /reorder line/i })
    fireEvent.keyDown(handles[0], { key: 'ArrowUp' }) // no-op on first
    // Still 2 rows
    expect(screen.getAllByTestId('update-line-row')).toHaveLength(2)
  })

  it('keyboard reorder — ArrowDown on second handle does not crash (AC-034)', async () => {
    renderPage()
    await waitFor(() => screen.getAllByRole('button', { name: /reorder line/i }))
    const handles = screen.getAllByRole('button', { name: /reorder line/i })
    fireEvent.keyDown(handles[1], { key: 'ArrowDown' }) // no-op on last
    expect(screen.getAllByTestId('update-line-row')).toHaveLength(2)
  })
})

describe('UpdatesPage — page structure (§1 design-plan)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMyUpdate.mockResolvedValue(null)
  })

  it('page title is "Weekly update" (§1.1 design-plan)', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('heading', { level: 1 }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/weekly update/i)
  })

  it('write pane section has accessible label (a11y)', async () => {
    renderPage()
    await waitFor(() => screen.getByLabelText(/my weekly update/i))
    expect(screen.getByLabelText(/my weekly update/i)).toBeTruthy()
  })

  it('review pane is NOT rendered for non-manager (§3 design-plan, FR-030)', async () => {
    renderPage(authedState) // isManager: false
    // No review pane section
    await waitFor(() => screen.getByLabelText(/my weekly update/i))
    expect(screen.queryByLabelText(/team updates/i)).toBeNull()
  })

  it('review pane placeholder IS present for manager (§3 seam for PR-c)', async () => {
    renderPage(managerState) // isManager: true
    await waitFor(() => screen.getByLabelText(/my weekly update/i))
    // Manager sees review section caption or placeholder
    expect(screen.getByTestId('review-pane-placeholder')).toBeTruthy()
  })
})

describe('UpdatesPage write pane — week navigation (T-052)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMyUpdate.mockResolvedValue(null)
  })

  it('renders a week label pill in the write card head (§1.2 design-plan)', async () => {
    renderPage()
    await waitFor(() => screen.getByLabelText(/my weekly update/i))
    // The week pill shows a week range
    const weekPill = screen.getByTestId('week-pill')
    expect(weekPill.textContent).toMatch(/week of/i)
  })
})

// ── FIX 1: locked view derives from local state (single source of truth) ──────
describe('UpdatesPage write pane — locked view reflects locally-added lines (FIX-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Start from a draft with NO lines
    mockGetMyUpdate.mockResolvedValue({
      update: {
        id: 'upd-new', org_id: 'org', person_id: VIEWER_ID,
        week_start: '2026-06-08', summary: 'Starting summary',
        status: 'draft', submitted_at: null,
        created_by: VIEWER_ID,
        created_at: '2026-06-10T08:00:00Z', updated_at: '2026-06-10T08:00:00Z',
      },
      items: [],
    })
    mockUpsertDraft.mockResolvedValue('upd-new')
    mockSubmit.mockResolvedValue(undefined)
  })

  it('newly added line is visible in the locked read-only view after submit (FIX-1)', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /add line/i }))

    // Add a new line
    fireEvent.click(screen.getByRole('button', { name: /add line/i }))
    await waitFor(() => screen.getAllByTestId('update-line-row'))
    const lineInput = screen.getByRole('textbox', { name: /update line text/i })
    fireEvent.change(lineInput, { target: { value: 'Brand new line added locally' } })

    // Submit
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /submit update/i }))
    })

    // After submit the locked view must show the new line (FIX-1: single source of truth)
    await waitFor(() => expect(screen.getByRole('button', { name: /reopen/i })).toBeTruthy())
    const staticRows = screen.getAllByTestId('update-line-row-static')
    expect(staticRows.some(r => r.textContent?.includes('Brand new line added locally'))).toBe(true)
  })
})

// ── FIX 3: Reopen busy-guard ───────────────────────────────────────────────────
describe('UpdatesPage write pane — Reopen busy-guard (FIX-3)', () => {
  it('Reopen button is disabled while a reopen call is in-flight (FIX-3)', async () => {
    vi.clearAllMocks()
    mockGetMyUpdate.mockResolvedValue(SUBMITTED_UPDATE)
    // Reopen never resolves during this test — stays busy
    mockReopen.mockReturnValue(new Promise(() => {}))

    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /reopen/i }))

    // Click reopen — it goes in-flight
    fireEvent.click(screen.getByRole('button', { name: /reopen/i }))

    // While in-flight the button must be disabled (native or aria-disabled)
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /reopen/i })
      const isDisabled = btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true'
      expect(isDisabled).toBe(true)
    })
  })
})
