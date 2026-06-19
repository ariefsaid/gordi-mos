// OpsAddForm unit tests — TDD, AC-tagged (P2-3b)
// Tests for add/edit modes, linked-task picker (FR-045/AC-072)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AuthState } from '@/auth/context'

vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('../lib/db/ops-log', () => ({
  addLogEntry: vi.fn(),
  editLogEntry: vi.fn(),
  getLogEntry: vi.fn(),
}))
import { addLogEntry, editLogEntry, getLogEntry } from '@/lib/db/ops-log'

vi.mock('../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
}))
import { getBusinessUnits } from '@/lib/db/directory'

vi.mock('../lib/db/tasks', () => ({
  listTasks: vi.fn(),
  getTaskTitlesByIds: vi.fn(),
}))
import { listTasks } from '@/lib/db/tasks'

const mockUseAuth = vi.mocked(useAuth)
const mockAddLogEntry = vi.mocked(addLogEntry)
const mockEditLogEntry = vi.mocked(editLogEntry)
const mockGetLogEntry = vi.mocked(getLogEntry)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockListTasks = vi.mocked(listTasks)

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
  },
  signOut: vi.fn(),
}

const BU_KITCHEN = { id: '20000000-0000-0000-0000-000000000001', name: 'Kitchen and Bar' }

const TASK_1 = {
  id: 'task-001',
  org_id: '10000000-0000-0000-0000-000000000001',
  title: 'SOP stock opname',
  business_unit_id: BU_KITCHEN.id,
  status: 'Blocked' as const,
  responsible_person_id: '40000000-0000-0000-0000-000000000001',
  accountable_person_id: '40000000-0000-0000-0000-000000000001',
  consulted_person_ids: [],
  informed_person_ids: [],
  description: null,
  due_date: null,
  last_activity_at: '2026-06-12T00:00:00Z',
  archived_at: null,
  created_by: '40000000-0000-0000-0000-000000000001',
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
}

import { OpsAddForm } from './ops-add-form'

async function renderAddForm(auth: AuthState = VIEWER) {
  mockUseAuth.mockReturnValue(auth)
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(
      <MemoryRouter initialEntries={['/ops/new']}>
        <Routes>
          <Route path="/ops" element={<div>Ops Page</div>} />
          <Route path="/ops/new" element={<OpsAddForm />} />
          <Route path="/ops/:id/edit" element={<OpsAddForm />} />
        </Routes>
      </MemoryRouter>,
    )
    await Promise.resolve()
  })
  return utils
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetBusinessUnits.mockResolvedValue([BU_KITCHEN])
  mockListTasks.mockResolvedValue([])
})

// ── AC-072: linked-task picker in add form ─────────────────────────────────────
describe('FR-045/AC-072: linked-task picker in add form', () => {
  it('loads tasks for the linked-task picker', async () => {
    mockListTasks.mockResolvedValue([TASK_1])
    await renderAddForm()
    await waitFor(() => expect(screen.getByLabelText(/linked task/i)).toBeInTheDocument())
    expect(mockListTasks).toHaveBeenCalledWith(expect.objectContaining({
      includeArchived: false,
    }))
  })

  it('selecting a task sets linked_task_id on submit', async () => {
    mockListTasks.mockResolvedValue([TASK_1])
    mockAddLogEntry.mockResolvedValue('new-id')

    await renderAddForm()
    await waitFor(() => expect(screen.getByLabelText(/linked task/i)).toBeInTheDocument())

    const linkedTaskSelect = screen.getByLabelText(/linked task/i) as HTMLSelectElement
    fireEvent.change(linkedTaskSelect, { target: { value: 'task-001' } })

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test entry' } })

    await act(async () => {
      const form = screen.getByRole('form')
      fireEvent.submit(form)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mockAddLogEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test entry',
          linkedTaskId: 'task-001',
        }),
      )
    })
  })

  it('clearing linked task sends null', async () => {
    mockListTasks.mockResolvedValue([TASK_1])
    mockAddLogEntry.mockResolvedValue('new-id')

    await renderAddForm()
    await waitFor(() => expect(screen.getByLabelText(/linked task/i)).toBeInTheDocument())

    const linkedTaskSelect = screen.getByLabelText(/linked task/i) as HTMLSelectElement
    // First set a task
    fireEvent.change(linkedTaskSelect, { target: { value: 'task-001' } })
    // Then clear it (select blank option)
    fireEvent.change(linkedTaskSelect, { target: { value: '' } })

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test entry' } })

    await act(async () => {
      const form = screen.getByRole('form')
      fireEvent.submit(form)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mockAddLogEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test entry',
          linkedTaskId: null,
        }),
      )
    })
  })
})

// ── Edit mode: pre-fill with entry values ─────────────────────────────────────
describe('Edit mode: pre-fill with entry values', () => {
  const ENTRY_TO_EDIT = {
    id: 'e-001',
    org_id: '10000000-0000-0000-0000-000000000001',
    business_unit_id: BU_KITCHEN.id,
    origin: 'manual' as const,
    event_type: 'qc' as const,
    title: 'Roast batch Ethiopia Guji selesai QC',
    detail: 'Batch #R-882 · 25.0 kg',
    occurred_at: '2026-06-12T05:00:00Z',
    needs_attention: true,
    linked_task_id: 'task-001',
    archived_at: null,
    created_by: '40000000-0000-0000-0000-000000000001',
    created_at: '2026-06-12T05:00:00Z',
    updated_at: '2026-06-12T05:00:00Z',
  }

  it('pre-fills form fields when editing an entry', async () => {
    mockGetLogEntry.mockResolvedValue(ENTRY_TO_EDIT)
    mockListTasks.mockResolvedValue([TASK_1])

    mockUseAuth.mockReturnValue(VIEWER)
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/ops/e-001/edit']}>
          <Routes>
            <Route path="/ops" element={<div>Ops Page</div>} />
            <Route path="/ops/:id/edit" element={<OpsAddForm />} />
          </Routes>
        </MemoryRouter>,
      )
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByLabelText(/title/i)).toBeInTheDocument())

    const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement
    expect(titleInput.value).toBe('Roast batch Ethiopia Guji selesai QC')

    const buSelect = screen.getByLabelText(/business unit/i) as HTMLSelectElement
    expect(buSelect.value).toBe(BU_KITCHEN.id)

    const typeSelect = screen.getByLabelText(/^type$/i) as HTMLSelectElement
    expect(typeSelect.value).toBe('qc')

    const detailTextarea = screen.getByLabelText(/detail/i) as HTMLTextAreaElement
    expect(detailTextarea.value).toBe('Batch #R-882 · 25.0 kg')

    const naCheckbox = screen.getByLabelText(/needs attention/i) as HTMLInputElement
    expect(naCheckbox.checked).toBe(true)

    const linkedTaskSelect = screen.getByLabelText(/linked task/i) as HTMLSelectElement
    expect(linkedTaskSelect.value).toBe('task-001')
  })

  it('edit submit calls editLogEntry with updated values', async () => {
    mockGetLogEntry.mockResolvedValue(ENTRY_TO_EDIT)
    mockListTasks.mockResolvedValue([TASK_1])
    mockEditLogEntry.mockResolvedValue()

    mockUseAuth.mockReturnValue(VIEWER)
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/ops/e-001/edit']}>
          <Routes>
            <Route path="/ops" element={<div>Ops Page</div>} />
            <Route path="/ops/:id/edit" element={<OpsAddForm />} />
          </Routes>
        </MemoryRouter>,
      )
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByLabelText(/title/i)).toBeInTheDocument())

    const titleInput = screen.getByLabelText(/title/i)
    fireEvent.change(titleInput, { target: { value: 'Updated title' } })

    await act(async () => {
      const form = screen.getByRole('form')
      fireEvent.submit(form)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mockEditLogEntry).toHaveBeenCalledWith(
        'e-001',
        expect.objectContaining({
          title: 'Updated title',
          eventType: 'qc',
          businessUnitId: BU_KITCHEN.id,
          detail: 'Batch #R-882 · 25.0 kg',
          needsAttention: true,
          linkedTaskId: 'task-001',
        }),
      )
    })
  })
})