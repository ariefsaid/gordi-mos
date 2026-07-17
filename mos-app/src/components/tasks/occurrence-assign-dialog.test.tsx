import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { PendingTaskRow } from '@/lib/db/processes.types'
import type { PersonOption } from '@/lib/db/directory'

// C2 (Track C wiring): component test mocks the DAL PendingResolution reaches, never a live DB.
vi.mock('@/lib/db/processes', () => ({ resolvePendingTask: vi.fn() }))

import { OccurrenceAssignDialog } from './occurrence-assign-dialog'

const PEOPLE: PersonOption[] = [
  { id: 'person-a', full_name: 'Twin A' },
  { id: 'person-b', full_name: 'Twin B' },
]

function ambiguousPending(overrides: Partial<PendingTaskRow> = {}): PendingTaskRow {
  return {
    id: 'pending-1', process_run_id: 'run-1', task_def_id: 'def-1',
    candidate_person_ids: ['person-a', 'person-b'], reason: 'multiple', resolved_at: null,
    ...overrides,
  }
}

function renderDialog(props: Partial<React.ComponentProps<typeof OccurrenceAssignDialog>> = {}) {
  const base: React.ComponentProps<typeof OccurrenceAssignDialog> = {
    pending: [ambiguousPending()],
    people: PEOPLE,
    loading: false,
    error: false,
    onRetry: vi.fn(),
    onResolved: vi.fn(),
    onClose: vi.fn(),
    ...props,
  }
  return render(
    <I18nProvider>
      <OccurrenceAssignDialog {...base} />
    </I18nProvider>,
  )
}

describe('OccurrenceAssignDialog (C2 — the pending-resolution host mounted from the occurrence group header)', () => {
  it('exposes dialog semantics with an accessible name (the job-sentence title)', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: 'Assign — two people could own this' })).toBeInTheDocument()
  })

  it('renders a PendingResolution surface per unresolved pending item', () => {
    renderDialog({
      pending: [
        ambiguousPending({ id: 'pending-1' }),
        ambiguousPending({ id: 'pending-2', task_def_id: 'def-2' }),
      ],
    })
    expect(screen.getAllByRole('button', { name: 'Twin A' })).toHaveLength(2)
  })

  it('selecting a candidate calls onResolved(taskId, pendingId) — bubbled from PendingResolution', async () => {
    const { resolvePendingTask } = await import('@/lib/db/processes')
    vi.mocked(resolvePendingTask).mockResolvedValue('task-9')
    const onResolved = vi.fn()
    renderDialog({ onResolved })

    await userEvent.click(screen.getByRole('button', { name: 'Twin B' }))

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith('task-9', 'pending-1'))
  })

  it('shows the empty copy when every pending item for this occurrence is already resolved', () => {
    renderDialog({ pending: [] })
    expect(screen.getByText('Everything for this occurrence is assigned.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Twin A' })).not.toBeInTheDocument()
  })

  it('shows a loading indicator while the pending list is being fetched', () => {
    renderDialog({ loading: true })
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Twin A' })).not.toBeInTheDocument()
  })

  it('shows an error banner with Retry when the pending fetch failed', () => {
    const onRetry = vi.fn()
    renderDialog({ error: true, onRetry })
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('the Close control fires onClose', () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })
})
