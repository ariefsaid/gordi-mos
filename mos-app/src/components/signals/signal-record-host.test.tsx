import { StrictMode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'

// C3 (KNOWN GAP 2): signal-record.tsx (B15) is fully presentational — this host fetches via
// getSignal + comments + revisions + acknowledgements and wires the mutations (acknowledge,
// add-category/correct, link task, create follow-up task).

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

vi.mock('@/lib/db/signals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/signals')>()
  return {
    ...actual,
    getSignal: vi.fn(),
    listSignalRevisions: vi.fn(),
    listAllTeams: vi.fn(),
    getTeamSite: vi.fn(),
    correctSignal: vi.fn(),
    acknowledgeSignal: vi.fn(),
    canRetractSignal: vi.fn(),
    linkSignalTask: vi.fn(),
    retractSignal: vi.fn(),
    loadMentionRosters: vi.fn(),
  }
})
import {
  getSignal, listSignalRevisions, listAllTeams, getTeamSite, correctSignal, acknowledgeSignal,
  canRetractSignal, linkSignalTask, retractSignal, loadMentionRosters,
} from '@/lib/db/signals'

const directoryMocks = vi.hoisted(() => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
  getPersonTeams: vi.fn(),
  getTeamsByIds: vi.fn(),
}))
vi.mock('@/lib/db/directory', () => directoryMocks)
import { getBusinessUnits, getPeople } from '@/lib/db/directory'

vi.mock('@/lib/db/tasks', () => ({
  getTaskTitlesByIds: vi.fn(),
  searchTasksByTitle: vi.fn(),
  createTask: vi.fn(),
}))
import { getTaskTitlesByIds, searchTasksByTitle, createTask } from '@/lib/db/tasks'
import type { TaskTitleRef } from '@/lib/db/tasks'

vi.mock('@/lib/comments/postComment', () => ({ listComments: vi.fn(), postComment: vi.fn() }))
import { listComments, postComment } from '@/lib/comments/postComment'

vi.mock('@/shell/signal-composer-host', () => ({
  useSignalComposer: vi.fn(),
}))
import { useSignalComposer } from '@/shell/signal-composer-host'

const mockOpenComposer = vi.fn()
const mockUseSignalComposer = vi.mocked(useSignalComposer)

import { SignalRecordHost } from './signal-record-host'

const mockGetSignal = vi.mocked(getSignal)
const mockListSignalRevisions = vi.mocked(listSignalRevisions)
const mockListAllTeams = vi.mocked(listAllTeams)
const mockGetTeamSite = vi.mocked(getTeamSite)
const mockCorrectSignal = vi.mocked(correctSignal)
const mockAcknowledgeSignal = vi.mocked(acknowledgeSignal)
const mockCanRetractSignal = vi.mocked(canRetractSignal)
const mockLinkSignalTask = vi.mocked(linkSignalTask)
const mockRetractSignal = vi.mocked(retractSignal)
const mockLoadMentionRosters = vi.mocked(loadMentionRosters)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockGetPeople = vi.mocked(getPeople)
const mockGetPersonTeams = directoryMocks.getPersonTeams
const mockGetTeamsByIds = directoryMocks.getTeamsByIds
const mockGetTaskTitlesByIds = vi.mocked(getTaskTitlesByIds)
const mockSearchTasksByTitle = vi.mocked(searchTasksByTitle)
const mockCreateTask = vi.mocked(createTask)
const mockListComments = vi.mocked(listComments)
const mockPostComment = vi.mocked(postComment)

const SIGNAL_ID = 'signal-1'
const VIEWER_ID = 'person-author-a'
const TEAM_ID = 'team-hq'
const BU_ID = 'bu-retail'

const baseSignal = {
  id: SIGNAL_ID, author_id: 'person-dewi', owning_team_id: TEAM_ID,
  occurred_at: '2026-07-16T02:00:00Z', body: 'The freezer alarm went off',
  attention: 'Needs attention' as const, category: null, source: 'human' as const,
  retracted_at: null, retract_reason: null, edited_at: null,
  created_at: '2026-07-16T02:00:00Z',
}

function authedViewer(personId = VIEWER_ID): Extract<AuthState, { status: 'authenticated' }> {
  return {
    status: 'authenticated',
    viewer: {
      // `must_change_password` is on this line's `PeopleRow` (the credential security series that
      // exists only here); v4's fixture predates it.
      person: {
        id: personId, org_id: 'org-1', user_id: 'u1', full_name: 'Author One', email: null,
        archived_at: null, must_change_password: false, created_at: '', updated_at: '',
      },
      roles: [], isManager: false, accessRoles: [], affiliated: [],
    },
    signOut: vi.fn(),
  }
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

function renderHost(props: Partial<React.ComponentProps<typeof SignalRecordHost>> = {}) {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <SignalRecordHost signalId={SIGNAL_ID} {...props} />
        <LocationProbe />
      </I18nProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(authedViewer())
  mockCanRetractSignal.mockResolvedValue(false)
  mockUseSignalComposer.mockReturnValue({ open: mockOpenComposer, postCount: 0 })
  mockGetSignal.mockResolvedValue({
    signal: baseSignal,
    mentions: [{ id: 'm1', signal_id: SIGNAL_ID, mention_kind: 'person', target_person_id: 'person-peer', target_team_id: null, target_bu_id: null, revoked_at: null }],
    acknowledgements: [],
    tasks: [],
  })
  mockListSignalRevisions.mockResolvedValue([])
  mockListAllTeams.mockResolvedValue([{ id: TEAM_ID, name: 'HQ Operations', business_unit_id: BU_ID, site_id: 'site-1', is_primary: false }])
  mockGetTeamSite.mockResolvedValue({ id: 'site-1', name: 'Gordi HQ' })
  mockGetBusinessUnits.mockResolvedValue([{ id: BU_ID, name: 'Retail Ops' }])
  mockGetPeople.mockResolvedValue([
    { id: 'person-dewi', full_name: 'Dewi Director' },
    { id: 'person-peer', full_name: 'Peer Person' },
    { id: VIEWER_ID, full_name: 'Author One' },
  ])
  mockGetPersonTeams.mockResolvedValue([])
  mockGetTeamsByIds.mockResolvedValue([])
  mockGetTaskTitlesByIds.mockResolvedValue([])
  mockSearchTasksByTitle.mockResolvedValue([])
  mockCreateTask.mockResolvedValue('task-created')
  mockListComments.mockResolvedValue([])
  mockLoadMentionRosters.mockResolvedValue({ teamMembers: {}, buMembers: {} })
})

describe('SignalRecordHost — loading/error states', () => {
  it('shows a loading state, then the resolved record', async () => {
    renderHost()
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The freezer alarm went off' })).toBeInTheDocument())
  })

  it('copies the canonical Signal URL from a nested collection stack', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    // userEvent installs its own clipboard stub during setup; replace it with the assertion spy.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(
      <MemoryRouter basename="/mos" initialEntries={['/mos/work/signals?record=signal-1']}>
        <I18nProvider>
          <SignalRecordHost signalId={SIGNAL_ID} />
        </I18nProvider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByRole('heading', { name: 'The freezer alarm went off' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /more signal actions/i }))
    await user.click(screen.getByRole('menuitem', { name: /copy link/i }))

    expect(writeText).toHaveBeenCalledWith(new URL('/mos/work/signals/signal-1', window.location.origin).href)
  })

  it('shows an honest outside-access state when the primary read is denied', async () => {
    mockGetSignal.mockRejectedValueOnce(new Error('permission denied (42501)'))
    renderHost()

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Signal outside your access' })).toBeInTheDocument())
    expect(screen.getByText(/do not have access to this Signal/i)).toBeInTheDocument()
    expect(screen.queryByText(/couldn.t load/i)).toBeNull()
  })

  it('shows an error state with retry when getSignal fails', async () => {
    mockGetSignal.mockRejectedValueOnce(new Error('boom'))
    renderHost()
    await waitFor(() => expect(screen.getByText(/couldn.t load/i)).toBeInTheDocument())

    mockGetSignal.mockResolvedValueOnce({ signal: baseSignal, mentions: [], acknowledgements: [], tasks: [] })
    await userEvent.click(screen.getByRole('button', { name: /retry|try again/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The freezer alarm went off' })).toBeInTheDocument())
  })

  it('treats PostgREST no-row responses as missing records', async () => {
    mockGetSignal.mockRejectedValueOnce(new Error('JSON object requested, multiple (or no) rows returned'))
    renderHost()
    await waitFor(() => expect(screen.getByText('That Signal no longer exists.')).toBeInTheDocument())
  })
})

describe('SignalRecordHost — resolves names + mentions from the DAL', () => {
  // P1-3: author/Team/BU/Site now render as the shared RecordViewer Facts rows (record-field
  // chips), not SignalRecord's own `.signal-record-author` etc. classes — those moved out.
  it('renders author/Team/BU/Site names resolved client-side', async () => {
    renderHost()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The freezer alarm went off' })).toBeInTheDocument())
    const facts = document.querySelector('[data-content-slot="facts"]') as HTMLElement
    expect(within(facts).getByText('Dewi Director')).toBeInTheDocument()
    expect(within(facts).getByText('HQ Operations')).toBeInTheDocument()
    expect(within(facts).getByText('Retail Ops')).toBeInTheDocument()
    expect(within(facts).getByText('Gordi HQ')).toBeInTheDocument()
    expect(screen.getByText('@Peer Person')).toBeInTheDocument()
  })
})

describe('SignalRecordHost — retract and repost (P-22/OD-45, AC-412)', () => {
  it('offers retract to the author, requires a reason, retracts, and opens a prefilled repost composer', async () => {
    mockUseAuth.mockReturnValue(authedViewer(VIEWER_ID))
    mockCanRetractSignal.mockResolvedValue(true)
    mockGetSignal.mockResolvedValue({
      signal: { ...baseSignal, author_id: VIEWER_ID },
      mentions: [{ id: 'm1', signal_id: SIGNAL_ID, mention_kind: 'person', target_person_id: 'person-peer', target_team_id: null, target_bu_id: null, revoked_at: null }],
      acknowledgements: [], tasks: [],
    })
    mockRetractSignal.mockResolvedValue(undefined)
    renderHost()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The freezer alarm went off' })).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /more signal actions/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /^retract$/i }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('textbox', { name: /reason/i })).toBeRequired()
    expect(within(dialog).getByRole('button', { name: /retract/i })).toBeDisabled()
    await userEvent.type(within(dialog).getByRole('textbox', { name: /reason/i }), 'Wrong provenance')
    mockGetSignal.mockResolvedValueOnce({
      signal: { ...baseSignal, author_id: VIEWER_ID, retracted_at: '2026-07-17T02:00:00Z', retract_reason: 'Wrong provenance' },
      mentions: [{ id: 'm1', signal_id: SIGNAL_ID, mention_kind: 'person', target_person_id: 'person-peer', target_team_id: null, target_bu_id: null, revoked_at: null }],
      acknowledgements: [], tasks: [],
    })
    await userEvent.click(within(dialog).getByRole('button', { name: /retract/i }))

    expect(mockRetractSignal).toHaveBeenCalledWith(SIGNAL_ID, 'Wrong provenance')
    await waitFor(() => expect(screen.getByText(/this signal was retracted/i, { selector: '.signal-tombstone p' })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /^repost$/i }))
    expect(mockOpenComposer).toHaveBeenCalledWith(expect.objectContaining({
      body: baseSignal.body, owningTeamId: TEAM_ID,
      mentions: [{ kind: 'person', targetId: 'person-peer', label: 'Peer Person' }],
    }))
  })

  it('refreshes the collection after retracting', async () => {
    const onReload = vi.fn()
    mockUseAuth.mockReturnValue(authedViewer('person-dewi'))
    mockCanRetractSignal.mockResolvedValue(true)
    mockGetSignal.mockResolvedValue({ signal: { ...baseSignal, author_id: 'person-dewi' }, mentions: [], acknowledgements: [], tasks: [] })
    mockRetractSignal.mockResolvedValue(undefined)
    renderHost({ onReload })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The freezer alarm went off' })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /more signal actions/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /^retract$/i }))
    await userEvent.type(within(screen.getByRole('dialog')).getByRole('textbox', { name: /reason/i }), 'Duplicate')
    mockGetSignal.mockResolvedValueOnce({ signal: { ...baseSignal, author_id: 'person-dewi', retracted_at: '2026-07-17T02:00:00Z', retract_reason: 'Duplicate' }, mentions: [], acknowledgements: [], tasks: [] })
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /retract/i }))
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1))
  })

  it('hides retract from a plain viewer', async () => {
    renderHost()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The freezer alarm went off' })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /more signal actions/i }))
    expect(screen.queryByRole('menuitem', { name: /^retract$/i })).toBeNull()
  })

  it.each([
    { actor: 'person-retired-lead', actorName: 'Former Team Lead', expected: 'Former Team Lead' },
    { actor: null, actorName: null, expected: 'Not recorded' },
  ])('attributes the tombstone to its recorded actor ($expected)', async ({ actor, actorName, expected }) => {
    mockGetSignal.mockResolvedValue({
      signal: {
        ...baseSignal, author_id: VIEWER_ID,
        retracted_at: '2026-07-17T02:00:00Z', retract_reason: 'Duplicate',
        retracted_by: actor, retracted_by_name: actorName,
      },
      mentions: [], acknowledgements: [], tasks: [],
    })
    renderHost()
    const label = await screen.findByText('Retracted by')
    expect(label.nextElementSibling).toHaveTextContent(expected)
    expect(label.nextElementSibling).not.toHaveTextContent('Author One')
  })
})

describe('SignalRecordHost — Acknowledge wiring (FR-412)', () => {
  it('calls acknowledgeSignal and reflects the acknowledged state after refetch', async () => {
    mockAcknowledgeSignal.mockResolvedValue(undefined)
    renderHost()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The freezer alarm went off' })).toBeInTheDocument())

    mockGetSignal.mockResolvedValueOnce({
      signal: baseSignal, mentions: [], tasks: [],
      acknowledgements: [{ id: 'a1', signal_id: SIGNAL_ID, person_id: VIEWER_ID, created_at: '2026-07-16T04:00:00Z' }],
    })
    await userEvent.click(screen.getByRole('button', { name: /^seen$/i }))

    expect(mockAcknowledgeSignal).toHaveBeenCalledWith(SIGNAL_ID)
    await waitFor(() => expect(screen.getByRole('button', { name: /^seen$/i })).toBeDisabled())
  })

  it('shows Acknowledged (disabled) when the viewer already acknowledged', async () => {
    mockGetSignal.mockResolvedValue({
      signal: baseSignal, mentions: [], tasks: [],
      acknowledgements: [{ id: 'a1', signal_id: SIGNAL_ID, person_id: VIEWER_ID, created_at: '2026-07-16T04:00:00Z' }],
    })
    renderHost()
    await waitFor(() => expect(screen.getByRole('button', { name: /^seen$/i })).toBeDisabled())
  })
})

describe('SignalRecordHost — Add category wiring (correctSignal, FR-410)', () => {
  it('lets the author raise attention and records the correction', async () => {
    mockCorrectSignal.mockResolvedValue(undefined)
    mockUseAuth.mockReturnValue(authedViewer('person-dewi'))
    renderHost()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The freezer alarm went off' })).toBeInTheDocument())

    mockGetSignal.mockResolvedValueOnce({ signal: { ...baseSignal, attention: 'Urgent', edited_at: '2026-07-16T05:00:00Z' }, mentions: [], acknowledgements: [], tasks: [] })
    await userEvent.click(screen.getByRole('button', { name: /edit attention/i }))
    await userEvent.click(screen.getByRole('option', { name: /urgent/i }))

    expect(mockCorrectSignal).toHaveBeenCalledWith(SIGNAL_ID, { attention: 'Urgent' })
    await waitFor(() => expect(screen.getByText('Urgent')).toBeInTheDocument())
  })

  it('offers the attention editor to the author only — a signal.retract deputy gets no editor (gate refuses non-author content, 42501)', async () => {
    const deputy = authedViewer('person-peer')
    deputy.viewer.accessRoles = ['signal.retract']
    mockUseAuth.mockReturnValue(deputy)
    renderHost()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The freezer alarm went off' })).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: /edit attention/i })).toBeNull()
    expect(mockCorrectSignal).not.toHaveBeenCalled()
  })

  it('opens the category picker and calls correctSignal with the chosen family', async () => {
    mockCorrectSignal.mockResolvedValue(undefined)
    renderHost()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The freezer alarm went off' })).toBeInTheDocument())

    mockGetSignal.mockResolvedValueOnce({ signal: { ...baseSignal, category: 'Equipment/facility' }, mentions: [], acknowledgements: [], tasks: [] })
    await userEvent.click(screen.getByRole('button', { name: /add category/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Equipment/facility' }))

    expect(mockCorrectSignal).toHaveBeenCalledWith(SIGNAL_ID, { category: 'Equipment/facility' })
    await waitFor(() => expect(screen.getByText('Equipment/facility')).toBeInTheDocument())
  })
})

describe('SignalRecordHost — comment thread reuse (postComment/listComments, Rule 11)', () => {
  it('posts a comment via the reused entityType=signal comment DAL', async () => {
    mockPostComment.mockResolvedValue('c1')
    renderHost()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The freezer alarm went off' })).toBeInTheDocument())

    mockListComments.mockResolvedValueOnce([{ id: 'c1', author_id: VIEWER_ID, body: 'On it', created_at: '2026-07-16T05:00:00Z' }])
    const box = screen.getByRole('textbox', { name: /^comment$/i })
    await userEvent.type(box, 'On it')
    await userEvent.click(screen.getByRole('button', { name: /post comment/i }))

    // #584 review: pins actorId/actorName/locale so a call-site regression (e.g. dropping the
    // viewer wiring) fails here rather than silently shipping a blank-actor notification.
    expect(mockPostComment).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'signal', entityId: SIGNAL_ID, body: 'On it',
      actorId: VIEWER_ID, actorName: 'Author One', locale: 'en',
    }))
    await waitFor(() => expect(screen.getByText('On it')).toBeInTheDocument())
  })
})

describe('SignalRecordHost — Create follow-up Task (canonical Task composer, P-23/OD-39)', () => {
  it('opens the canonical Task create stack in place with Signal context prefilled', async () => {
    renderHost()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The freezer alarm went off' })).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /create task/i }))

    const title = await screen.findByRole('textbox', { name: /^title$/i })
    expect(title).toHaveValue('The freezer alarm went off')
    expect(screen.getByText(/from signal: the freezer alarm went off/i)).toBeInTheDocument()
    expect(screen.getByTestId('location')).not.toHaveTextContent('/work/tasks')
  })

  it('keeps a dirty draft guarded after Stay is chosen in the discard confirmation', async () => {
    renderHost()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The freezer alarm went off' })).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /create task/i }))
    const title = await screen.findByRole('textbox', { name: /^title$/i })
    await userEvent.type(title, ' — updated')

    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    const confirmationTitle = await screen.findByRole('heading', { name: /discard unsaved changes/i })
    const confirmation = confirmationTitle.closest('[role="dialog"]') as HTMLElement
    expect(confirmation).toHaveTextContent(/this task/i)
    await userEvent.click(within(confirmation).getByRole('button', { name: /^cancel$/i }))

    expect(screen.getByRole('textbox', { name: /^title$/i })).toHaveValue('The freezer alarm went off — updated')
    expect(screen.queryByRole('heading', { name: /discard unsaved changes/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(await screen.findByRole('heading', { name: /discard unsaved changes/i })).toBeInTheDocument()
  })

  it('keeps the Task composer retryable when linking the newly-created Task fails', async () => {
    mockGetPersonTeams.mockResolvedValue([{
      id: TEAM_ID,
      name: 'HQ Operations',
      businessUnitId: BU_ID,
      siteId: 'site-1',
      orgId: 'org-1',
    }])
    mockLinkSignalTask.mockRejectedValueOnce(new Error('link unavailable'))
    renderHost()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The freezer alarm went off' })).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /create task/i }))
    await screen.findByRole('textbox', { name: /^title$/i })
    await userEvent.click(await screen.findByRole('combobox', { name: /supervisor/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Author One' }))
    const taskComposer = document.querySelector('.signal-task-create-frame') as HTMLElement
    expect(taskComposer).toBeInTheDocument()
    await userEvent.click(within(taskComposer).getByRole('button', { name: /^create task$/i }))

    await waitFor(() => expect(mockLinkSignalTask).toHaveBeenCalledWith(SIGNAL_ID, 'task-created'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be updated/i)
    expect(screen.queryByRole('textbox', { name: /^title$/i })).not.toBeInTheDocument()
    expect(within(taskComposer).getByRole('button', { name: /retry link/i })).toHaveAttribute('data-task-id', 'task-created')

    await userEvent.click(within(taskComposer).getByRole('button', { name: /retry link/i }))

    await waitFor(() => expect(mockLinkSignalTask).toHaveBeenCalledTimes(2))
    expect(mockLinkSignalTask).toHaveBeenNthCalledWith(2, SIGNAL_ID, 'task-created')
    expect(mockCreateTask).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('button', { name: /retry link/i })).not.toBeInTheDocument())
  })
})

describe('SignalRecordHost — related Task read failure', () => {
  it('does not turn a failed Task read into an empty linked-work state and offers retry', async () => {
    mockGetSignal.mockResolvedValueOnce({
      signal: baseSignal, mentions: [], acknowledgements: [],
      tasks: [{ id: 'st1', signal_id: SIGNAL_ID, task_id: 'task-a', created_by: VIEWER_ID }],
    })
    mockGetTaskTitlesByIds.mockRejectedValueOnce(new Error('network unavailable'))
    renderHost()
    await screen.findByRole('heading', { name: 'The freezer alarm went off' })

    expect(await screen.findByText("Couldn't load linked work.")).toBeInTheDocument()
    mockGetTaskTitlesByIds.mockResolvedValueOnce([])
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(screen.queryByText("Couldn't load linked work.")).not.toBeInTheDocument())
  })
})

describe('SignalRecordHost — Link existing Task (linkSignalTask, FR-413)', () => {
  it('opens a Task picker and links the selected Task', async () => {
    mockSearchTasksByTitle.mockResolvedValue([
      { id: 'task-a', title: 'Repair freezer', status: 'Open' },
    ])
    mockLinkSignalTask.mockResolvedValue(undefined)
    renderHost()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The freezer alarm went off' })).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /more signal actions/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /link existing task/i }))
    expect(mockSearchTasksByTitle).not.toHaveBeenCalled()
    const search = screen.getByRole('searchbox', { name: /search tasks/i })
    await userEvent.type(search, 'Repair freezer')
    const picker = await screen.findByRole('combobox', { name: /existing task/i })
    await userEvent.click(picker)
    await userEvent.click(screen.getByRole('option', { name: 'Repair freezer' }))

    mockGetSignal.mockResolvedValueOnce({
      signal: baseSignal, mentions: [], acknowledgements: [],
      tasks: [{ id: 'st1', signal_id: SIGNAL_ID, task_id: 'task-a', created_by: VIEWER_ID }],
    })
    await userEvent.click(screen.getByRole('button', { name: /^link$/i }))

    expect(mockLinkSignalTask).toHaveBeenCalledWith(SIGNAL_ID, 'task-a')
    expect(mockSearchTasksByTitle).toHaveBeenCalledWith('Repair freezer')
    await waitFor(() => expect(mockGetTaskTitlesByIds).toHaveBeenCalledWith(['task-a'], { includeArchived: false }))
  })

  it('keeps candidate search retryable when the demand-driven Task search fails', async () => {
    mockSearchTasksByTitle.mockRejectedValue(new Error('search unavailable'))
    renderHost()
    await screen.findByRole('heading', { name: 'The freezer alarm went off' })

    await userEvent.click(screen.getByRole('button', { name: /more signal actions/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /link existing task/i }))
    await userEvent.type(screen.getByRole('searchbox', { name: /search tasks/i }), 'repair')

    expect(await screen.findByText("Couldn't load linked work.")).toBeInTheDocument()
    mockSearchTasksByTitle.mockResolvedValue([
      { id: 'task-a', title: 'Repair freezer', status: 'Open' },
    ])
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('combobox', { name: /existing task/i })).toBeInTheDocument()
    expect(mockSearchTasksByTitle).toHaveBeenCalledWith('repair')
  })
})

describe('SignalRecordHost — Linked-work rows (FR-413)', () => {
  it('renders the primary record before the related-task read resolves', async () => {
    let resolveTasks: (rows: TaskTitleRef[]) => void = () => undefined
    mockGetSignal.mockReset()
    mockGetSignal.mockResolvedValue({
      signal: { ...baseSignal, body: 'Primary line\nDeferred details' }, mentions: [], acknowledgements: [],
      tasks: [{ id: 'st1', signal_id: SIGNAL_ID, task_id: 'task-a', created_by: VIEWER_ID }],
    })
    mockGetTaskTitlesByIds.mockImplementation(() => new Promise<TaskTitleRef[]>((resolve) => { resolveTasks = resolve }))

    renderHost()
    await screen.findByRole('heading', { name: 'Primary line' })
    expect(screen.getByText('Deferred details', { selector: '.signal-message-body' })).toBeInTheDocument()
    expect(screen.queryByText('Primary line', { selector: '.signal-message-body' })).toBeNull()
    expect(screen.getByText(/Loading linked work/i)).toBeInTheDocument()

    resolveTasks([{ id: 'task-a', title: 'Deferred task', status: 'Open' }])
    expect(mockGetTaskTitlesByIds).toHaveBeenCalledWith(['task-a'], { includeArchived: false })
    expect(await screen.findByRole('link', { name: /Deferred task.*Open/i })).toHaveAttribute('href', '/work/tasks/task-a')
  })

  it('shows titled linked-work rows with status and Task links after the deferred load', async () => {
    mockGetSignal.mockResolvedValue({
      signal: baseSignal, mentions: [], acknowledgements: [],
      tasks: [
        { id: 'st1', signal_id: SIGNAL_ID, task_id: 'task-a', created_by: VIEWER_ID },
        { id: 'st2', signal_id: SIGNAL_ID, task_id: 'task-b', created_by: VIEWER_ID },
      ],
    })
    mockGetTaskTitlesByIds.mockResolvedValue([
      { id: 'task-a', title: 'A', status: 'Open' },
      { id: 'task-b', title: 'B', status: 'Done' },
    ])
    renderHost()
    await screen.findByText('A')
    const region = document.querySelector('[data-signal-region="reach"]') as HTMLElement
    expect(within(region).getByText('A')).toBeInTheDocument()
    expect(within(region).getByText('Open')).toBeInTheDocument()
    expect(within(region).getByText('B')).toBeInTheDocument()
    expect(within(region).getByText('Done')).toBeInTheDocument()
    expect(within(region).getByRole('link', { name: /A.*Open/i })).toHaveAttribute('href', '/work/tasks/task-a')
    expect(mockGetTaskTitlesByIds).toHaveBeenCalledWith(['task-a', 'task-b'], { includeArchived: false })
  })
})

// Close control moved OUT of SignalRecordHost into the shared RecordPanelHost chrome
// (spec record-panel-host.spec.md, FR-3: "signal-record-host.tsx becomes the panel's content,
// not its chrome"). The ✕ Close is now the host's job — proven by record-panel-host.test.tsx
// (chrome close → onClose) and signals-archive-page.test.tsx (Close clears ?record=). This host
// no longer renders a bespoke close button, so there is nothing to assert here.
describe('SignalRecordHost — renders as chrome-free content (FR-3)', () => {
  it('does not render its own close control (the host owns ✕ Close)', async () => {
    renderHost()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The freezer alarm went off' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /^close$/i })).toBeNull()
  })

  it('forwards mode="page" to the canonical page renderer', async () => {
    renderHost({ mode: 'page' })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'The freezer alarm went off' })).toBeInTheDocument())
    expect(document.querySelector('h1')?.textContent).toContain('The freezer alarm went off')
  })
})


it('R8: effect replay shares one primary read and starts enrichment once', async () => {
  render(<StrictMode><MemoryRouter><I18nProvider><SignalRecordHost signalId={SIGNAL_ID} /></I18nProvider></MemoryRouter></StrictMode>)
  expect(await screen.findByRole('heading', { name: 'The freezer alarm went off' })).toBeInTheDocument()
  expect(mockGetSignal).toHaveBeenCalledTimes(1)
  expect(mockListSignalRevisions).toHaveBeenCalledTimes(1)
})
