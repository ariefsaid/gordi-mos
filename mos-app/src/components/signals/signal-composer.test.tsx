import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { TeamOption } from '@/lib/db/signals.types'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'

// ── Mock the DAL (component tests mock the DAL, never a live DB) ────────────
vi.mock('@/lib/db/signals', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/signals')>('@/lib/db/signals')
  return {
    listAuthorTeams: vi.fn(),
    listAllTeams: vi.fn(),
    getTeamSite: vi.fn(),
    createSignal: vi.fn(),
    dedupeRecipients: actual.dedupeRecipients, // real (pure) implementation — the point under test
  }
})
vi.mock('@/lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
}))

import { listAuthorTeams, listAllTeams, getTeamSite, createSignal } from '@/lib/db/signals'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { SignalComposer } from './signal-composer'

const mockListAuthorTeams = vi.mocked(listAuthorTeams)
const mockListAllTeams = vi.mocked(listAllTeams)
const mockGetTeamSite = vi.mocked(getTeamSite)
const mockCreateSignal = vi.mocked(createSignal)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockGetPeople = vi.mocked(getPeople)

const AUTHOR_ID = 'person-cahya'

const TEAMS: TeamOption[] = [
  { id: 'team-hq', name: 'HQ Operations', business_unit_id: 'bu-retail', site_id: 'site-hq', is_primary: true },
  { id: 'team-radiant', name: 'Radiant Operations', business_unit_id: 'bu-retail', site_id: 'site-radiant', is_primary: false },
]
const BUS: BusinessUnitOption[] = [{ id: 'bu-retail', name: 'Retail Ops' }]
const PEOPLE: PersonOption[] = [{ id: AUTHOR_ID, full_name: 'Cahya Cafe' }, { id: 'person-peer', full_name: 'Peer Person' }]

/** The mention popover's option role collides with the native <select> team options that share
 * the same team name — scope the query to the popover listbox. */
async function findMentionOption(name: RegExp) {
  const listbox = await screen.findByRole('listbox', { name: /mention/i })
  return within(listbox).findByRole('option', { name })
}

function renderComposer(props: Partial<React.ComponentProps<typeof SignalComposer>> = {}) {
  return render(
    <I18nProvider>
      <div style={{ width: 390 }}>
        <SignalComposer authorId={AUTHOR_ID} authorName="Cahya Cafe" {...props} />
      </div>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mockListAuthorTeams.mockResolvedValue(TEAMS)
  mockListAllTeams.mockResolvedValue(TEAMS)
  mockGetTeamSite.mockResolvedValue(null)
  mockGetBusinessUnits.mockResolvedValue(BUS)
  mockGetPeople.mockResolvedValue(PEOPLE)
  mockCreateSignal.mockResolvedValue('signal-new')
})

describe('SignalComposer — capture-minimal four fields (AC-420)', () => {
  it('paints exactly the four capture fields and enables Share Signal with only body typed', async () => {
    renderComposer()
    await waitFor(() => expect(mockListAuthorTeams).toHaveBeenCalledWith(AUTHOR_ID))

    // 1. Content
    const body = screen.getByRole('textbox', { name: /what happened/i })
    // 2. Owning Team
    const teamSelect = await screen.findByRole('combobox', { name: /team/i })
    // 3. Occurrence time
    const occurred = screen.getByLabelText(/occurred/i)
    // 4. Author (read-only line, not a form control)
    expect(screen.getByText(/Cahya Cafe/)).toBeInTheDocument()
    expect(screen.getByText(/implicit/i)).toBeInTheDocument()

    // No category or attention control at initial paint (capture-minimal, Rule 8).
    expect(screen.queryByRole('combobox', { name: /categor/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /categor/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /attention|urgent|fyi/i })).not.toBeInTheDocument()

    const shareButton = screen.getByRole('button', { name: /share signal/i })
    expect(shareButton).toBeDisabled()

    await userEvent.type(body, 'The freezer alarm went off')
    expect(shareButton).toBeEnabled()
    expect(teamSelect).toHaveValue('team-hq') // defaults to the author's primary Team
    expect((occurred as HTMLInputElement).value.length).toBeGreaterThan(0)

    expect(screen.getByText(/Category is added after posting/i)).toBeInTheDocument()
  })

  it('posts via createSignal with the typed body and selected Team when Share Signal is pressed', async () => {
    renderComposer()
    await waitFor(() => expect(mockListAuthorTeams).toHaveBeenCalled())

    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, 'The freezer alarm went off')
    await userEvent.click(screen.getByRole('button', { name: /share signal/i }))

    await waitFor(() => expect(mockCreateSignal).toHaveBeenCalledTimes(1))
    const call = mockCreateSignal.mock.calls[0][0]
    expect(call.body).toBe('The freezer alarm went off')
    expect(call.owningTeamId).toBe('team-hq')
    expect(call.mentions).toEqual([])
  })
})

describe('SignalComposer — safe retry after a failed post (CQ IMPORTANT-1)', () => {
  it('keeps the typed body and re-enables Share Signal when the post fails, then a retry succeeds', async () => {
    // The post is now one atomic RPC: a failure commits nothing, so retrying cannot double-post.
    mockCreateSignal.mockRejectedValueOnce(new Error('fan-out exceeds cap of 50 recipients'))
    renderComposer()
    await waitFor(() => expect(mockListAuthorTeams).toHaveBeenCalled())

    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, 'The freezer alarm went off')
    const shareButton = screen.getByRole('button', { name: /share signal/i })
    await userEvent.click(shareButton)

    // The error surfaces, the body is preserved, and Share is enabled again (retry is safe).
    expect(await screen.findByRole('alert')).toHaveTextContent(/fan-out exceeds cap/i)
    expect(body).toHaveValue('The freezer alarm went off')
    expect(shareButton).toBeEnabled()

    // Retry — the second attempt resolves; createSignal is called exactly twice (no duplicate first post).
    mockCreateSignal.mockResolvedValueOnce('signal-new')
    await userEvent.click(shareButton)
    await waitFor(() => expect(mockCreateSignal).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(body).toHaveValue(''))
  })
})

describe('SignalComposer — grouped @ mention picker (AC-421)', () => {
  it('opens a grouped Person/Team/BU popover on "@" with a type badge per option', async () => {
    renderComposer()
    await waitFor(() => expect(mockListAuthorTeams).toHaveBeenCalled())
    const body = screen.getByRole('textbox', { name: /what happened/i })

    await userEvent.type(body, 'Heads up @Pe')

    const popover = await screen.findByRole('listbox', { name: /mention/i })
    expect(popover).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Peer Person/i })).toBeInTheDocument()
    expect(screen.getAllByText('person')[0]).toBeInTheDocument() // type badge

    // Team and BU groups render even without a matching prefix filter on this query
    expect(screen.getByText('Person')).toBeInTheDocument()
  })

  it('disables the BU group without signal.mention_bu, and enables it when the viewer holds it', async () => {
    const { unmount } = renderComposer({ canMentionBu: false })
    await waitFor(() => expect(mockListAuthorTeams).toHaveBeenCalled())
    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, '@')

    const buOption = await screen.findByRole('option', { name: /Retail Ops/i })
    expect(buOption).toBeDisabled()
    unmount()

    renderComposer({ canMentionBu: true })
    await waitFor(() => expect(mockListAuthorTeams).toHaveBeenCalledTimes(2))
    const body2 = screen.getAllByRole('textbox', { name: /what happened/i })[0]
    await userEvent.type(body2, '@')
    const enabledBuOption = await screen.findByRole('option', { name: /Retail Ops/i })
    expect(enabledBuOption).toBeEnabled()
  })

  it('selecting a mention option inserts an @Name chip in the body and stages the mention', async () => {
    renderComposer()
    await waitFor(() => expect(mockListAuthorTeams).toHaveBeenCalled())
    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, 'Heads up @Pe')

    await userEvent.click(await screen.findByRole('option', { name: /Peer Person/i }))

    expect(body).toHaveValue('Heads up @Peer Person ')
    await userEvent.click(screen.getByRole('button', { name: /share signal/i }))
    await waitFor(() => expect(mockCreateSignal).toHaveBeenCalledTimes(1))
    expect(mockCreateSignal.mock.calls[0][0].mentions).toEqual([
      { kind: 'person', targetId: 'person-peer', label: 'Peer Person' },
    ])
  })
})

describe('SignalComposer — visibility + dedup fan-out preview (AC-422)', () => {
  it('shows "Visible to <Team>" with the deduplicated notify count for overlapping mentions', async () => {
    renderComposer({ teamMembers: { 'team-hq': ['person-peer', 'person-other'] } })
    await waitFor(() => expect(mockListAuthorTeams).toHaveBeenCalled())
    const body = screen.getByRole('textbox', { name: /what happened/i })

    // Stage a @Team mention (2 members) AND an overlapping @Person mention (person-peer, already
    // a team-hq member) — the notify count must NOT double-count person-peer.
    await userEvent.type(body, 'Heads up @HQ')
    await userEvent.click(await findMentionOption(/HQ Operations/i))
    await userEvent.type(body, ' cc @Pe')
    await userEvent.click(await findMentionOption(/Peer Person/i))

    expect(screen.getByText('Visible to HQ Operations · notify 2')).toBeInTheDocument()
  })

  it('shows "Visible to <Team>" with no notify suffix when no mentions are staged', async () => {
    renderComposer()
    await waitFor(() => expect(mockListAuthorTeams).toHaveBeenCalled())
    expect(await screen.findByText('Visible to HQ Operations')).toBeInTheDocument()
  })

  it('shows a cross-Team destination preview "Post to <Team> · <attention> · notify N" when the author changes the owning Team', async () => {
    renderComposer({ canCreateForTeam: true, teamMembers: { 'team-radiant': ['person-peer'] } })
    await waitFor(() => expect(mockListAllTeams).toHaveBeenCalled())

    const teamSelect = await screen.findByRole('combobox', { name: /team/i })
    await userEvent.selectOptions(teamSelect, 'team-radiant')
    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, '@Pe')
    await userEvent.click(await findMentionOption(/Peer Person/i))

    expect(screen.getByText('Post to Radiant Operations · FYI · notify 1')).toBeInTheDocument()
  })
})

describe('SignalComposer — derived Site pill, no @Site (AC-423)', () => {
  it('renders a read-only Site pill derived from the owning Team, and Site is absent from the @ picker', async () => {
    mockGetTeamSite.mockResolvedValue({ id: 'site-hq', name: 'Gordi HQ' })
    renderComposer()
    await waitFor(() => expect(mockGetTeamSite).toHaveBeenCalledWith('team-hq'))

    const pill = await screen.findByTestId('signal-site-pill')
    expect(pill).toHaveTextContent('Gordi HQ')
    // The pill is not an interactive control — location, not a mention target (D37).
    expect(pill.tagName).not.toBe('BUTTON')
    expect(pill.tagName).not.toBe('A')

    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, '@')
    const popover = await screen.findByRole('listbox', { name: /mention/i })
    expect(within(popover).queryByText(/site/i)).not.toBeInTheDocument()
  })

  it('renders no Site pill for a central/site-less Team', async () => {
    mockGetTeamSite.mockResolvedValue(null)
    renderComposer()
    await waitFor(() => expect(mockGetTeamSite).toHaveBeenCalledWith('team-hq'))
    expect(screen.queryByTestId('signal-site-pill')).not.toBeInTheDocument()
  })
})
