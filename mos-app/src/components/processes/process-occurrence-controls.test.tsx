import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { useAuth } from '@/auth/use-auth'
import type { AuthState } from '@/auth/context'
import type { PeopleRow } from '@/lib/database.types'
import type { PersonOption } from '@/lib/db/directory'
import type { DueProcessRun, PendingTaskRow, ProcessOccurrenceSummary } from '@/lib/db/processes.types'
import {
  cancelRun, canCloseProcessRun, canStartProcessForTeam, completeRun, listPendingTasks,
  listProcessOccurrenceSummaries, listStartableProcessRuns, startRun,
} from '@/lib/db/processes'
import { getPeople } from '@/lib/db/directory'
import { ProcessOccurrenceControls } from './process-occurrence-controls'

vi.mock('@/auth/use-auth', () => ({ useAuth: vi.fn() }))
vi.mock('@/lib/db/processes', () => ({
  cancelRun: vi.fn(),
  canCloseProcessRun: vi.fn(),
  canStartProcessForTeam: vi.fn(),
  completeRun: vi.fn(),
  listPendingTasks: vi.fn(),
  listProcessOccurrenceSummaries: vi.fn(),
  listStartableProcessRuns: vi.fn(),
  startRun: vi.fn(),
}))
vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn() }))

const mockUseAuth = vi.mocked(useAuth)
const mockCancelRun = vi.mocked(cancelRun)
const mockCanCloseProcessRun = vi.mocked(canCloseProcessRun)
const mockCanStartProcessForTeam = vi.mocked(canStartProcessForTeam)
const mockCompleteRun = vi.mocked(completeRun)
const mockListPendingTasks = vi.mocked(listPendingTasks)
const mockListOccurrences = vi.mocked(listProcessOccurrenceSummaries)
const mockListStartable = vi.mocked(listStartableProcessRuns)
const mockStartRun = vi.mocked(startRun)
const mockGetPeople = vi.mocked(getPeople)

const WORK_LINE_ID = 'work-line-1'
const RUN_ID = 'run-1'
const TEAM_ID = 'team-1'
const VIEWER_ID = 'person-1'

const PEOPLE: PersonOption[] = [
  { id: 'person-1', full_name: 'Cahya Cafe' },
  { id: 'person-2', full_name: 'Krishna Kitchen' },
]

const VIEWER: PeopleRow = {
  id: VIEWER_ID, org_id: 'org-1', user_id: 'user-1', full_name: 'Cahya Cafe', email: null,
  must_change_password: false, archived_at: null, created_at: '', updated_at: '',
}

const RUN: ProcessOccurrenceSummary = {
  run: {
    id: RUN_ID, work_line_id: WORK_LINE_ID, owning_team_id: TEAM_ID, period_key: '2026-07-17',
    caption: 'Café Opening · 17 Jul 2026', scheduled_date: '2026-07-17', status: 'open',
    definition_version: 1, started_by: VIEWER_ID, completed_at: null, completed_by: null,
    cancelled_at: null, cancelled_by: null, cancel_reason: null,
  },
  team_name: 'Café Operations',
  rollup: {
    process_run_id: RUN_ID, caption: 'Café Opening · 17 Jul 2026', scheduled_date: '2026-07-17',
    status: 'open', total: 3, open: 2, in_progress: 0, blocked: 0, done: 1,
    overdue: 1, pending_unresolved: 1, completion_pct: 33.3,
  },
}

const DUE: DueProcessRun = {
  work_line_id: WORK_LINE_ID, process_name: 'Café Opening', owning_team_id: TEAM_ID,
  team_name: 'Café Operations', period_key: '2026-07-18', scheduled_date: '2026-07-18',
}

function auth(viewerId = VIEWER_ID, accessRoles = ['member']): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: { ...VIEWER, id: viewerId },
      roles: [], isManager: false, accessRoles, affiliated: [],
    },
    signOut: vi.fn(),
  }
}

function controlsTree(workLineId = WORK_LINE_ID) {
  return (
    <MemoryRouter>
      <I18nProvider>
        <ProcessOccurrenceControls workLineId={workLineId} onViewTasks={vi.fn()} />
      </I18nProvider>
    </MemoryRouter>
  )
}

function renderControls(workLineId = WORK_LINE_ID) {
  return render(controlsTree(workLineId))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(auth())
  mockListOccurrences.mockResolvedValue([RUN])
  mockListStartable.mockResolvedValue([DUE])
  mockCanStartProcessForTeam.mockResolvedValue(true)
  mockCanCloseProcessRun.mockResolvedValue(true)
  mockListPendingTasks.mockResolvedValue([])
  mockGetPeople.mockResolvedValue(PEOPLE)
  mockStartRun.mockResolvedValue({ run_id: RUN_ID, created: 0, pending: 0, idempotent: true })
  mockCompleteRun.mockResolvedValue({ ...RUN.run, status: 'completed', completed_at: '2026-07-17T10:00:00Z', completed_by: VIEWER_ID })
  mockCancelRun.mockResolvedValue({ ...RUN.run, status: 'cancelled', cancelled_at: '2026-07-17T10:00:00Z', cancelled_by: VIEWER_ID, cancel_reason: 'Merged into the event.' })
})

describe('ProcessOccurrenceControls', () => {
  it('shows the owning Team, task/overdue/to-assign counts, View tasks, and member Start', async () => {
    renderControls()

    expect(await screen.findByText('Café Operations')).toBeInTheDocument()
    expect(screen.getByText('Café Operations · 17 Jul 2026 · Open')).toBeInTheDocument()
    expect(screen.getByText('3 tasks')).toBeInTheDocument()
    expect(screen.getByText('1 overdue')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 to assign' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View tasks' })).toHaveAttribute('href', `/work/tasks?occurrence=${RUN_ID}`)
    expect(screen.getByRole('button', { name: 'Start · Café Opening' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Start · Café Opening' }))
    expect(mockStartRun).toHaveBeenCalledWith(WORK_LINE_ID, TEAM_ID, '2026-07-18')
  })

  it('reuses the existing pending-resolution dialog when a capable viewer opens to-assign', async () => {
    const pending: PendingTaskRow = {
      id: 'pending-1', process_run_id: RUN_ID, task_def_id: 'def-1',
      candidate_person_ids: ['person-2'], reason: 'multiple', resolved_at: null,
      title: 'Bakery handover',
    }
    mockListPendingTasks.mockResolvedValue([pending])
    renderControls()

    await userEvent.click(await screen.findByRole('button', { name: '1 to assign' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Bakery handover — two people could own this')).toBeInTheDocument()
    expect(mockGetPeople).toHaveBeenCalled()
  })

  it('uses the runtime close authority for an open occurrence', async () => {
    const starterView = renderControls()
    expect(await screen.findByRole('button', { name: 'Complete occurrence' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel occurrence' })).toBeInTheDocument()
    starterView.unmount()

    mockCanCloseProcessRun.mockResolvedValue(false)
    mockUseAuth.mockReturnValue(auth('another-person', ['member']))
    const memberView = renderControls()
    expect(await screen.findByText('Café Opening · 17 Jul 2026')).toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: 'Complete occurrence' })).toHaveLength(0)
    memberView.unmount()

    mockCanCloseProcessRun.mockResolvedValue(true)
    mockUseAuth.mockReturnValue(auth('another-person', ['ops_lead']))
    renderControls()
    expect(await screen.findByRole('button', { name: 'Complete occurrence' })).toBeInTheDocument()
  })

  it('keeps successful per-occurrence authority answers when another check fails and retries the failed enrichment', async () => {
    const runB: ProcessOccurrenceSummary = {
      ...RUN,
      run: { ...RUN.run, id: 'run-2', owning_team_id: 'team-2', caption: 'Café Closing · 18 Jul 2026' },
      team_name: 'Café Closing',
      rollup: { ...RUN.rollup, process_run_id: 'run-2', caption: 'Café Closing · 18 Jul 2026', pending_unresolved: 0 },
    }
    mockListOccurrences.mockResolvedValue([RUN, runB])
    mockListStartable.mockResolvedValue([])
    mockCanStartProcessForTeam.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('temporary'))
    mockCanCloseProcessRun.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('temporary'))
    renderControls()

    expect(await screen.findByRole('button', { name: 'Complete occurrence' })).toBeInTheDocument()
    expect(screen.getByText('Café Closing · 18 Jul 2026')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't check occurrence permissions")
    expect(screen.getAllByRole('button', { name: 'Complete occurrence' })).toHaveLength(1)

    mockCanStartProcessForTeam.mockResolvedValue(true)
    mockCanCloseProcessRun.mockResolvedValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Complete occurrence' })).toHaveLength(2))
  })

  it('fails closed when an open occurrence has no starter and the viewer is unauthenticated', async () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated' })
    mockCanCloseProcessRun.mockResolvedValue(false)
    mockListOccurrences.mockResolvedValue([{ ...RUN, run: { ...RUN.run, started_by: null } }])
    renderControls()

    expect(await screen.findByText('Café Opening · 17 Jul 2026')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Complete occurrence' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel occurrence' })).not.toBeInTheDocument()
  })

  it('ignores an older occurrence load after the work line changes', async () => {
    const oldLoad = deferred<ProcessOccurrenceSummary[]>()
    const newLoad = deferred<ProcessOccurrenceSummary[]>()
    const oldRun = { ...RUN, run: { ...RUN.run, work_line_id: 'work-line-a', caption: 'Line A occurrence' } }
    const newRun = { ...RUN, run: { ...RUN.run, work_line_id: 'work-line-b', caption: 'Line B occurrence' } }
    mockListOccurrences.mockImplementation((workLineId) => workLineId === 'work-line-a' ? oldLoad.promise : newLoad.promise)
    mockListStartable.mockResolvedValue([])
    const view = renderControls('work-line-a')
    view.rerender(controlsTree('work-line-b'))

    await act(async () => { newLoad.resolve([newRun]); await newLoad.promise })
    expect(await screen.findByText('Line B occurrence')).toBeInTheDocument()

    await act(async () => { oldLoad.resolve([oldRun]); await oldLoad.promise })
    await waitFor(() => expect(screen.queryByText('Line A occurrence')).not.toBeInTheDocument())
    expect(screen.getByText('Line B occurrence')).toBeInTheDocument()
  })

  it('ignores a late pending-assignment response after switching occurrence dialogs', async () => {
    const firstPending = deferred<PendingTaskRow[]>()
    const secondPending = deferred<PendingTaskRow[]>()
    const runB: ProcessOccurrenceSummary = {
      ...RUN,
      run: { ...RUN.run, id: 'run-2', caption: 'Café Closing · 18 Jul 2026' },
      rollup: { ...RUN.rollup, process_run_id: 'run-2', caption: 'Café Closing · 18 Jul 2026' },
    }
    const pendingA: PendingTaskRow = {
      id: 'pending-a', process_run_id: RUN_ID, task_def_id: 'def-a',
      candidate_person_ids: ['person-2'], reason: 'multiple', resolved_at: null, title: 'A step',
    }
    const pendingB: PendingTaskRow = {
      id: 'pending-b', process_run_id: 'run-2', task_def_id: 'def-b',
      candidate_person_ids: ['person-2'], reason: 'multiple', resolved_at: null, title: 'B step',
    }
    mockListOccurrences.mockResolvedValue([RUN, runB])
    mockListStartable.mockResolvedValue([])
    mockListPendingTasks.mockImplementation((runId) => runId === RUN_ID ? firstPending.promise : secondPending.promise)
    renderControls()

    const assignButtons = await screen.findAllByRole('button', { name: '1 to assign' })
    await userEvent.click(assignButtons[0])
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: '1 to assign' })[1])

    await act(async () => { secondPending.resolve([pendingB]); await secondPending.promise })
    expect(await screen.findByText('B step — two people could own this')).toBeInTheDocument()

    await act(async () => { firstPending.resolve([pendingA]); await firstPending.promise })
    await waitFor(() => expect(screen.queryByText('A step — two people could own this')).not.toBeInTheDocument())
    expect(screen.getByText('B step — two people could own this')).toBeInTheDocument()
  })

  it('requires a cancellation reason and confirms the cancellation before calling the RPC', async () => {
    renderControls()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel occurrence' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Cancel this occurrence?' })
    expect(dialog).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel occurrence' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a reason to cancel.')
    await userEvent.type(screen.getByRole('textbox', { name: 'Reason for cancellation' }), 'Merged into the event.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel occurrence' }))
    expect(mockCancelRun).toHaveBeenCalledWith(RUN_ID, 'Merged into the event.')
  })

  it('confirms completion and calls the existing complete RPC without changing generated Tasks', async () => {
    renderControls()
    await userEvent.click(await screen.findByRole('button', { name: 'Complete occurrence' }))
    const dialog = screen.getByRole('dialog', { name: 'Complete this occurrence?' })
    expect(dialog).toHaveTextContent('generated Tasks stay unchanged')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Complete occurrence' }))
    expect(mockCompleteRun).toHaveBeenCalledWith(RUN_ID)
  })
})
