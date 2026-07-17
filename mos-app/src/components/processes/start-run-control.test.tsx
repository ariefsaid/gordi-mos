import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { DueProcessRun, SpawnResult } from '@/lib/db/processes.types'

// B6 (AC-623): component tests mock the DAL, never a live DB.
vi.mock('@/lib/db/processes', () => ({ listDueRuns: vi.fn(), startRun: vi.fn() }))
import { listDueRuns, startRun } from '@/lib/db/processes'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

import { StartRunControl } from './start-run-control'

const mockListDueRuns = vi.mocked(listDueRuns)
const mockStartRun = vi.mocked(startRun)
const mockUseAuth = vi.mocked(useAuth)

function setAuthAs(accessRoles: string[]) {
  mockUseAuth.mockReturnValue({
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
      roles: [],
      isManager: false,
      accessRoles,
    },
    signOut: vi.fn(),
  })
}

const DUE_ROW: DueProcessRun = {
  work_line_id: 'wl-1', process_name: 'Café Opening',
  owning_team_id: 'team-1', team_name: 'Own Team',
  period_key: '2026-07-17', scheduled_date: '2026-07-17',
}

function renderControl() {
  return render(
    <I18nProvider>
      <StartRunControl />
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListDueRuns.mockResolvedValue([DUE_ROW])
})

describe('StartRunControl (AC-623)', () => {
  it('renders a due occurrence with a "Start run" action (verb+object, never a bare "Create") when the viewer is process.start-capable', async () => {
    setAuthAs(['ops_lead'])
    renderControl()

    await waitFor(() => expect(screen.getByText('Café Opening')).toBeInTheDocument())
    const startButton = screen.getByRole('button', { name: 'Start run' })
    expect(startButton).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^create$/i })).not.toBeInTheDocument()
  })

  it('clicking Start run calls startRun with the due row\'s process/team/date', async () => {
    setAuthAs(['admin'])
    const result: SpawnResult = { run_id: 'run-1', created: 2, pending: 1, idempotent: false }
    mockStartRun.mockResolvedValue(result)
    renderControl()

    await waitFor(() => expect(screen.getByText('Café Opening')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Start run' }))

    expect(mockStartRun).toHaveBeenCalledWith('wl-1', 'team-1', '2026-07-17')
  })

  it('is absent entirely when the viewer lacks process.start', async () => {
    setAuthAs(['member'])
    renderControl()

    await waitFor(() => expect(mockListDueRuns).not.toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Start run' })).not.toBeInTheDocument()
    expect(screen.queryByText('Café Opening')).not.toBeInTheDocument()
  })

  it('shows the due-empty state when there is nothing due', async () => {
    setAuthAs(['ops_lead'])
    mockListDueRuns.mockResolvedValue([])
    renderControl()

    await waitFor(() => expect(screen.getByText('No recurring work due to start.')).toBeInTheDocument())
  })

  it('CQ IMPORTANT-1: a rejected startRun shows an inline error and re-enables Start run', async () => {
    setAuthAs(['ops_lead'])
    mockStartRun.mockRejectedValue(new Error('lost race'))
    renderControl()

    await waitFor(() => expect(screen.getByText('Café Opening')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Start run' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't start this run — try again.")
    expect(screen.getByRole('button', { name: 'Start run' })).not.toBeDisabled()
  })

  it('CQ IMPORTANT-1: a retried start that succeeds clears the earlier inline error', async () => {
    setAuthAs(['ops_lead'])
    const result: SpawnResult = { run_id: 'run-2', created: 1, pending: 0, idempotent: false }
    mockStartRun.mockRejectedValueOnce(new Error('lost race'))
    mockStartRun.mockResolvedValueOnce(result)
    renderControl()

    await waitFor(() => expect(screen.getByText('Café Opening')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Start run' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Start run' }))
    await waitFor(() => expect(mockStartRun).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
