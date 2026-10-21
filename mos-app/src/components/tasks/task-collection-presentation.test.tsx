import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { PendingTaskRow } from '@/lib/db/processes.types'
import type { PersonOption } from '@/lib/db/directory'
import { listPendingTasks } from '@/lib/db/processes'
import { TASK_COLLECTION_NEUTRAL_QUERY } from './task-collection-query'
import type { TaskCollectionContext, TaskRenderGroup } from './task-collection-adapter'
import { TaskCollectionRuntimeProvider, TaskTablePresentation } from './task-collection-presentation'
import type { TaskCollectionRuntime } from './task-collection-presentation'

vi.mock('@/lib/db/processes', () => ({
  listPendingTasks: vi.fn(),
  resolvePendingTask: vi.fn(),
}))

const PEOPLE: PersonOption[] = [
  { id: 'person-a', full_name: 'Twin A' },
  { id: 'person-b', full_name: 'Twin B' },
]

function deferred<T>() {
  let resolvePromise!: (value: T) => void
  let rejectPromise!: (reason?: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return { promise, resolve: resolvePromise, reject: rejectPromise }
}

function pendingTask(id: string): PendingTaskRow {
  return {
    id,
    process_run_id: id === 'pending-a' ? 'run-a' : 'run-b',
    task_def_id: `def-${id}`,
    candidate_person_ids: PEOPLE.map((person) => person.id),
    reason: 'multiple',
    resolved_at: null,
    title: id === 'pending-a' ? 'Task A' : 'Task B',
  }
}

const GROUPS: TaskRenderGroup[] = [
  {
    key: 'run-a', label: 'Occurrence A', rows: [], overdue: 0, prefillParam: '',
    occurrenceRollup: { total: 1, done: 0, overdue: 0, pendingUnresolved: 1 },
  },
  {
    key: 'run-b', label: 'Occurrence B', rows: [], overdue: 0, prefillParam: '',
    occurrenceRollup: { total: 1, done: 0, overdue: 0, pendingUnresolved: 1 },
  },
]

const CONTEXT: TaskCollectionContext = {
  businessUnits: [],
  people: PEOPLE,
  businessUnitNamesById: new Map(),
  personNamesById: new Map(),
  workLinesById: new Map(),
  workLineTypeById: new Map(),
  objectivesById: new Map(),
  runRollupsByRunId: new Map(),
  provenanceByTaskDefId: new Map(),
  rowsById: new Map(),
  viewerId: null,
  statusOverrides: new Map(),
  now: new Date('2026-09-10T00:00:00Z'),
  refresh: vi.fn(),
}

const RUNTIME: TaskCollectionRuntime = {
  selectedId: null,
  drawerOpen: false,
  splitLayout: false,
  isDesktop: true,
  hasPagedOlderDone: false,
  recordSearch: '',
  statusOverrides: new Map(),
  onOpenTask: vi.fn(),
  onEditTitle: vi.fn(async () => {}),
  onEditStatus: vi.fn(async () => {}),
  onEditDue: vi.fn(async () => {}),
  onEditPic: vi.fn(async () => {}),
  onEditTeam: vi.fn(async () => {}),
  onEditSupervisor: vi.fn(async () => {}),
  teamOptions: [],
  draftTask: null,
  onDiscardNewTask: vi.fn(),
  draftLinkError: false,
  onRetryDraftLink: vi.fn(),
  onCloseDrawer: vi.fn(),
  onNewTask: vi.fn(),
  onAddTask: vi.fn(),
  onRetry: vi.fn(),
  onClearFilters: vi.fn(),
  onSortChange: vi.fn(),
  onOverdueFilter: vi.fn(),
  onClearOverdue: vi.fn(),
  createHref: '/work/tasks/new',
  canResolvePending: true,
}

function renderTaskPresentation(locale: 'en' | 'id') {
  return render(
    <MemoryRouter>
      <I18nProvider initialLocale={locale}>
        <TaskCollectionRuntimeProvider value={RUNTIME}>
          <TaskTablePresentation
            query={{ ...TASK_COLLECTION_NEUTRAL_QUERY, groupBy: 'occurrence' }}
            projection={{
              visibleRecords: [],
              groups: GROUPS,
              totalRecords: 0,
              visibleRecordsAreFiltered: false,
            }}
            context={CONTEXT}
            selectedIds={new Set()}
            onToggleSelected={vi.fn()}
            onOpenRecord={vi.fn()}
            onToggleGroup={vi.fn()}
            isGroupCollapsed={() => false}
          />
        </TaskCollectionRuntimeProvider>
      </I18nProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('occurrence assignment loading', () => {
  it.each([
    ['en', 'success'], ['id', 'success'], ['en', 'failure'], ['id', 'failure'],
  ] as const)(
    'keeps the newest occurrence assignment visible after a stale response (%s, stale %s)',
    async (locale, staleOutcome) => {
      const earlierLoad = deferred<PendingTaskRow[]>()
      const newerLoad = deferred<PendingTaskRow[]>()
      vi.mocked(listPendingTasks).mockImplementation((runId) => (
        runId === 'run-a' ? earlierLoad.promise : newerLoad.promise
      ))
      const user = userEvent.setup()
      renderTaskPresentation(locale)

      const assignButtons = screen.getAllByRole('button', { name: /1 (to assign|perlu ditetapkan)/i })
      await user.click(assignButtons[0])
      await user.click(assignButtons[1])
      expect(listPendingTasks).toHaveBeenNthCalledWith(1, 'run-a')
      expect(listPendingTasks).toHaveBeenNthCalledWith(2, 'run-b')

      await act(async () => {
        newerLoad.resolve([pendingTask('pending-b')])
        await newerLoad.promise
      })
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'Occurrence B' })).toBeInTheDocument()
      expect(within(dialog).getByRole('heading', { name: /Task B/ })).toBeInTheDocument()

      await act(async () => {
        if (staleOutcome === 'success') {
          earlierLoad.resolve([pendingTask('pending-a')])
          await earlierLoad.promise
        } else {
          earlierLoad.reject(new Error('stale load failed'))
          await earlierLoad.promise.catch(() => {})
        }
      })
      expect(within(dialog).getByRole('heading', { name: /Task B/ })).toBeInTheDocument()
      expect(within(dialog).queryByRole('heading', { name: /Task A/ })).not.toBeInTheDocument()
      expect(within(dialog).getByRole('heading', { name: 'Occurrence B' })).toBeInTheDocument()
      expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    },
  )

  it.each(['en', 'id'] as const)('keeps load errors retryable in %s', async (locale) => {
    vi.mocked(listPendingTasks)
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce([pendingTask('pending-b')])
    const user = userEvent.setup()
    renderTaskPresentation(locale)

    const assignButtons = screen.getAllByRole('button', { name: /1 (to assign|perlu ditetapkan)/i })
    await user.click(assignButtons[1])
    await user.click(await screen.findByRole('button', { name: /try again|coba lagi/i }))

    expect(listPendingTasks).toHaveBeenNthCalledWith(1, 'run-b')
    expect(listPendingTasks).toHaveBeenNthCalledWith(2, 'run-b')
    expect(await screen.findByRole('heading', { name: /Task B/ })).toBeInTheDocument()
  })
})
