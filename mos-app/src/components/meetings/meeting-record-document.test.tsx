// Behaviour of the Meeting record page: create, edit as an editor, read-only for a reader, the generic message
// for an outsider, Start next meeting, and Indonesian.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import { AuthContext, type AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { Locale } from '@/i18n/messages'
import type { MeetingDetail } from '@/lib/db/meetings.types'
import type { MeetingContext } from './meeting-context'

vi.mock('@/lib/db/meetings', () => ({
  getMeeting: vi.fn(), createMeeting: vi.fn(), updateMeetingFields: vi.fn(), addAttendee: vi.fn(),
  removeAttendee: vi.fn(), startNextMeeting: vi.fn(),
}))
// The minutes have their own tests; here the page only hands the slot whether the viewer may edit.
vi.mock('./meeting-minutes-slot', () => ({
  MeetingMinutesSlot: ({ canEdit }: { canEdit: boolean }) => <section data-record-section="minutes" data-can-edit={canEdit} />,
}))
vi.mock('@/lib/db/record-history', () => ({ countRecordHistory: vi.fn().mockResolvedValue(3) }))
vi.mock('./meeting-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./meeting-context')>()),
  loadMeetingContext: vi.fn(),
}))

import { createMeeting, getMeeting, startNextMeeting, updateMeetingFields } from '@/lib/db/meetings'
import { loadMeetingContext } from './meeting-context'
import { MeetingRecordDocument } from './meeting-record-document'

const ctx = (viewerTeamIds: string[]): MeetingContext => ({
  people: [{ id: 'me', full_name: 'Dewi Director' }, { id: 'p2', full_name: 'Cahya Cafe' }, { id: 'p3', full_name: 'Bulan Barista' }],
  teams: [{ id: 't1', name: 'Gordi HQ Bar' }, { id: 't2', name: 'Roastery Production' }],
  viewerTeamIds,
  workLines: [{ id: 'wl1', name: 'Espresso rollout' }],
  objectives: [{ id: 'ob1', name: 'Consistent espresso' }],
})
const meeting = (over: Partial<MeetingDetail> = {}): MeetingDetail => ({
  id: 'm1', title: 'Weekly bar ops sync', startsAt: '2026-10-22T02:00:00.000Z', owningTeamId: 't1', workLineId: null, objectiveId: 'ob1',
  isPrivate: false, previousMeetingId: null, seriesId: 's1', sequenceNumber: 7, createdBy: 'p2', archivedAt: null,
  updatedAt: '2026-10-22T00:00:00.000Z', attendeeIds: ['me', 'p2'], previous: null, next: null, ...over,
})

const auth = (accessRoles: string[] = []): AuthState => ({
  status: 'authenticated',
  signOut: async () => {},
  viewer: {
    person: { id: 'me', org_id: 'o', user_id: 'u', full_name: 'Dewi Director', must_change_password: false },
    roles: [], isManager: false, accessRoles, affiliated: [],
  },
})

function Probe() {
  const location = useLocation()
  return <output data-testid="path">{location.pathname}</output>
}

function renderMeeting(id: string | null, opts: { locale?: Locale; accessRoles?: string[]; onCreated?: (id: string) => void } = {}) {
  const router = createMemoryRouter([{
    path: '*',
    element: (
      <I18nProvider initialLocale={opts.locale ?? 'en'}>
        <AuthContext.Provider value={auth(opts.accessRoles)}>
          <MeetingRecordDocument id={id} mode="page" onCreated={opts.onCreated} />
          <Probe />
        </AuthContext.Provider>
      </I18nProvider>
    ),
  }], { initialEntries: [id ? `/work/meetings/${id}` : '/work/meetings/new'] })
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadMeetingContext).mockResolvedValue(ctx(['t1']))
  vi.mocked(updateMeetingFields).mockResolvedValue(undefined)
})

describe('a new meeting', () => {
  it('starts blank with my Team and me as attendee, and Create makes the meeting', async () => {
    vi.mocked(createMeeting).mockResolvedValue('m-new')
    const onCreated = vi.fn()
    renderMeeting(null, { onCreated })
    const title = await screen.findByRole('textbox', { name: 'Meeting title' })
    expect(title).toHaveFocus()
    expect(title).toHaveValue('')
    expect(screen.getByText('1 person')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Private meeting' })).toHaveAttribute('aria-checked', 'false')

    await userEvent.click(screen.getByRole('button', { name: 'Create meeting' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Title is required')
    expect(createMeeting).not.toHaveBeenCalled()

    await userEvent.type(title, 'Kitchen sync')
    await userEvent.click(screen.getByRole('button', { name: 'Create meeting' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('m-new'))
    expect(createMeeting).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Kitchen sync', owningTeamId: 't1', isPrivate: false, attendeeIds: [], startsAt: null,
    }))
  })
})

describe('an editor', () => {
  it('changes the Private switch in place and sees the minutes slot as editable', async () => {
    vi.mocked(getMeeting).mockResolvedValue(meeting())
    renderMeeting('m1')
    const toggle = await screen.findByRole('switch', { name: 'Private meeting' })
    expect(document.querySelector('[data-record-section="minutes"]')).toHaveAttribute('data-can-edit', 'true')
    await userEvent.click(toggle)
    await waitFor(() => expect(updateMeetingFields).toHaveBeenCalledWith('m1', { isPrivate: true }))
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Private meeting' })).toHaveAttribute('aria-checked', 'true'))
    expect(screen.getByRole('button', { name: 'Start next meeting' })).toBeInTheDocument()
  })

  it('Start next meeting opens the new meeting, where When reads Set date and time', async () => {
    vi.mocked(getMeeting).mockImplementation(async (id) => (id === 'm1' ? meeting() : meeting({ id: 'm2', startsAt: null, sequenceNumber: 8, previousMeetingId: 'm1' })))
    vi.mocked(startNextMeeting).mockResolvedValue('m2')
    const router = renderMeeting('m1')
    await userEvent.click(await screen.findByRole('button', { name: 'Start next meeting' }))
    await waitFor(() => expect(startNextMeeting).toHaveBeenCalledWith('m1'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/work/meetings/m2'))
  })

  it('a meeting without a date offers Set date and time as its control', async () => {
    vi.mocked(getMeeting).mockResolvedValue(meeting({ id: 'm2', startsAt: null, sequenceNumber: 8 }))
    renderMeeting('m2')
    expect(await screen.findByRole('button', { name: 'Set date and time' })).toBeEnabled()
  })
})

describe('a reader', () => {
  it('sees values and a read-only note, with no edit controls', async () => {
    vi.mocked(loadMeetingContext).mockResolvedValue(ctx(['t2']))
    vi.mocked(getMeeting).mockResolvedValue(meeting({ attendeeIds: ['p2'], startsAt: null }))
    renderMeeting('m1')
    expect(await screen.findByRole('note')).toHaveTextContent('View only · attendees and Gordi HQ Bar can edit this meeting.')
    expect(screen.getByRole('switch', { name: 'Private meeting' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Start next meeting' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Set date and time' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Add attendee/ })).toBeNull()
    expect(document.querySelector('[data-record-section="minutes"]')).toHaveAttribute('data-can-edit', 'false')
  })
})

describe('an outsider to a private meeting', () => {
  it('gets the generic message and no title', async () => {
    vi.mocked(getMeeting).mockResolvedValue(null)
    renderMeeting('m9')
    expect(await screen.findByRole('heading', { name: 'You can’t open this record' })).toBeInTheDocument()
    expect(screen.queryByText('Weekly bar ops sync')).toBeNull()
  })
})

describe('Indonesian', () => {
  it('renders the properties in Indonesian', async () => {
    vi.mocked(getMeeting).mockResolvedValue(meeting())
    renderMeeting('m1', { locale: 'id' })
    expect(await screen.findByText('Tim pemilik')).toBeInTheDocument()
    expect(screen.getByText('Rapat ke-7')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mulai rapat berikutnya' })).toBeInTheDocument()
  })
})
