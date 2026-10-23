// Behaviour of the Meetings list: My meetings | All, search, private lock, opening in the panel, New meeting,
// the Meetings section on a linked record, and Indonesian.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AuthContext, type AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { Locale } from '@/i18n/messages'
import { OverlayHostProvider } from '@/shell/overlay-host'
import type { MeetingListRow } from '@/lib/db/meetings.types'
import type { MeetingContext } from '@/components/meetings/meeting-context'

vi.mock('@/lib/db/meetings', () => ({ listMeetings: vi.fn(), listMeetingsForRecord: vi.fn() }))
vi.mock('@/components/meetings/meeting-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/meetings/meeting-context')>()),
  loadMeetingContext: vi.fn(),
}))
vi.mock('@/components/meetings/meeting-record-document', () => ({
  MeetingRecordDocument: ({ id }: { id: string }) => <p>record body {id}</p>,
}))

import { listMeetings, listMeetingsForRecord } from '@/lib/db/meetings'
import { loadMeetingContext } from '@/components/meetings/meeting-context'
import { MeetingsSection } from '@/components/meetings/meetings-section'
import { MeetingsPage } from './meetings-page'

const ctx: MeetingContext = {
  people: [], teams: [{ id: 't1', name: 'Gordi HQ Bar' }], viewerTeamIds: ['t1'], workLines: [], objectives: [],
}
const row = (over: Partial<MeetingListRow>): MeetingListRow => ({
  id: 'm1', title: 'Weekly bar ops sync', startsAt: '2026-10-22T02:00:00.000Z', owningTeamId: 't1', workLineId: null, objectiveId: null,
  isPrivate: false, previousMeetingId: null, seriesId: 's', sequenceNumber: 1, createdBy: 'me', archivedAt: null,
  updatedAt: '2026-10-22T00:00:00.000Z', attendeeIds: ['me', 'p2'], openTaskCount: 3, ...over,
})
const auth: AuthState = {
  status: 'authenticated', signOut: async () => {},
  viewer: { person: { id: 'me', org_id: 'o', user_id: 'u', full_name: 'Dewi', must_change_password: false }, roles: [], isManager: false, accessRoles: [], affiliated: [] },
}

function setDesktop(desktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true, writable: true,
    value: (query: string) => ({
      matches: desktop && query.includes('min-width'), media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
}

function renderAt(url: string, locale: Locale = 'en') {
  const router = createMemoryRouter([
    { path: '/work/meetings', element: <OverlayHostProvider><MeetingsPage /></OverlayHostProvider> },
    { path: '/work/meetings/new', element: <p>blank meeting page</p> },
    { path: '/work/meetings/:id', element: <p>meeting page</p> },
  ], { initialEntries: [url] })
  render(
    <I18nProvider initialLocale={locale}>
      <AuthContext.Provider value={auth}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </I18nProvider>,
  )
  return router
}

beforeEach(() => {
  vi.clearAllMocks()
  setDesktop(true)
  vi.mocked(loadMeetingContext).mockResolvedValue(ctx)
  vi.mocked(listMeetings).mockResolvedValue([row({}), row({ id: 'm2', title: 'Cafe 2 staffing', isPrivate: true, openTaskCount: 0 })])
})

describe('Meetings list', () => {
  it('shows My meetings first, switches to All, and searches', async () => {
    renderAt('/work/meetings')
    expect(await screen.findByRole('link', { name: 'Weekly bar ops sync' })).toBeInTheDocument()
    expect(listMeetings).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'mine', personId: 'me', teamIds: ['t1'] }))
    expect(screen.getByRole('button', { name: 'My meetings' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => expect(listMeetings).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'all' })))

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search meetings' }), 'bar')
    await waitFor(() => expect(listMeetings).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'all', search: 'bar' })))
  })

  it('labels the lock on a private meeting', async () => {
    renderAt('/work/meetings')
    await screen.findByRole('link', { name: 'Cafe 2 staffing' })
    expect(screen.getAllByRole('img', { name: 'Private meeting' })).toHaveLength(1)
  })

  it('opens a meeting in the panel from its row', async () => {
    const router = renderAt('/work/meetings')
    await userEvent.click(await screen.findByRole('link', { name: 'Weekly bar ops sync' }))
    expect(await screen.findByText('record body m1')).toBeInTheDocument()
    expect(router.state.location.search).toContain('record=m1')
  })

  it('on a phone opens the record page and shows the open-task badge', async () => {
    setDesktop(false)
    const router = renderAt('/work/meetings')
    expect(await screen.findByText('3 open')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Weekly bar ops sync' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/work/meetings/m1'))
  })

  it('New meeting goes to the blank record page', async () => {
    const router = renderAt('/work/meetings')
    await userEvent.click(await screen.findByRole('button', { name: 'New meeting' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/work/meetings/new'))
  })

  it('shows the empty state', async () => {
    vi.mocked(listMeetings).mockResolvedValue([])
    renderAt('/work/meetings')
    expect(await screen.findByText('No meetings yet')).toBeInTheDocument()
  })

  it('renders in Indonesian', async () => {
    renderAt('/work/meetings', 'id')
    expect(await screen.findByRole('button', { name: 'Rapat saya' })).toBeInTheDocument()
    expect(await screen.findByText('Tim pemilik')).toBeInTheDocument()
  })
})

describe('Meetings section on a linked record', () => {
  it('lists the linked meetings with links to them', async () => {
    vi.mocked(listMeetingsForRecord).mockResolvedValue([{ id: 'm1', title: 'Weekly bar ops sync', startsAt: null, isPrivate: false }])
    render(
      <I18nProvider>
        <RouterProvider router={createMemoryRouter([{ path: '*', element: <MeetingsSection objectiveId="ob1" /> }])} />
      </I18nProvider>,
    )
    const link = await screen.findByRole('link', { name: 'Weekly bar ops sync' })
    expect(link).toHaveAttribute('href', '/work/meetings/m1')
    expect(listMeetingsForRecord).toHaveBeenCalledWith({ objectiveId: 'ob1' })
    expect(screen.getByRole('heading', { name: 'Meetings' })).toBeInTheDocument()
  })

  it('opens a meeting in the panel stack on a plain click, and on its own page for a modified click', async () => {
    vi.mocked(listMeetingsForRecord).mockResolvedValue([{ id: 'm1', title: 'Weekly bar ops sync', startsAt: null, isPrivate: false }])
    const onOpenRelated = vi.fn()
    render(
      <I18nProvider>
        <RouterProvider router={createMemoryRouter([{ path: '*', element: <MeetingsSection objectiveId="ob1" onOpenRelated={onOpenRelated} /> }])} />
      </I18nProvider>,
    )
    const link = await screen.findByRole('link', { name: 'Weekly bar ops sync' })
    link.addEventListener('click', (event) => event.preventDefault()) // jsdom cannot follow a link
    fireEvent.click(link, { ctrlKey: true })
    expect(onOpenRelated).not.toHaveBeenCalled()
    await userEvent.click(link)
    expect(onOpenRelated).toHaveBeenCalledWith('meeting', 'm1')
  })

  it('renders nothing when no meeting is linked', async () => {
    vi.mocked(listMeetingsForRecord).mockResolvedValue([])
    render(
      <I18nProvider>
        <RouterProvider router={createMemoryRouter([{ path: '*', element: <MeetingsSection workLineId="wl1" /> }])} />
      </I18nProvider>,
    )
    await waitFor(() => expect(listMeetingsForRecord).toHaveBeenCalled())
    expect(screen.queryByRole('heading', { name: 'Meetings' })).toBeNull()
  })
})
