// ReportMissingItem tests — AC-013 (FR-012, DD-WAY-29's cost made visible).
// The db layer is mocked like the sibling kitchen tests; the subject is the route itself:
// visible at rest, expandable, and it files the report through the existing Daily Log
// mechanism (needs_attention) rather than any new channel.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/db/ops-log', () => ({ addLogEntry: vi.fn() }))
import { addLogEntry } from '@/lib/db/ops-log'
import { ReportMissingItem } from './report-missing-item'

const mockAddLogEntry = vi.mocked(addLogEntry)

const BU_ID = '20000000-0000-0000-0000-000000000001'

beforeEach(() => vi.clearAllMocks())

describe('ReportMissingItem (AC-013)', () => {
  it('AC-013: offers a visible route to report a missing item at rest', () => {
    render(<ReportMissingItem businessUnitId={BU_ID} />)
    expect(
      screen.getByRole('button', { name: /missing\? report it/i }),
    ).toBeInTheDocument()
  })

  it('expands to a name field and files the report as a needs-attention Daily Log entry', async () => {
    mockAddLogEntry.mockResolvedValue('entry-1')
    const user = userEvent.setup()
    render(<ReportMissingItem businessUnitId={BU_ID} streamLabel="Rumah Rames / kitchen" />)

    await user.click(screen.getByRole('button', { name: /report it/i }))
    await user.type(screen.getByLabelText(/item name/i), 'Es Kopi Susu')
    await user.click(screen.getByRole('button', { name: /send report/i }))

    await waitFor(() => expect(mockAddLogEntry).toHaveBeenCalledTimes(1))
    expect(mockAddLogEntry).toHaveBeenCalledWith({
      businessUnitId: BU_ID,
      eventType: 'follow_up',
      title: 'Missing item on the capture form: Es Kopi Susu',
      detail:
        'Reported from the capture form (Rumah Rames / kitchen). The item is not offerable until its ERP coordinates are confirmed.',
      needsAttention: true,
    })
    // The exit is acknowledged — absence never reads as a bug with no exit.
    expect(await screen.findByRole('status')).toHaveTextContent(/reported/i)
  })

  it('does not file an empty report — the send action stays disabled until a name is typed', async () => {
    const user = userEvent.setup()
    render(<ReportMissingItem businessUnitId={BU_ID} />)
    await user.click(screen.getByRole('button', { name: /report it/i }))
    expect(screen.getByRole('button', { name: /send report/i })).toBeDisabled()
    expect(mockAddLogEntry).not.toHaveBeenCalled()
  })

  it('surfaces a failure and keeps the form open for retry', async () => {
    mockAddLogEntry.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    render(<ReportMissingItem businessUnitId={BU_ID} />)

    await user.click(screen.getByRole('button', { name: /report it/i }))
    await user.type(screen.getByLabelText(/item name/i), 'Es Kopi Susu')
    await user.click(screen.getByRole('button', { name: /send report/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not send/i)
    expect(screen.getByLabelText(/item name/i)).toBeInTheDocument()
  })
})
