// ReportMissingItem tests — a stream-scoped attention item on Café item settings (#1286).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/lib/db/cafe-missing-item-reports', () => ({ reportMissingCafeItem: vi.fn() }))
import { reportMissingCafeItem } from '@/lib/db/cafe-missing-item-reports'
import { ReportMissingItem } from './report-missing-item'

const mockReport = vi.mocked(reportMissingCafeItem)
const STREAM = {
  branch: { id: 'branch-1', code: 'rumah_rames', name: 'Rumah Rames' },
  activity: 'kitchen' as const,
}

function renderReport(streamLabel = 'Rumah Rames / Kitchen') {
  return render(
    <MemoryRouter initialEntries={['/cafe/production']}>
      <ReportMissingItem stream={STREAM} streamLabel={streamLabel} />
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('ReportMissingItem (#1286)', () => {
  it('offers the report route at rest', () => {
    renderReport()
    expect(screen.getByRole('button', { name: /missing an item\? report it/i })).toBeInTheDocument()
  })

  it('opening the report focuses the name field above the sticky footer', async () => {
    const user = userEvent.setup()
    renderReport()
    await user.click(screen.getByRole('button', { name: /report it/i }))
    expect(screen.getByLabelText(/item name/i)).toHaveFocus()
  })

  it('cancels an opened report without sending and returns focus to the launcher', async () => {
    const user = userEvent.setup()
    renderReport()
    const launcher = screen.getByRole('button', { name: /missing an item\? report it/i })
    await user.click(launcher)
    const field = screen.getByLabelText(/item name/i)
    await user.type(field, 'Oat milk')
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByLabelText(/item name/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /missing an item\? report it/i })).toHaveFocus()
    expect(mockReport).not.toHaveBeenCalled()
  })

  it('creates a report for the selected stream and tells the reporter where it went', async () => {
    mockReport.mockResolvedValue()
    const user = userEvent.setup()
    renderReport()

    await user.click(screen.getByRole('button', { name: /report it/i }))
    await user.type(screen.getByLabelText(/item name/i), 'Es Kopi Susu')
    await user.click(screen.getByRole('button', { name: /send report/i }))

    await waitFor(() => expect(mockReport).toHaveBeenCalledTimes(1))
    expect(mockReport).toHaveBeenCalledWith(STREAM, 'Es Kopi Susu')
    expect(await screen.findByRole('status')).toHaveTextContent(/stream managers can review it in café item settings/i)
    expect(screen.getByRole('link', { name: 'Open Café item settings' })).toHaveAttribute('href', '/cafe/items')
  })

  it('does not send an empty report', async () => {
    const user = userEvent.setup()
    renderReport()
    await user.click(screen.getByRole('button', { name: /report it/i }))
    expect(screen.getByRole('button', { name: /send report/i })).toBeDisabled()
    expect(mockReport).not.toHaveBeenCalled()
  })

  it('keeps the form open on failure and allows a successful retry', async () => {
    mockReport.mockRejectedValueOnce(new Error('offline')).mockResolvedValue()
    const user = userEvent.setup()
    renderReport()
    await user.click(screen.getByRole('button', { name: /report it/i }))
    const field = screen.getByLabelText(/item name/i)
    await user.type(field, 'Es Kopi Susu')
    await user.click(screen.getByRole('button', { name: /send report/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not send/i)
    expect(screen.getByLabelText(/item name/i)).toHaveValue('Es Kopi Susu')
    expect(screen.getByLabelText(/item name/i)).toHaveFocus()

    await user.click(screen.getByRole('button', { name: /send report/i }))
    await waitFor(() => expect(mockReport).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('status')).toBeInTheDocument()
  })
})
