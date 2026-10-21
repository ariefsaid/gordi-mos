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
  cancelRun, completeRun, listPendingTasks, listProcessOccurrenceAuthorities,
  listProcessOccurrenceSummaries, listStartableProcessRuns, startRun,
} from '@/lib/db/processes'
import { getPeople } from '@/lib/db/directory'
import { listCafeViewerTeams } from '@/lib/db/cafe-opening'
import { ProcessOccurrenceControls } from './process-occurrence-controls'

vi.mock('@/auth/use-auth', () => ({ useAuth: vi.fn() }))
vi.mock('@/lib/db/processes', () => ({
  cancelRun: vi.fn(),
  completeRun: vi.fn(),
  listPendingTasks: vi.fn(),
  listProcessOccurrenceAuthorities: vi.fn(),
  listProcessOccurrenceSummaries: vi.fn(),
  listStartableProcessRuns: vi.fn(),
  startRun: vi.fn(),
}))
vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn() }))
vi.mock('@/lib/db/cafe-opening', () => ({ listCafeViewerTeams: vi.fn() }))

const mockUseAuth = vi.mocked(useAuth)
const mockCancelRun = vi.mocked(cancelRun)
const mockCompleteRun = vi.mocked(completeRun)
const mockListPendingTasks = vi.mocked(listPendingTasks)
const mockAuthorities = vi.mocked(listProcessOccurrenceAuthorities)
const mockListOccurrences = vi.mocked(listProcessOccurrenceSummaries)
const mockListStartable = vi.mocked(listStartableProcessRuns)
const mockStartRun = vi.mocked(startRun)
const mockGetPeople = vi.mocked(getPeople)
const mockViewerTeams = vi.mocked(listCafeViewerTeams)

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

function controlsTree(workLineId = WORK_LINE_ID, setupIncomplete = false, canManageSetup = false, locale: 'en' | 'id' = 'en') {
  return (
    <MemoryRouter>
      <I18nProvider initialLocale={locale}>
        <ProcessOccurrenceControls workLineId={workLineId} setupIncomplete={setupIncomplete} canManageSetup={canManageSetup} onViewTasks={vi.fn()} />
      </I18nProvider>
    </MemoryRouter>
  )
}

function renderControls(workLineId = WORK_LINE_ID, setupIncomplete = false, canManageSetup = false, locale: 'en' | 'id' = 'en') {
  return render(controlsTree(workLineId, setupIncomplete, canManageSetup, locale))
}

function occurrencePage(rows: ProcessOccurrenceSummary[], hasMore = false) {
  const last = rows.at(-1)
  return {
    rows,
    nextCursor: hasMore && last ? { scheduled_date: last.run.scheduled_date, id: last.run.id } : null,
    hasMore,
  }
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
  mockListOccurrences.mockResolvedValue(occurrencePage([RUN]))
  mockListStartable.mockResolvedValue([DUE])
  mockAuthorities.mockImplementation(async (teamIds, runIds) => [
    ...teamIds.map((target_id) => ({ authority_kind: 'start' as const, target_id, allowed: true })),
    ...runIds.map((target_id) => ({ authority_kind: 'close' as const, target_id, allowed: true })),
  ])
  mockListPendingTasks.mockResolvedValue([])
  mockGetPeople.mockResolvedValue(PEOPLE)
  mockViewerTeams.mockResolvedValue([])
  mockStartRun.mockResolvedValue({ run_id: RUN_ID, created: 0, pending: 0, idempotent: true })
  mockCompleteRun.mockResolvedValue({ ...RUN.run, status: 'completed', completed_at: '2026-07-17T10:00:00Z', completed_by: VIEWER_ID })
  mockCancelRun.mockResolvedValue({ ...RUN.run, status: 'cancelled', cancelled_at: '2026-07-17T10:00:00Z', cancelled_by: VIEWER_ID, cancel_reason: 'Merged into the event.' })
})

describe('ProcessOccurrenceControls', () => {
  it('explains how to recover when no active steps are configured', async () => {
    mockListOccurrences.mockResolvedValue(occurrencePage([]))
    mockListStartable.mockResolvedValue([])
    renderControls(WORK_LINE_ID, true)

    expect(await screen.findByRole('note')).toHaveTextContent('Ask a Process manager to add and activate at least one step before starting a run.')
    expect(screen.queryByText('No occurrences have been started yet.')).toBeNull()
  })

  it('leaves setup guidance to the record Get started region for a manager', async () => {
    mockListOccurrences.mockResolvedValue(occurrencePage([]))
    mockListStartable.mockResolvedValue([])
    renderControls(WORK_LINE_ID, true, true)

    await waitFor(() => expect(screen.queryByRole('status', { name: 'Loading occurrences' })).toBeNull())
    expect(screen.queryByRole('note')).toBeNull()
    expect(screen.queryByText('No occurrences have been started yet.')).toBeNull()
  })

  it('shows the owning Team, task/overdue/to-assign counts, View tasks, and descriptive ready rows', async () => {
    renderControls()

    expect(await screen.findByRole('heading', { name: 'Ready to start' })).toBeInTheDocument()
    const ready = document.querySelector('.process-occurrence-controls__start') as HTMLElement
    expect(await within(ready).findByText('18 Jul 2026')).toBeInTheDocument()
    expect(screen.getByText('Café Operations')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 4, name: '17 Jul 2026' })).toBeInTheDocument()
    expect(screen.getByText('Café Operations · Open')).toBeInTheDocument()
    expect(screen.getByText('3 tasks')).toBeInTheDocument()
    expect(screen.getByText('1 overdue')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 to assign' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View tasks' })).toHaveAttribute('href', `/work/tasks?occurrence=${RUN_ID}`)
    expect(screen.queryByRole('button', { name: /start/i })).toBeNull()
    expect(mockStartRun).not.toHaveBeenCalled()
  })

  it.each([
    { locale: 'en' as const, label: 'Load more items', pastLabel: 'Past occurrences' },
    { locale: 'id' as const, label: 'Muat item lainnya', pastLabel: 'Kejadian sebelumnya' },
  ])('lets users load the next occurrence history page in $locale', async ({ locale, label, pastLabel }) => {
    const older = { ...RUN, run: { ...RUN.run, status: 'completed' as const, scheduled_date: '2026-07-16' }, rollup: { ...RUN.rollup, status: 'completed' as const } }
    mockListOccurrences
      .mockResolvedValueOnce(occurrencePage([RUN], true))
      .mockResolvedValueOnce(occurrencePage([older]))
    renderControls(WORK_LINE_ID, false, false, locale)

    await screen.findByRole('heading', { level: 4, name: '17 Jul 2026' })
    await userEvent.click(screen.getByRole('button', { name: label }))
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(pastLabel) }))
    expect(await screen.findByRole('heading', { level: 4, name: '16 Jul 2026' })).toBeInTheDocument()
    expect(mockListOccurrences).toHaveBeenLastCalledWith(WORK_LINE_ID, { scheduled_date: RUN.run.scheduled_date, id: RUN.run.id })
  })

  it('keeps the Process title out of occurrence rows and leaves Start to the record header', async () => {
    mockListOccurrences.mockResolvedValue(occurrencePage([RUN]))
    renderControls()

    expect(await screen.findByRole('heading', { level: 4, name: '17 Jul 2026' })).toBeInTheDocument()
    expect(screen.queryByText('Café Opening · 17 Jul 2026')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Occurrences' })).toBeNull()
    expect(screen.queryByRole('button', { name: /start/i })).toBeNull()
    expect(screen.getByText('Café Operations · Open')).toBeInTheDocument()
  })

  it('keeps cancelled runs in a collapsed Past occurrences disclosure, separate from Ready to start', async () => {
    const cancelled = {
      ...RUN,
      run: { ...RUN.run, status: 'cancelled' as const, cancelled_at: '2026-07-17T10:00:00Z', cancelled_by: VIEWER_ID, cancel_reason: 'Merged into the event.' },
      rollup: { ...RUN.rollup, status: 'cancelled' as const },
    }
    mockListOccurrences.mockResolvedValue(occurrencePage([cancelled]))
    renderControls()

    await screen.findByRole('heading', { name: 'Ready to start' })
    const ready = document.querySelector('.process-occurrence-controls__start') as HTMLElement
    expect(await within(ready).findByText('Café Operations')).toBeInTheDocument()
    expect(within(ready).queryByText('Cancelled')).toBeNull()
    const history = screen.getByRole('button', { name: /Past occurrences/ })
    expect(history).toHaveTextContent('1')
    expect(screen.queryByText('Café Operations · Cancelled')).toBeNull()
    await userEvent.click(history)
    expect(await screen.findByRole('heading', { level: 4, name: '17 Jul 2026' })).toBeInTheDocument()
    expect(screen.getByText('Café Operations · Cancelled')).toBeInTheDocument()
  })

  // #805: no Process-to-Team relation exists, so the start list is narrowed to the viewer's own
  // Teams when they have any among the offered ones; otherwise the server-filtered list stands.
  it('lists only the viewer\'s own Teams as ready contexts, not every Team the server allows', async () => {
    mockListStartable.mockResolvedValue([
      DUE,
      { ...DUE, owning_team_id: 'team-2', team_name: 'Marketing' },
      { ...DUE, owning_team_id: 'team-3', team_name: 'Finance' },
    ])
    mockViewerTeams.mockResolvedValue([{ id: TEAM_ID } as Awaited<ReturnType<typeof listCafeViewerTeams>>[number]])
    renderControls()

    expect(await screen.findByRole('heading', { name: 'Ready to start' })).toBeInTheDocument()
    expect(screen.getByText('Café Operations')).toBeInTheDocument()
    expect(screen.queryByText('Marketing')).not.toBeInTheDocument()
    expect(screen.queryByText('Finance')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start/i })).toBeNull()
  })

  it('keeps the server ready-context list when the viewer holds none of the offered Teams', async () => {
    mockListStartable.mockResolvedValue([
      DUE,
      { ...DUE, owning_team_id: 'team-2', team_name: 'Marketing' },
    ])
    renderControls()

    expect(await screen.findByText('Café Operations')).toBeInTheDocument()
    expect(screen.getByText('Marketing')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start/i })).toBeNull()
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

  it('does not offer pending assignment after an occurrence is terminal', async () => {
    mockListOccurrences.mockResolvedValue(occurrencePage([{
      ...RUN,
      run: { ...RUN.run, status: 'completed', completed_at: '2026-07-17T10:00:00Z', completed_by: VIEWER_ID },
      rollup: { ...RUN.rollup, status: 'completed', pending_unresolved: 1 },
    }]))
    renderControls()

    const past = await screen.findByRole('button', { name: /Past occurrences/ })
    expect(past).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(past)
    expect(await screen.findByRole('heading', { level: 4, name: '17 Jul 2026' })).toBeInTheDocument()
    expect(screen.getByText('1 to assign')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '1 to assign' })).not.toBeInTheDocument()
  })

  it('uses singular task wording for a one-task occurrence', async () => {
    mockListOccurrences.mockResolvedValue(occurrencePage([{
      ...RUN,
      rollup: { ...RUN.rollup, total: 1, open: 1, done: 0, completion_pct: 0 },
    }]))
    renderControls()

    expect(await screen.findByText('1 task')).toBeInTheDocument()
    expect(screen.queryByText('1 tasks')).not.toBeInTheDocument()
  })

  it('keeps Complete secondary and Cancel quiet when another run is ready', async () => {
    renderControls()
    const complete = await screen.findByRole('button', { name: 'Complete occurrence' })
    const cancel = screen.getByRole('button', { name: 'Cancel occurrence' })
    expect(complete).toHaveClass('btn-outline')
    expect(complete).not.toHaveClass('btn-primary')
    expect(cancel).toHaveClass('btn-ghost')
    expect(cancel).not.toHaveClass('btn-destructive')
  })

  it('keeps Complete primary when the open run is the only available action', async () => {
    mockListStartable.mockResolvedValue([])
    renderControls()

    const complete = await screen.findByRole('button', { name: 'Complete occurrence' })
    expect(complete).toHaveClass('btn-primary')
    expect(complete).not.toHaveClass('btn-outline')
  })

  it('shows occurrence actions only when the batched close authority allows them', async () => {
    const starterView = renderControls()
    expect(await screen.findByRole('button', { name: 'Complete occurrence' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel occurrence' })).toBeInTheDocument()
    starterView.unmount()

    mockAuthorities.mockResolvedValueOnce([
      { authority_kind: 'start', target_id: TEAM_ID, allowed: true },
      { authority_kind: 'close', target_id: RUN_ID, allowed: false },
    ])
    mockUseAuth.mockReturnValue(auth('another-person', ['member']))
    const memberView = renderControls()
    expect(await screen.findByRole('heading', { level: 4, name: '17 Jul 2026' })).toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: 'Complete occurrence' })).toHaveLength(0)
    memberView.unmount()

    mockAuthorities.mockResolvedValueOnce([
      { authority_kind: 'start', target_id: TEAM_ID, allowed: true },
      { authority_kind: 'close', target_id: RUN_ID, allowed: true },
    ])
    mockUseAuth.mockReturnValue(auth('another-person', ['ops_lead']))
    renderControls()
    expect(await screen.findByRole('button', { name: 'Complete occurrence' })).toBeInTheDocument()
  })

  it.each([
    { locale: 'en' as const, error: "Couldn't check occurrence permissions", retry: 'Try again', complete: 'Complete occurrence' },
    { locale: 'id' as const, error: 'Izin kejadian tidak dapat diperiksa', retry: 'Coba lagi', complete: 'Selesaikan kejadian' },
  ])('fails closed and retries a failed batch authority check in $locale', async ({ locale, error, retry, complete }) => {
    const runB: ProcessOccurrenceSummary = {
      ...RUN,
      run: { ...RUN.run, id: 'run-2', owning_team_id: 'team-2', caption: 'Café Closing · 18 Jul 2026' },
      team_name: 'Café Closing',
      rollup: { ...RUN.rollup, process_run_id: 'run-2', caption: 'Café Closing · 18 Jul 2026', pending_unresolved: 0 },
    }
    mockListOccurrences.mockResolvedValue(occurrencePage([RUN, runB]))
    mockListStartable.mockResolvedValue([])
    mockAuthorities.mockRejectedValueOnce(new Error('temporary'))
    renderControls(WORK_LINE_ID, false, false, locale)

    expect(await screen.findByRole('alert')).toHaveTextContent(error)
    expect(screen.getAllByRole('heading', { level: 4, name: '17 Jul 2026' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: complete })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: retry }))

    await waitFor(() => expect(screen.getAllByRole('button', { name: complete })).toHaveLength(2))
  })

  it('fails closed when an open occurrence has no starter and the viewer is unauthenticated', async () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated' })
    mockAuthorities.mockResolvedValue([])
    mockListOccurrences.mockResolvedValue(occurrencePage([{ ...RUN, run: { ...RUN.run, started_by: null } }]))
    renderControls()

    expect(await screen.findByRole('heading', { level: 4, name: '17 Jul 2026' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Complete occurrence' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel occurrence' })).not.toBeInTheDocument()
  })

  it('ignores an older occurrence load after the work line changes', async () => {
    const oldLoad = deferred<ReturnType<typeof occurrencePage>>()
    const newLoad = deferred<ReturnType<typeof occurrencePage>>()
    const oldRun = { ...RUN, team_name: 'Line A occurrence', run: { ...RUN.run, work_line_id: 'work-line-a' } }
    const newRun = { ...RUN, team_name: 'Line B occurrence', run: { ...RUN.run, work_line_id: 'work-line-b' } }
    mockListOccurrences.mockImplementation((workLineId) => workLineId === 'work-line-a' ? oldLoad.promise : newLoad.promise)
    mockListStartable.mockResolvedValue([])
    const view = renderControls('work-line-a')
    view.rerender(controlsTree('work-line-b'))

    await act(async () => { newLoad.resolve(occurrencePage([newRun])); await newLoad.promise })
    expect(await screen.findByText('Line B occurrence · Open')).toBeInTheDocument()

    await act(async () => { oldLoad.resolve(occurrencePage([oldRun])); await oldLoad.promise })
    await waitFor(() => expect(screen.queryByText('Line A occurrence · Open')).not.toBeInTheDocument())
    expect(screen.getByText('Line B occurrence · Open')).toBeInTheDocument()
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
    mockListOccurrences.mockResolvedValue(occurrencePage([RUN, runB]))
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

  it('a failed cancellation keeps the typed reason; one retry cancels once and closes the dialog', async () => {
    mockCancelRun.mockRejectedValueOnce(new Error('offline'))
    renderControls()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel occurrence' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Cancel this occurrence?' })
    await userEvent.type(screen.getByRole('textbox', { name: 'Reason for cancellation' }), 'Merged into the event.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel occurrence' }))
    await waitFor(() => expect(mockCancelRun).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Reason for cancellation' })).toHaveValue('Merged into the event.')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel occurrence' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(mockCancelRun).toHaveBeenCalledTimes(2)
    expect(mockCancelRun).toHaveBeenLastCalledWith(RUN_ID, 'Merged into the event.')
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
