// The minutes of a Meeting as a person uses them, with the real block editor: the Still open table, task rows
// written inline, the "Tasks from this meeting" table and its inline edits, Add task, the lock on a private
// Meeting's Tasks, a [[ link to another Meeting, the read-only reader, and Indonesian.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { Locale } from '@/i18n/messages'
import type { MeetingTaskRow } from '@/lib/db/meetings.types'

const T1 = '11111111-1111-4111-8111-111111111111'
const T2 = '22222222-2222-4222-8222-222222222222'
const T_HIDDEN = '99999999-9999-4999-8999-999999999999'
const M2 = '33333333-3333-4333-8333-333333333333'

const host = vi.hoisted(() => ({ push: vi.fn(), openPage: vi.fn() }))
vi.mock('@/shell/overlay-host', () => ({ useOptionalOverlayHost: () => ({ session: { frames: [{ entry: { owner: 'work' } }] }, push: host.push, openPage: host.openPage }) }))
vi.mock('@/components/catalog/use-catalog-record-overlay', () => ({
  useCatalogRecordEntryFactory: () => ({ buildEntry: (kind: string, id: string) => ({ key: `${kind}:${id}` }) }),
}))
vi.mock('@/components/signals/signal-record-host', () => ({ SignalRecordHost: () => null }))
vi.mock('@/lib/db/meetings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/meetings')>()),
  readMinutes: vi.fn(), saveMinutes: vi.fn(), listMeetingTasks: vi.fn(), listStillOpen: vi.fn(), createMeetingTask: vi.fn(),
}))
vi.mock('@/lib/db/directory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/directory')>()), getPeople: vi.fn(), getDownlinePersonIds: vi.fn(),
}))
vi.mock('@/lib/db/tasks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/tasks')>()), updateTaskStatus: vi.fn(), updateTaskFields: vi.fn(),
}))
vi.mock('@/lib/db/document-references', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/document-references')>()),
  resolveMentionNames: vi.fn().mockResolvedValue({ people: new Map([['44444444-4444-4444-8444-444444444444', 'Cahya Cafe']]), teams: new Map() }),
  resolveRecordTitles: vi.fn().mockResolvedValue(new Map([['meeting:33333333-3333-4333-8333-333333333333', 'Roastery weekly']])),
}))
const online = vi.hoisted(() => ({ offline: false }))
vi.mock('@/shell/use-is-offline', () => ({ useIsOffline: () => online.offline }))

import { createMeetingTask, listMeetingTasks, listStillOpen, readMinutes } from '@/lib/db/meetings'
import { getDownlinePersonIds, getPeople } from '@/lib/db/directory'
import { updateTaskFields, updateTaskStatus } from '@/lib/db/tasks'
import { MeetingMinutesSlot } from './meeting-minutes-slot'

const task = (over: Partial<MeetingTaskRow>): MeetingTaskRow => ({
  id: T1, title: 'Order spare burrs', responsibleId: 'p2', supervisorId: 'p3', dueDate: '2026-10-30', status: 'Open', meetingId: 'm1', ...over,
})
// T1 is written inline and the viewer ("me") is neither its PIC nor its Supervisor; T2 is not inline and the viewer supervises it.
const inlineTask = task({})
const tableTask = task({ id: T2, title: 'Count oat milk stock', responsibleId: 'p3', supervisorId: 'me', dueDate: '2026-11-02', status: 'In Progress' })
const carried = task({ id: 'prev-1', title: 'Replace grinder burrs', responsibleId: 'p2', supervisorId: 'p3', dueDate: '2026-09-16', status: 'Blocked', meetingId: 'm0' })

const minutes = [
  { type: 'paragraph', content: [
    { type: 'text', text: 'Agreed with ', styles: {} },
    { type: 'mention', props: { kind: 'person', id: '44444444-4444-4444-8444-444444444444' } },
    { type: 'text', text: ' and ', styles: {} },
    { type: 'recordLink', props: { kind: 'meeting', id: M2 } },
  ] },
  { type: 'taskRow', props: { taskId: T1 } },
  { type: 'taskRow', props: { taskId: T_HIDDEN } },
  { type: 'tasksTable' },
]

const auth = { status: 'authenticated', signOut: async () => {}, viewer: { person: { id: 'me', full_name: 'Dewi Director' }, roles: [], isManager: false, accessRoles: [], affiliated: [] } } as unknown as AuthState

async function mount(opts: { canEdit?: boolean; isPrivate?: boolean; locale?: Locale; stillOpen?: MeetingTaskRow[] } = {}) {
  vi.mocked(listStillOpen).mockResolvedValue(opts.stillOpen ?? [])
  render(
    <I18nProvider initialLocale={opts.locale ?? 'en'}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <MeetingMinutesSlot meetingId="m1" canEdit={opts.canEdit ?? true} isPrivate={opts.isPrivate} />
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
  )
  await screen.findByRole('group', { name: opts.locale === 'id' ? 'Tugas di rapat ini' : 'Task in this meeting' }, { timeout: 4000 })
}

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom has no hit testing; the editor's side menu asks for it on every mouse move.
  document.elementsFromPoint = () => []
  online.offline = false
  vi.mocked(readMinutes).mockResolvedValue({ minutes, updatedAt: 't1' })
  vi.mocked(listMeetingTasks).mockResolvedValue([inlineTask, tableTask])
  vi.mocked(getPeople).mockResolvedValue([{ id: 'me', full_name: 'Dewi Director' }, { id: 'p2', full_name: 'Cahya Cafe' }, { id: 'p3', full_name: 'Bulan Barista' }])
  vi.mocked(getDownlinePersonIds).mockResolvedValue(['p3'])
})

describe('Meeting minutes — task rows written inline', () => {
  it('shows the Task\'s own title, PIC, due and status, and opens it in the panel from the title', async () => {
    await mount()
    const row = screen.getAllByRole('group', { name: 'Task in this meeting' })[0]
    expect(within(row).getByRole('button', { name: 'Order spare burrs' })).toBeInTheDocument()
    expect(within(row).getByText('Cahya Cafe')).toBeInTheDocument()
    expect(within(row).getByText('Open')).toBeInTheDocument()
    await userEvent.click(within(row).getByRole('button', { name: 'Order spare burrs' }))
    expect(host.push).toHaveBeenCalledWith({ key: 'task:' + T1 })
  })

  it('shows a Task the viewer cannot read as a Restricted record, with no title', async () => {
    await mount()
    expect(screen.getByText('Restricted record')).toBeInTheDocument()
  })

  it('leaves the status, PIC and due of a Task the viewer cannot edit as plain text', async () => {
    await mount()
    const row = screen.getAllByRole('group', { name: 'Task in this meeting' })[0]
    expect(within(row).queryByRole('button', { name: /Edit task/ })).toBeNull()
  })
})

describe('Meeting minutes — Tasks from this meeting', () => {
  it('lists only the Tasks not already written inline, and opens one from its title', async () => {
    await mount()
    const table = screen.getByRole('table')
    expect(within(table).getByRole('button', { name: 'Count oat milk stock' })).toBeInTheDocument()
    expect(within(table).queryByText('Order spare burrs')).toBeNull()
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Task', 'PIC', 'Due', 'Status'])
    await userEvent.click(within(table).getByRole('button', { name: 'Count oat milk stock' }))
    expect(host.push).toHaveBeenCalledWith({ key: 'task:' + T2 })
  })

  it('lets someone allowed to edit the Task change its status, PIC and due in place', async () => {
    vi.mocked(updateTaskStatus).mockResolvedValue()
    vi.mocked(updateTaskFields).mockResolvedValue()
    await mount()
    const table = screen.getByRole('table')

    await userEvent.click(within(table).getByRole('button', { name: /In Progress, Edit task status/ }))
    await userEvent.click(await screen.findByRole('option', { name: 'Done' }))
    await waitFor(() => expect(updateTaskStatus).toHaveBeenCalledWith(T2, 'In Progress', 'Done', 'me'))

    await userEvent.click(within(table).getByRole('button', { name: /PIC: Bulan Barista, Edit task PIC/ }))
    await userEvent.click(await screen.findByRole('option', { name: 'Dewi Director' }))
    await waitFor(() => expect(updateTaskFields).toHaveBeenCalledWith(T2, { responsible_person_id: 'me' }, 'me', 'p3'))

    await userEvent.click(within(table).getByRole('button', { name: /Edit task due date/ }))
    const due = await screen.findByRole('textbox', { name: 'Due date' })
    await userEvent.clear(due)
    await userEvent.type(due, '30/11/2026{Enter}')
    await waitFor(() => expect(updateTaskFields).toHaveBeenCalledWith(T2, { due_date: '2026-11-30' }, 'me', '2026-11-02'))
  })

  it('Add task creates a Task in this Meeting', async () => {
    vi.mocked(createMeetingTask).mockResolvedValue('new-task')
    await mount()
    await userEvent.click(screen.getByRole('button', { name: /Add task/ }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Title of the new task' }), 'Book the espresso service{Enter}')
    await waitFor(() => expect(createMeetingTask).toHaveBeenCalledWith(expect.objectContaining({ meetingId: 'm1', title: 'Book the espresso service' })))
    expect(listMeetingTasks).toHaveBeenCalledTimes(2)
  })

  it('marks the Tasks of a private Meeting with the "Private task" lock', async () => {
    await mount({ isPrivate: true })
    expect(within(screen.getByRole('table')).getByRole('img', { name: 'Private task' })).toBeInTheDocument()
  })

  it('shows no lock on the Tasks of an ordinary Meeting', async () => {
    await mount()
    expect(screen.queryByRole('img', { name: 'Private task' })).toBeNull()
  })
})

describe('Meeting minutes — Still open from last time', () => {
  it('opens above the minutes with the previous Meeting\'s open Tasks: Task · PIC · Due · Status', async () => {
    await mount({ stillOpen: [carried] })
    const region = screen.getByRole('region', { name: 'Still open from last time' })
    expect(within(region).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Task', 'PIC', 'Due', 'Status'])
    expect(within(region).getByText('Replace grinder burrs')).toBeInTheDocument()
    expect(within(region).getByText('Blocked')).toBeInTheDocument()
    expect(region.compareDocumentPosition(screen.getAllByRole('group', { name: 'Task in this meeting' })[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(region).queryByRole('button', { name: /Add task/ })).toBeNull()
  })

  it('is absent when there is nothing open from last time', async () => {
    await mount()
    expect(screen.queryByRole('region', { name: 'Still open from last time' })).toBeNull()
  })
})

describe('Meeting minutes — links, the reader and Indonesian', () => {
  it('shows a [[ link to another Meeting as a chip with its title', async () => {
    await mount()
    expect(await screen.findByRole('button', { name: /Meeting.*Roastery weekly/ })).toBeInTheDocument()
    expect(screen.getByText('@Cahya Cafe')).toBeInTheDocument()
  })

  it('gives a reader the minutes with no Save, no Add task and no inline edit', async () => {
    await mount({ canEdit: false })
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Add task/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Edit task/ })).toBeNull()
    expect(within(screen.getByRole('table')).getByText('Bulan Barista')).toBeInTheDocument()
  })

  it('freezes editing while offline', async () => {
    online.offline = true
    await mount()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Add task/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Edit task/ })).toBeNull()
  })

  it('reads Indonesian', async () => {
    await mount({ locale: 'id', stillOpen: [carried] })
    expect(screen.getByRole('region', { name: 'Masih terbuka dari rapat lalu' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Tugas dari rapat ini' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tambah tugas/ })).toBeInTheDocument()
    await act(async () => { await Promise.resolve() })
  })
})
