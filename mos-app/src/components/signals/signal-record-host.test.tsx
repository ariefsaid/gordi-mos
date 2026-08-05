import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    linkSignalTask: vi.fn(),
    createFollowUpTask: vi.fn(),
    loadMentionRosters: vi.fn(),
  }
})
import {
  getSignal, listSignalRevisions, listAllTeams, getTeamSite, correctSignal, acknowledgeSignal,
  linkSignalTask, createFollowUpTask, loadMentionRosters,
} from '@/lib/db/signals'

vi.mock('@/lib/db/directory', () => ({ getBusinessUnits: vi.fn(), getPeople: vi.fn() }))
import { getBusinessUnits, getPeople } from '@/lib/db/directory'

vi.mock('@/lib/db/tasks', () => ({ listTasks: vi.fn() }))
import { listTasks } from '@/lib/db/tasks'

vi.mock('@/lib/comments/postComment', () => ({ listComments: vi.fn(), postComment: vi.fn() }))
import { listComments, postComment } from '@/lib/comments/postComment'

import { SignalRecordHost } from './signal-record-host'

const mockGetSignal = vi.mocked(getSignal)
const mockListSignalRevisions = vi.mocked(listSignalRevisions)
const mockListAllTeams = vi.mocked(listAllTeams)
const mockGetTeamSite = vi.mocked(getTeamSite)
const mockCorrectSignal = vi.mocked(correctSignal)
const mockAcknowledgeSignal = vi.mocked(acknowledgeSignal)
const mockLinkSignalTask = vi.mocked(linkSignalTask)
const mockCreateFollowUpTask = vi.mocked(createFollowUpTask)
const mockLoadMentionRosters = vi.mocked(loadMentionRosters)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockGetPeople = vi.mocked(getPeople)
const mockListTasks = vi.mocked(listTasks)
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

function authedViewer(personId = VIEWER_ID): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      // `must_change_password` is on this line's `PeopleRow` (the credential security series that
      // exists only here); v4's fixture predates it.
      person: {
        id: personId, org_id: 'org-1', user_id: 'u1', full_name: 'Author One', email: null,
        archived_at: null, must_change_password: false, created_at: '', updated_at: '',
      },
      roles: [], isManager: false, accessRoles: [],
    },
    signOut: vi.fn(),
  }
}

function renderHost(props: Partial<React.ComponentProps<typeof SignalRecordHost>> = {}) {
  return render(
    <I18nProvider>
      <SignalRecordHost signalId={SIGNAL_ID} {...props} />
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(authedViewer())
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
  mockListTasks.mockResolvedValue([])
  mockListComments.mockResolvedValue([])
  mockLoadMentionRosters.mockResolvedValue({ teamMembers: {}, buMembers: {} })
})

describe('SignalRecordHost — loading/error states', () => {
  it('shows a loading state, then the resolved record', async () => {
    renderHost()
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off', { selector: '.signal-message-body' })).toBeInTheDocument())
  })

  it('shows an error state with retry when getSignal fails', async () => {
    mockGetSignal.mockRejectedValueOnce(new Error('boom'))
    renderHost()
    await waitFor(() => expect(screen.getByText(/couldn.t load/i)).toBeInTheDocument())

    mockGetSignal.mockResolvedValueOnce({ signal: baseSignal, mentions: [], acknowledgements: [], tasks: [] })
    await userEvent.click(screen.getByRole('button', { name: /retry|try again/i }))
    await waitFor(() => expect(screen.getByText('The freezer alarm went off', { selector: '.signal-message-body' })).toBeInTheDocument())
  })
})

describe('SignalRecordHost — resolves names + mentions from the DAL', () => {
  // P1-3: author/Team/BU/Site now render as the shared RecordViewer Facts rows (record-field
  // chips), not SignalRecord's own `.signal-record-author` etc. classes — those moved out.
  it('renders author/Team/BU/Site names resolved client-side', async () => {
    renderHost()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off', { selector: '.signal-message-body' })).toBeInTheDocument())
    const facts = document.querySelector('[data-content-slot="facts"]') as HTMLElement
    expect(within(facts).getByText('Dewi Director')).toBeInTheDocument()
    expect(within(facts).getByText('HQ Operations')).toBeInTheDocument()
    expect(within(facts).getByText('Retail Ops')).toBeInTheDocument()
    expect(within(facts).getByText('Gordi HQ')).toBeInTheDocument()
    expect(screen.getByText('@Peer Person')).toBeInTheDocument()
  })
})

describe('SignalRecordHost — Acknowledge wiring (FR-412)', () => {
  it('calls acknowledgeSignal and reflects the acknowledged state after refetch', async () => {
    mockAcknowledgeSignal.mockResolvedValue(undefined)
    renderHost()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off', { selector: '.signal-message-body' })).toBeInTheDocument())

    mockGetSignal.mockResolvedValueOnce({
      signal: baseSignal, mentions: [], tasks: [],
      acknowledgements: [{ id: 'a1', signal_id: SIGNAL_ID, person_id: VIEWER_ID, created_at: '2026-07-16T04:00:00Z' }],
    })
    await userEvent.click(screen.getByRole('button', { name: /^acknowledge$/i }))

    expect(mockAcknowledgeSignal).toHaveBeenCalledWith(SIGNAL_ID)
    await waitFor(() => expect(screen.getByRole('button', { name: /acknowledged/i })).toBeDisabled())
  })

  it('shows Acknowledged (disabled) when the viewer already acknowledged', async () => {
    mockGetSignal.mockResolvedValue({
      signal: baseSignal, mentions: [], tasks: [],
      acknowledgements: [{ id: 'a1', signal_id: SIGNAL_ID, person_id: VIEWER_ID, created_at: '2026-07-16T04:00:00Z' }],
    })
    renderHost()
    await waitFor(() => expect(screen.getByRole('button', { name: /acknowledged/i })).toBeDisabled())
  })
})

describe('SignalRecordHost — Add category wiring (correctSignal, FR-410)', () => {
  it('opens the category picker and calls correctSignal with the chosen family', async () => {
    mockCorrectSignal.mockResolvedValue(undefined)
    renderHost()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off', { selector: '.signal-message-body' })).toBeInTheDocument())

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
    await waitFor(() => expect(screen.getByText('The freezer alarm went off', { selector: '.signal-message-body' })).toBeInTheDocument())

    mockListComments.mockResolvedValueOnce([{ id: 'c1', author_id: VIEWER_ID, body: 'On it', created_at: '2026-07-16T05:00:00Z' }])
    const box = screen.getByRole('textbox', { name: /^comment$/i })
    await userEvent.type(box, 'On it')
    await userEvent.click(screen.getByRole('button', { name: /post comment/i }))

    expect(mockPostComment).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'signal', entityId: SIGNAL_ID, body: 'On it' }))
    await waitFor(() => expect(screen.getByText('On it')).toBeInTheDocument())
  })
})

describe('SignalRecordHost — Create follow-up Task (createFollowUpTask, FR-413)', () => {
  it('opens a minimal title form prefilled from the Signal body and creates the follow-up Task', async () => {
    mockCreateFollowUpTask.mockResolvedValue('task-new')
    renderHost()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off', { selector: '.signal-message-body' })).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /create follow-up task/i }))
    const titleInput = screen.getByRole('textbox', { name: /task title/i })
    expect(titleInput).toHaveValue('The freezer alarm went off')

    mockGetSignal.mockResolvedValueOnce({
      signal: baseSignal, mentions: [], acknowledgements: [],
      tasks: [{ id: 'st1', signal_id: SIGNAL_ID, task_id: 'task-new', created_by: VIEWER_ID }],
    })
    await userEvent.click(screen.getByRole('button', { name: /^save$|^create$/i }))

    expect(mockCreateFollowUpTask).toHaveBeenCalledWith(SIGNAL_ID, expect.objectContaining({
      title: 'The freezer alarm went off',
      businessUnitId: BU_ID,
      responsiblePersonId: VIEWER_ID,
      accountablePersonId: VIEWER_ID,
      createdBy: VIEWER_ID,
    }))
  })
})

describe('SignalRecordHost — Link existing Task (linkSignalTask, FR-413)', () => {
  it('opens a Task picker and links the selected Task', async () => {
    mockListTasks.mockResolvedValue([
      { id: 'task-a', org_id: 'org-1', title: 'Repair freezer', business_unit_id: BU_ID, status: 'Open', responsible_person_id: 'x', accountable_person_id: 'x', consulted_person_ids: [], informed_person_ids: [], description: null, due_date: null, objective_id: null, work_line_id: null, last_activity_at: '', archived_at: null, created_by: 'x', created_at: '', updated_at: '' },
    ])
    mockLinkSignalTask.mockResolvedValue(undefined)
    renderHost()
    await waitFor(() => expect(screen.getByText('The freezer alarm went off', { selector: '.signal-message-body' })).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /link existing task/i }))
    const picker = await screen.findByRole('combobox', { name: /existing task/i })
    await userEvent.selectOptions(picker, 'task-a')

    mockGetSignal.mockResolvedValueOnce({
      signal: baseSignal, mentions: [], acknowledgements: [],
      tasks: [{ id: 'st1', signal_id: SIGNAL_ID, task_id: 'task-a', created_by: VIEWER_ID }],
    })
    await userEvent.click(screen.getByRole('button', { name: /^link$/i }))

    expect(mockLinkSignalTask).toHaveBeenCalledWith(SIGNAL_ID, 'task-a')
  })
})

describe('SignalRecordHost — Linked-work summary (summarizeLinkedTasks, FR-413)', () => {
  it('shows the total/open counts derived from listTasks statuses', async () => {
    mockGetSignal.mockResolvedValue({
      signal: baseSignal, mentions: [], acknowledgements: [],
      tasks: [
        { id: 'st1', signal_id: SIGNAL_ID, task_id: 'task-a', created_by: VIEWER_ID },
        { id: 'st2', signal_id: SIGNAL_ID, task_id: 'task-b', created_by: VIEWER_ID },
      ],
    })
    mockListTasks.mockResolvedValue([
      { id: 'task-a', org_id: 'org-1', title: 'A', business_unit_id: BU_ID, status: 'Open', responsible_person_id: 'x', accountable_person_id: 'x', consulted_person_ids: [], informed_person_ids: [], description: null, due_date: null, objective_id: null, work_line_id: null, last_activity_at: '', archived_at: null, created_by: 'x', created_at: '', updated_at: '' },
      { id: 'task-b', org_id: 'org-1', title: 'B', business_unit_id: BU_ID, status: 'Done', responsible_person_id: 'x', accountable_person_id: 'x', consulted_person_ids: [], informed_person_ids: [], description: null, due_date: null, objective_id: null, work_line_id: null, last_activity_at: '', archived_at: null, created_by: 'x', created_at: '', updated_at: '' },
    ])
    renderHost()
    await screen.findByText(/2 Tasks/)
    const region = document.querySelector('[data-signal-region="reach"]') as HTMLElement
    await waitFor(() => expect(within(region).getByText(/2 Tasks/)).toBeInTheDocument())
    expect(within(region).getByText(/1 open/)).toBeInTheDocument()
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
    await waitFor(() => expect(screen.getByText('The freezer alarm went off', { selector: '.signal-message-body' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /^close$/i })).toBeNull()
  })

  it('forwards mode="page" to the canonical page renderer', async () => {
    renderHost({ mode: 'page' })
    await waitFor(() => expect(screen.getByText('The freezer alarm went off', { selector: '.signal-message-body' })).toBeInTheDocument())
    expect(document.querySelector('h1')?.textContent).toContain('The freezer alarm went off')
  })
})
