import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { TeamOption } from '@/lib/db/signals.types'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'

// ── Mock the DAL (component tests mock the DAL, never a live DB) ────────────
vi.mock('@/lib/db/signals', () => ({
  listAuthorTeams: vi.fn(),
  listAllTeams: vi.fn(),
  getTeamSite: vi.fn(),
  createSignal: vi.fn(),
  dedupeRecipients: vi.fn(() => 0),
}))
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
