// The Private row, "None, just me" and the meeting origin on the Task page (#1839 UI).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { TaskRow } from '@/lib/db/tasks.types'
import { TaskSurface } from './task-surface'
import type { TaskMeetingOrigin } from './task-record-document'

vi.mock('../../lib/db/tasks', () => ({
  getTask: vi.fn(), listTaskEventsPage: vi.fn(), createTask: vi.fn(), updateTaskStatus: vi.fn(), updateTaskFields: vi.fn(),
  addChecklistItem: vi.fn(), toggleChecklistItem: vi.fn(), reorderChecklistItem: vi.fn(), deleteChecklistItem: vi.fn(),
  archiveTask: vi.fn(), unarchiveTask: vi.fn(), setTaskPrivate: vi.fn(),
}))
vi.mock('../../lib/db/task-viewers', () => ({ listTaskViewers: vi.fn(), addTaskViewer: vi.fn(), removeTaskViewer: vi.fn() }))
vi.mock('../../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(), getPeople: vi.fn(), getPersonTeams: vi.fn(), getTeamsByIds: vi.fn(),
  getDownlinePersonIds: vi.fn(), getDirectManagerPersonIds: () => Promise.resolve([]),
}))
vi.mock('@/lib/db/meetings', () => ({ getMeeting: vi.fn() }))
vi.mock('../../lib/comments/postComment', () => ({ listComments: vi.fn(), postComment: vi.fn() }))
vi.mock('../../lib/db/objectives', () => ({ listObjectives: vi.fn(), readObjective: vi.fn() }))
vi.mock('@/lib/db/work-lines', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/db/work-lines')>()), listWorkLines: vi.fn(),
}))

import { getTask, setTaskPrivate } from '@/lib/db/tasks'
import { listTaskViewers, addTaskViewer, removeTaskViewer } from '@/lib/db/task-viewers'
import { getBusinessUnits, getPeople, getPersonTeams, getTeamsByIds, getDownlinePersonIds } from '@/lib/db/directory'
import { listComments } from '@/lib/comments/postComment'
import { getMeeting } from '@/lib/db/meetings'
import type { MeetingDetail } from '@/lib/db/meetings.types'
import { listObjectives, readObjective } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'

const ME = 'me-id'
const DEWI = 'dewi-id'
const BUDI = 'budi-id'
const authed = {
  status: 'authenticated',
  viewer: {
    person: { id: ME, full_name: 'Cahya Cafe' }, roles: [], isManager: false, accessRoles: [], affiliated: [],
  },
  signOut: async () => {},
} as unknown as AuthState

function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'task-abc', org_id: 'org', title: 'Order oat milk', business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: ME, accountable_person_id: DEWI, consulted_person_ids: [], informed_person_ids: [],
    description: null, due_date: null, objective_id: null, work_line_id: null, last_activity_at: '2026-06-11T08:00:00Z',
    archived_at: null, created_by: ME, created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
    is_private: false, ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  vi.mocked(getBusinessUnits).mockResolvedValue([{ id: 'bu-1', name: 'Cafe' }])
  vi.mocked(getPeople).mockResolvedValue([
    { id: ME, full_name: 'Cahya Cafe' }, { id: DEWI, full_name: 'Dewi Director' }, { id: BUDI, full_name: 'Budi Barista' },
  ])
  vi.mocked(getPersonTeams).mockResolvedValue([])
  vi.mocked(getTeamsByIds).mockResolvedValue([])
  vi.mocked(getDownlinePersonIds).mockResolvedValue([])
  vi.mocked(listComments).mockResolvedValue([])
  vi.mocked(listObjectives).mockResolvedValue([])
  vi.mocked(readObjective).mockResolvedValue(null)
  vi.mocked(listWorkLines).mockResolvedValue([])
  vi.mocked(listTaskViewers).mockResolvedValue([])
  vi.mocked(setTaskPrivate).mockResolvedValue()
  vi.mocked(addTaskViewer).mockResolvedValue()
  vi.mocked(removeTaskViewer).mockResolvedValue()
})

async function renderPage(task: TaskRow, opts: { meeting?: TaskMeetingOrigin; locale?: 'en' | 'id' } = {}) {
  vi.mocked(getTask).mockResolvedValue({ task, checklist: [], events: [] })
  render(
    <I18nProvider initialLocale={opts.locale ?? 'en'}>
      <AuthContext.Provider value={authed}>
        <MemoryRouter>
          <TaskSurface taskId={task.id} mode="view" width="full" meetingOrigin={opts.meeting} />
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
  )
  await screen.findByRole('heading', { level: 1, name: 'Order oat milk' })
}

describe('Task page — Private row', () => {
  it('turns Private on and off, saving at once', async () => {
    await renderPage(makeTask())
    expect(screen.getByRole('switch', { name: 'Private' })).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(screen.getByRole('switch', { name: 'Private' }))
    await waitFor(() => expect(setTaskPrivate).toHaveBeenCalledWith('task-abc', true, ME))
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Private' })).toHaveAttribute('aria-checked', 'true'))
    expect(screen.getByText('Nobody added.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('switch', { name: 'Private' }))
    await waitFor(() => expect(setTaskPrivate).toHaveBeenLastCalledWith('task-abc', false, ME))
  })

  it('keeps the old state and offers Retry when the save fails', async () => {
    vi.mocked(setTaskPrivate).mockRejectedValueOnce(new Error('denied'))
    await renderPage(makeTask())
    await userEvent.click(screen.getByRole('switch', { name: 'Private' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(setTaskPrivate).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Private' })).toHaveAttribute('aria-checked', 'true'))
  })

  it('tells a manager who loses read access that the change is saved, with no error', async () => {
    vi.mocked(getDownlinePersonIds).mockResolvedValue([DEWI])
    await renderPage(makeTask({ responsible_person_id: DEWI, accountable_person_id: BUDI, created_by: DEWI }))
    await userEvent.click(screen.getByRole('switch', { name: 'Private' }))
    expect(await screen.findByRole('heading', { name: 'Task is now private' })).toBeInTheDocument()
    expect(screen.getByText(/Your change is saved/)).toBeInTheDocument()
    expect(setTaskPrivate).toHaveBeenCalledWith('task-abc', true, ME)
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.getByRole('link', { name: 'All tasks →' })).toBeInTheDocument()
  })

  it('lists the extra people and adds and removes one', async () => {
    vi.mocked(listTaskViewers).mockResolvedValue([{ id: 'v1', org_id: 'org', task_id: 'task-abc', person_id: BUDI, created_by: ME, created_at: '' }])
    await renderPage(makeTask({ is_private: true }))
    expect(await screen.findByText('On · 1 more person can see')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Budi Barista' }))
    await waitFor(() => expect(removeTaskViewer).toHaveBeenCalledWith('task-abc', BUDI))
    expect(await screen.findByText('Nobody added.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }))
    await userEvent.click(await screen.findByText('Budi Barista', { selector: '.person-picker-label' }))
    await waitFor(() => expect(addTaskViewer).toHaveBeenCalledWith('task-abc', BUDI))
    expect(await screen.findByText('On · 1 more person can see')).toBeInTheDocument()
  })

  it('shows plain text, no switch, to someone who cannot edit the Task', async () => {
    await renderPage(makeTask({ responsible_person_id: DEWI, accountable_person_id: DEWI, created_by: DEWI, is_private: true }))
    expect(await screen.findByText('On')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add person' })).toBeNull()
  })

  it('reads Indonesian', async () => {
    await renderPage(makeTask(), { locale: 'id' })
    expect(screen.getByRole('switch', { name: 'Privat' })).toBeInTheDocument()
    expect(screen.getByText('Mati')).toBeInTheDocument()
  })
})

describe('Task page — Supervisor "None, just me"', () => {
  it('offers it on a private Task the PIC created, and shows it when Supervisor is the PIC', async () => {
    await renderPage(makeTask({ is_private: true, accountable_person_id: ME }))
    expect(screen.getByRole('button', { name: /Edit Supervisor$/ })).toHaveTextContent('None, just me')
    fireEvent.click(screen.getByRole('button', { name: /Edit Supervisor$/ }))
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('option', { name: 'None, just me' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Cahya Cafe' })).toBeNull()
  })

  it('does not offer it on a public Task', async () => {
    await renderPage(makeTask())
    fireEvent.click(screen.getByRole('button', { name: /Edit Supervisor$/ }))
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.queryByRole('option', { name: 'None, just me' })).toBeNull()
  })

  it('does not offer it when the PIC is not the creator', async () => {
    await renderPage(makeTask({ is_private: true, created_by: DEWI, accountable_person_id: DEWI }))
    fireEvent.click(screen.getByRole('button', { name: /Edit Supervisor$/ }))
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.queryByRole('option', { name: 'None, just me' })).toBeNull()
  })
})

describe('Task page — created in a Meeting', () => {
  const meeting = (over: Partial<TaskMeetingOrigin> = {}): TaskMeetingOrigin => ({ href: '/work/meetings/m1', title: 'Weekly sync', isPrivate: true, viewerIn: true, ...over })

  it('reads "everyone in the meeting" and links the Meeting in Details', async () => {
    await renderPage(makeTask({ is_private: true }), { meeting: meeting() })
    expect(screen.getByText('On · everyone in the meeting')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Private' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Record details' }))
    expect(screen.getByText('Created in meeting')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Weekly sync' })).toHaveAttribute('href', '/work/meetings/m1')
  })

  it('locks the switch and hides the Meeting name for someone outside a private Meeting', async () => {
    await renderPage(makeTask({ is_private: true }), { meeting: meeting({ viewerIn: false }) })
    expect(screen.getByText('On · everyone in the meeting')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Private' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Record details' }))
    expect(screen.getByText(/Private meeting/)).toBeInTheDocument()
    expect(screen.queryByText('Weekly sync')).toBeNull()
  })
})

describe('Task page — "Created in meeting" from the Task\'s own meeting_id', () => {
  const detail = (over: Partial<MeetingDetail> = {}) => ({
    id: 'm1', title: 'Weekly sync', isPrivate: false, attendeeIds: [ME], previous: null, next: null, ...over,
  }) as MeetingDetail

  it('links the Meeting it was created in, read from the Meeting', async () => {
    vi.mocked(getMeeting).mockResolvedValue(detail())
    await renderPage(makeTask({ meeting_id: 'm1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record details' }))
    expect(await screen.findByRole('link', { name: 'Weekly sync' })).toHaveAttribute('href', '/work/meetings/m1')
    expect(getMeeting).toHaveBeenCalledWith('m1')
  })

  it('shows "Private meeting", no name, when the Meeting is private and the viewer is not an attendee', async () => {
    vi.mocked(getMeeting).mockResolvedValue(detail({ isPrivate: true, attendeeIds: [DEWI] }))
    await renderPage(makeTask({ meeting_id: 'm1', is_private: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Record details' }))
    expect(await screen.findByText(/Private meeting/)).toBeInTheDocument()
    expect(screen.queryByText('Weekly sync')).toBeNull()
  })

  it('shows "Private meeting" on a private Task whose Meeting the viewer cannot read', async () => {
    vi.mocked(getMeeting).mockResolvedValue(null)
    await renderPage(makeTask({ meeting_id: 'm1', is_private: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Record details' }))
    expect(await screen.findByText(/Private meeting/)).toBeInTheDocument()
  })

  it('shows no Created-in-meeting row on a public Task whose Meeting the viewer cannot read', async () => {
    vi.mocked(getMeeting).mockResolvedValue(null)
    await renderPage(makeTask({ meeting_id: 'm1', is_private: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Record details' }))
    await waitFor(() => expect(getMeeting).toHaveBeenCalledWith('m1'))
    expect(screen.queryByText('Created in meeting')).toBeNull()
    expect(screen.queryByText(/Private meeting/)).toBeNull()
  })

  it('reads a Task made outside any Meeting without asking for one', async () => {
    await renderPage(makeTask())
    expect(getMeeting).not.toHaveBeenCalled()
  })
})
