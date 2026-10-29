// The Private row, "None, just me" and the meeting origin on the Task page (#1839 UI).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
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

import { getTask, setTaskPrivate, updateTaskFields } from '@/lib/db/tasks'
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
  vi.mocked(updateTaskFields).mockResolvedValue()
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

  it('makes "None, just me" the Supervisor when the PIC who made the Task turns Private on', async () => {
    await renderPage(makeTask())
    await userEvent.click(screen.getByRole('switch', { name: 'Private' }))
    await waitFor(() => expect(updateTaskFields).toHaveBeenCalledWith('task-abc', { accountable_person_id: ME }, ME, DEWI))
    await waitFor(() => expect(screen.getByRole('button', { name: /Edit Supervisor$/ })).toHaveTextContent('None, just me'))
  })

  it('leaves the Supervisor alone when someone else is the PIC', async () => {
    vi.mocked(getDownlinePersonIds).mockResolvedValue([BUDI])
    await renderPage(makeTask({ responsible_person_id: BUDI, accountable_person_id: ME, created_by: ME }))
    await userEvent.click(screen.getByRole('switch', { name: 'Private' }))
    await waitFor(() => expect(setTaskPrivate).toHaveBeenCalledWith('task-abc', true, ME))
    expect(updateTaskFields).not.toHaveBeenCalled()
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

  it('keeps the Task open for a manager who attends the private Meeting it was made in', async () => {
    vi.mocked(getDownlinePersonIds).mockResolvedValue([DEWI])
    const task = makeTask({ responsible_person_id: DEWI, accountable_person_id: BUDI, created_by: DEWI, meeting_id: 'm1', created_in_private_meeting: true })
    await renderPage(task, { meeting: { href: '/work/meetings/m1', title: 'Ops sync', isPrivate: true, viewerIn: true } })
    await userEvent.click(screen.getByRole('switch', { name: 'Private' }))
    await waitFor(() => expect(setTaskPrivate).toHaveBeenCalledWith('task-abc', true, ME))
    expect(screen.queryByRole('heading', { name: 'Task is now private' })).toBeNull()
  })

  it('still says the change is saved for a manager who is not in the Meeting', async () => {
    vi.mocked(getDownlinePersonIds).mockResolvedValue([DEWI])
    const task = makeTask({ responsible_person_id: DEWI, accountable_person_id: BUDI, created_by: DEWI, meeting_id: 'm1', created_in_private_meeting: true })
    await renderPage(task, { meeting: { href: '/work/meetings/m1', title: 'Ops sync', isPrivate: true, viewerIn: false } })
    await userEvent.click(screen.getByRole('switch', { name: 'Private' }))
    expect(await screen.findByRole('heading', { name: 'Task is now private' })).toBeInTheDocument()
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
    await renderPage(makeTask({ is_private: true }), { meeting: meeting({ viewerIn: false, title: '' }) })
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

  it('names the Meeting for a viewer who can read it without being an attendee', async () => {
    vi.mocked(getMeeting).mockResolvedValue(detail({ isPrivate: true, attendeeIds: [DEWI] }))
    await renderPage(makeTask({ meeting_id: 'm1', is_private: true, created_in_private_meeting: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Record details' }))
    expect(await screen.findByRole('link', { name: 'Weekly sync' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Private' })).toBeDisabled()
  })

  it('follows the Task\'s own flag when the Meeting\'s Private setting changed after the Task was made', async () => {
    // Made in a private Meeting that is public now: still "everyone in the meeting", switch for attendees only.
    vi.mocked(getMeeting).mockResolvedValue(detail({ isPrivate: false, attendeeIds: [ME] }))
    await renderPage(makeTask({ meeting_id: 'm1', is_private: true, created_in_private_meeting: true }))
    expect(await screen.findByText('On · everyone in the meeting')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Private' })).toBeEnabled()
  })

  it('treats a Task made in a public Meeting that is private now as an ordinary private Task', async () => {
    vi.mocked(getMeeting).mockResolvedValue(detail({ isPrivate: true, attendeeIds: [DEWI] }))
    await renderPage(makeTask({ meeting_id: 'm1', is_private: true, created_in_private_meeting: false }))
    await waitFor(() => expect(getMeeting).toHaveBeenCalledWith('m1'))
    expect(screen.getByText('Nobody added.')).toBeInTheDocument()
    expect(screen.queryByText('On · everyone in the meeting')).toBeNull()
    expect(screen.getByRole('switch', { name: 'Private' })).toBeEnabled()
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

it('retries the current private viewer read before offering viewer edits', async () => {
  vi.mocked(listTaskViewers).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([
    { id: 'v1', org_id: 'org', task_id: 'task-abc', person_id: BUDI, created_by: ME, created_at: '' },
  ])
  await renderPage(makeTask({ is_private: true }))
  const retry = await screen.findByRole('button', { name: 'Try again' })
  expect(screen.queryByText('Nobody added.')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Add person' })).toBeNull()
  await userEvent.click(retry)
  expect(await screen.findByRole('button', { name: 'Remove Budi Barista' })).toBeInTheDocument()
})


it('ignores viewer results from the previous task after selection changes', async () => {
  let resolveOld!: (rows: Awaited<ReturnType<typeof listTaskViewers>>) => void
  const oldRead = new Promise<Awaited<ReturnType<typeof listTaskViewers>>>((resolve) => { resolveOld = resolve })
  vi.mocked(listTaskViewers).mockImplementation((id) => id === 'task-abc' ? oldRead : Promise.resolve([]))
  vi.mocked(getTask).mockImplementation(async (id) => ({ task: makeTask({ id, title: id, is_private: true }), checklist: [], events: [] }))
  const tree = (id: string) => <I18nProvider><AuthContext.Provider value={authed}><MemoryRouter><TaskSurface taskId={id} mode="view" width="full" /></MemoryRouter></AuthContext.Provider></I18nProvider>
  const view = render(tree('task-abc'))
  await waitFor(() => expect(listTaskViewers).toHaveBeenCalledWith('task-abc'))
  view.rerender(tree('task-next'))
  await screen.findByRole('heading', { name: 'task-next' })
  await screen.findByText('Nobody added.')
  await act(async () => { resolveOld([{ id: 'v1', org_id: 'org', task_id: 'task-abc', person_id: BUDI, created_by: ME, created_at: '' }]); await oldRead })
  expect(screen.queryByRole('button', { name: 'Remove Budi Barista' })).toBeNull()
})

it('keeps a saved privacy change recoverable when its viewer read fails', async () => {
  vi.mocked(getDownlinePersonIds).mockResolvedValue([DEWI])
  vi.mocked(listTaskViewers).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([
    { id: 'v1', org_id: 'org', task_id: 'task-abc', person_id: ME, created_by: DEWI, created_at: '' },
  ])
  await renderPage(makeTask({ responsible_person_id: DEWI, accountable_person_id: BUDI, created_by: DEWI }))
  await userEvent.click(screen.getByRole('switch', { name: 'Private' }))
  const retry = await screen.findByRole('button', { name: 'Try again' })
  expect(screen.queryByRole('heading', { name: 'Task is now private' })).toBeNull()
  await userEvent.click(retry)
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull())
  expect(screen.queryByRole('heading', { name: 'Task is now private' })).toBeNull()
})

it('does not apply an earlier task privacy save to a newly selected task', async () => {
  let finishSave!: () => void
  const save = new Promise<void>((resolve) => { finishSave = resolve })
  vi.mocked(setTaskPrivate).mockReturnValue(save)
  vi.mocked(getTask).mockImplementation(async (id) => ({ task: makeTask({ id, title: id }), checklist: [], events: [] }))
  const tree = (id: string) => <I18nProvider><AuthContext.Provider value={authed}><MemoryRouter><TaskSurface taskId={id} mode="view" width="full" /></MemoryRouter></AuthContext.Provider></I18nProvider>
  const view = render(tree('task-abc'))
  await screen.findByRole('heading', { name: 'task-abc' })
  await userEvent.click(screen.getByRole('switch', { name: 'Private' }))
  await waitFor(() => expect(setTaskPrivate).toHaveBeenCalled())
  view.rerender(tree('task-next'))
  await screen.findByRole('heading', { name: 'task-next' })
  await act(async () => { finishSave(); await save })
  expect(screen.getByRole('switch', { name: 'Private' })).toHaveAttribute('aria-checked', 'false')
  expect(listTaskViewers).not.toHaveBeenCalled()
})

it('offers private viewer retry in Indonesian', async () => {
  vi.mocked(listTaskViewers).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
  await renderPage(makeTask({ is_private: true }), { locale: 'id' })
  await userEvent.click(await screen.findByRole('button', { name: 'Coba lagi' }))
  await waitFor(() => expect(listTaskViewers).toHaveBeenCalledTimes(2))
})
