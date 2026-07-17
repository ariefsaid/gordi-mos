import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { PendingTaskRow } from '@/lib/db/processes.types'
import type { PersonOption } from '@/lib/db/directory'

// B7 (AC-624): component tests mock the DAL, never a live DB.
vi.mock('@/lib/db/processes', () => ({ resolvePendingTask: vi.fn() }))
import { resolvePendingTask } from '@/lib/db/processes'

import { PendingResolution } from './pending-resolution'

const mockResolvePendingTask = vi.mocked(resolvePendingTask)

const PEOPLE: PersonOption[] = [
  { id: 'person-a', full_name: 'Twin A' },
  { id: 'person-b', full_name: 'Twin B' },
  { id: 'person-c', full_name: 'Solo Holder' },
]

function ambiguousPending(overrides: Partial<PendingTaskRow> = {}): PendingTaskRow {
  return {
    id: 'pending-1', process_run_id: 'run-1', task_def_id: 'def-1',
    candidate_person_ids: ['person-a', 'person-b'], reason: 'multiple', resolved_at: null,
    ...overrides,
  }
}

function vacantPending(overrides: Partial<PendingTaskRow> = {}): PendingTaskRow {
  return {
    id: 'pending-2', process_run_id: 'run-1', task_def_id: 'def-2',
    candidate_person_ids: [], reason: 'none', resolved_at: null,
    ...overrides,
  }
}

function renderPending(pending: PendingTaskRow, onResolved = vi.fn()) {
  return render(
    <I18nProvider>
      <PendingResolution pending={pending} people={PEOPLE} onResolved={onResolved} />
    </I18nProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('PendingResolution (AC-624)', () => {
  it('renders the two candidates by resolved name for a reason="multiple" item', () => {
    renderPending(ambiguousPending())

    expect(screen.getByRole('button', { name: 'Twin A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Twin B' })).toBeInTheDocument()
    expect(screen.queryByText('Solo Holder')).not.toBeInTheDocument() // not a candidate
  })

  it('selecting a candidate calls resolvePendingTask(pendingId, picId)', async () => {
    const onResolved = vi.fn()
    mockResolvePendingTask.mockResolvedValue('task-9')
    renderPending(ambiguousPending(), onResolved)

    await userEvent.click(screen.getByRole('button', { name: 'Twin B' }))

    expect(mockResolvePendingTask).toHaveBeenCalledWith('pending-1', 'person-b')
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith('task-9'))
  })

  it('offers a full person picker for a reason="none" (vacant) item', () => {
    renderPending(vacantPending())

    const picker = screen.getByRole('listbox')
    expect(picker).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Twin A/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Twin B/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Solo Holder/ })).toBeInTheDocument()
  })

  it('selecting from the full picker (vacant path) calls resolvePendingTask(pendingId, picId)', async () => {
    const onResolved = vi.fn()
    mockResolvePendingTask.mockResolvedValue('task-10')
    renderPending(vacantPending(), onResolved)

    await userEvent.click(screen.getByRole('option', { name: /Solo Holder/ }))

    expect(mockResolvePendingTask).toHaveBeenCalledWith('pending-2', 'person-c')
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith('task-10'))
  })

  it('shows the "Two people could own this" job-sentence title', () => {
    renderPending(ambiguousPending())
    expect(screen.getByText('Assign — two people could own this')).toBeInTheDocument()
  })
})
