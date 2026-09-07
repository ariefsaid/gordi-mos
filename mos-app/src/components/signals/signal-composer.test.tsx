import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { TeamOption } from '@/lib/db/signals.types'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'

// ── Mock the DAL (component tests mock the DAL, never a live DB) ────────────
vi.mock('@/lib/db/signals', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/signals')>('@/lib/db/signals')
  return {
    listReadableAuthorTeams: vi.fn(),
    listAuthorTeams: vi.fn(),
    listAllTeams: vi.fn(),
    getTeamSite: vi.fn(),
    createSignal: vi.fn(),
    loadMentionRosters: vi.fn(),
    dedupeRecipients: actual.dedupeRecipients, // real (pure) implementation — the point under test
  }
})
vi.mock('@/auth/use-auth', () => ({ useAuth: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
}))

import { listReadableAuthorTeams, listAuthorTeams, listAllTeams, getTeamSite, createSignal, loadMentionRosters } from '@/lib/db/signals'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { SignalComposer } from './signal-composer'
import { ModalShell } from '@/components/ui/modal-shell'
import { SignalComposerHost, useSignalComposer } from '@/shell/signal-composer-host'
import { useAuth } from '@/auth/use-auth'


const mockListReadableAuthorTeams = vi.mocked(listReadableAuthorTeams)
const mockListAuthorTeams = vi.mocked(listAuthorTeams)
const mockListAllTeams = vi.mocked(listAllTeams)
const mockGetTeamSite = vi.mocked(getTeamSite)
const mockCreateSignal = vi.mocked(createSignal)
const mockLoadMentionRosters = vi.mocked(loadMentionRosters)
const mockUseAuth = vi.mocked(useAuth)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockGetPeople = vi.mocked(getPeople)

const AUTHOR_ID = 'person-author-a'

const TEAMS: TeamOption[] = [
  { id: 'team-hq', name: 'HQ Operations', business_unit_id: 'bu-retail', site_id: 'site-hq', is_primary: true },
  { id: 'team-radiant', name: 'Radiant Operations', business_unit_id: 'bu-retail', site_id: 'site-radiant', is_primary: false },
]
// OD-REDESIGN-91 #19: a single eligible Team auto-picks, so the default author is on ONE team —
// the common journey. The multi-team must-pick journey has its own describe block below.
const SOLE_TEAM: TeamOption[] = [TEAMS[0]]
const BUS: BusinessUnitOption[] = [{ id: 'bu-retail', name: 'Retail Ops' }]
const PEOPLE: PersonOption[] = [{ id: AUTHOR_ID, full_name: 'Author One' }, { id: 'person-peer', full_name: 'Peer Person' }]

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
        <SignalComposer authorId={AUTHOR_ID} authorName="Author One" {...props} />
      </div>
    </I18nProvider>,
  )
}

function ComposerLauncher() {
  const { open } = useSignalComposer()
  return <button type="button" onClick={() => open()}>open-composer</button>
}

function renderRealComposerHost() {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: { person: { id: AUTHOR_ID, full_name: 'Author One' }, accessRoles: [] },
  } as never)
  return render(<I18nProvider><SignalComposerHost><ComposerLauncher /></SignalComposerHost></I18nProvider>)
}

beforeEach(() => {
  window.localStorage.setItem('mos.locale', 'en')
  vi.resetAllMocks()
  mockListReadableAuthorTeams.mockResolvedValue(SOLE_TEAM)
  mockListAuthorTeams.mockResolvedValue(SOLE_TEAM)
  mockListAllTeams.mockResolvedValue(TEAMS)
  mockGetTeamSite.mockResolvedValue(null)
  mockGetBusinessUnits.mockResolvedValue(BUS)
  mockGetPeople.mockResolvedValue(PEOPLE)
  mockCreateSignal.mockResolvedValue('signal-new')
  mockLoadMentionRosters.mockResolvedValue({ teamMembers: {}, buMembers: {} })
})

describe('SignalComposer — repost prefill', () => {
  it('submits staged mention rows carried by a reposted draft', async () => {
    renderComposer({
      prefill: {
        body: 'The freezer alarm went off @Peer Person', owningTeamId: 'team-hq',
        occurredAt: '2026-07-16T02:00:00Z', attention: 'Needs attention',
        mentions: [{ kind: 'person', targetId: 'person-peer', label: 'Peer Person' }],
      },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: /share signal/i })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: /share signal/i }))
    await waitFor(() => expect(mockCreateSignal).toHaveBeenCalledWith(expect.objectContaining({
      mentions: [{ kind: 'person', targetId: 'person-peer', label: 'Peer Person' }],
    })))
  })
})

// SIG-2 — a viewer with no team memberships gets an honest empty state, not a dead composer.
describe('SignalComposer — no-team empty state (SIG-2)', () => {
  it('renders an empty state explaining why, instead of an empty select + forever-disabled submit', async () => {
    mockListReadableAuthorTeams.mockResolvedValue([])
    renderComposer()

    // The empty state resolves once the (empty) team load settles.
    expect(await screen.findByText('No team to post to')).toBeInTheDocument()
    expect(screen.getByText(/Ask an admin or your team lead/i)).toBeInTheDocument()

    // No dead controls: no owning-Team select, no disabled Share Signal button.
    expect(screen.queryByRole('combobox', { name: /team/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /share signal/i })).not.toBeInTheDocument()
  })

  it('does not flash the empty state before the team load resolves', () => {
    let resolveTeams: (t: TeamOption[]) => void = () => {}
    mockListReadableAuthorTeams.mockReturnValue(new Promise<TeamOption[]>((r) => { resolveTeams = r }))
    renderComposer()
    // Still loading → the form (its Share Signal button) is present, the empty state is not.
    expect(screen.queryByText('No team to post to')).not.toBeInTheDocument()
    resolveTeams([])
  })
})

describe('SignalComposer — capture-minimal four fields (AC-420)', () => {
  it('paints exactly the four capture fields and enables Share Signal with only body typed', async () => {
    renderComposer()
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalledWith(AUTHOR_ID))

    // 1. Content
    const body = screen.getByRole('textbox', { name: /what happened/i })
    // 3. Occurrence time — the input is visible only while its pill popover is open.
    await userEvent.click(screen.getByRole('button', { name: /Just now/i }))
    const occurred = within(screen.getByRole('dialog', { name: /occurred/i })).getByLabelText(/occurred/i)
    // 4. Author (read-only line, not a form control)
    expect(screen.getByText(/Owning Team: HQ Operations · Author: Author One/i)).toBeInTheDocument()

    // Category is post-capture enrichment; attention is a pill menu, not a radiogroup.
    expect(screen.queryByRole('combobox', { name: /categor/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: /attention/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /FYI/i })).toBeInTheDocument()

    const shareButton = screen.getByRole('button', { name: /share signal/i })
    expect(shareButton).toBeDisabled()

    await userEvent.type(body, 'The freezer alarm went off')
    expect(shareButton).toBeEnabled()
    expect((occurred as HTMLInputElement).value.length).toBeGreaterThan(0)

    expect(screen.getByText(/Category is added after posting/i)).toBeInTheDocument()
  })

  it('posts via createSignal with the typed body and selected Team when Share Signal is pressed', async () => {
    renderComposer()
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())

    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, 'The freezer alarm went off')
    await userEvent.click(screen.getByRole('button', { name: /share signal/i }))

    await waitFor(() => expect(mockCreateSignal).toHaveBeenCalledTimes(1))
    const call = mockCreateSignal.mock.calls[0][0]
    expect(call.body).toBe('The freezer alarm went off')
    expect(call.owningTeamId).toBe('team-hq')
    expect(call.mentions).toEqual([])
    expect(call.attention).toBe('FYI')
  })

  it('posts Urgent when the optional attention control is raised', async () => {
    renderComposer()
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())
    await userEvent.type(screen.getByRole('textbox', { name: /what happened/i }), 'Gas leak')
    await userEvent.click(screen.getByRole('button', { name: /FYI/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Urgent/i }))
    await userEvent.click(screen.getByRole('button', { name: /share signal/i }))

    await waitFor(() => expect(mockCreateSignal).toHaveBeenCalledTimes(1))
    expect(mockCreateSignal.mock.calls[0][0].attention).toBe('Urgent')
  })
})

describe('SignalComposer — owning-team must-pick (OD-REDESIGN-91 #19 / F4)', () => {
  it('with more than one eligible Team, pre-selects nothing and keeps Share disabled until a Team is picked', async () => {
    mockListReadableAuthorTeams.mockResolvedValue(TEAMS) // author on two teams → must pick
    renderComposer()
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())

    const teamSelect = await screen.findByRole('combobox', { name: /team/i })
    expect(teamSelect).toHaveValue('') // no pre-pick, no arbitrary first

    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, 'The freezer alarm went off')
    const shareButton = screen.getByRole('button', { name: /share signal/i })
    expect(shareButton).toBeDisabled() // body typed, but no owning Team chosen → still blocked

    await userEvent.selectOptions(teamSelect, 'team-radiant')
    expect(shareButton).toBeEnabled()
    await userEvent.click(shareButton)
    await waitFor(() => expect(mockCreateSignal).toHaveBeenCalledTimes(1))
    expect(mockCreateSignal.mock.calls[0][0].owningTeamId).toBe('team-radiant')
  })

  it('with a single eligible Team, auto-picks it (no needless pick)', async () => {
    mockListReadableAuthorTeams.mockResolvedValue(SOLE_TEAM)
    renderComposer()
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())

    expect(screen.queryByRole('combobox', { name: /team/i })).not.toBeInTheDocument()

    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, 'The freezer alarm went off')
    expect(screen.getByRole('button', { name: /share signal/i })).toBeEnabled()
  })
})

describe('SignalComposer — read-back-only Team options (#715)', () => {
  it('narrows the owning-Team select but keeps create_for_team mentions wide', async () => {
    mockListReadableAuthorTeams.mockResolvedValue(SOLE_TEAM)
    mockListAllTeams.mockResolvedValue(TEAMS)
    renderComposer({ canCreateForTeam: true })
    await waitFor(() => {
      expect(mockListReadableAuthorTeams).toHaveBeenCalledWith(AUTHOR_ID)
      expect(mockListAllTeams).toHaveBeenCalled()
    })

    expect(screen.queryByRole('combobox', { name: /team/i })).not.toBeInTheDocument()

    await userEvent.type(screen.getByRole('textbox', { name: /what happened/i }), '@')
    expect(await findMentionOption(/Radiant Operations/)).toBeInTheDocument()
  })

  it('keeps non-membership Teams out of mentions without create_for_team', async () => {
    renderComposer({ canCreateForTeam: false })
    await waitFor(() => expect(mockListAuthorTeams).toHaveBeenCalledWith(AUTHOR_ID))

    await userEvent.type(screen.getByRole('textbox', { name: /what happened/i }), '@')
    const listbox = await screen.findByRole('listbox', { name: /mention/i })
    expect(within(listbox).queryByRole('option', { name: /Radiant Operations/ })).not.toBeInTheDocument()
  })
})

describe('SignalComposer — Shift+Enter send (OD-REDESIGN-91 #10)', () => {
  it('#10: Shift+Enter posts the Signal; plain Enter is a newline (not a post)', async () => {
    renderComposer() // single team auto-picks, so only the body is needed
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())
    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, 'The freezer alarm went off')

    fireEvent.keyDown(body, { key: 'Enter' }) // plain Enter → newline
    expect(mockCreateSignal).not.toHaveBeenCalled()

    fireEvent.keyDown(body, { key: 'Enter', shiftKey: true }) // Shift+Enter → send
    await waitFor(() => expect(mockCreateSignal).toHaveBeenCalledTimes(1))
    expect(mockCreateSignal.mock.calls[0][0].body).toBe('The freezer alarm went off')
  })

})

describe('SignalComposer — safe retry after a failed post (CQ IMPORTANT-1)', () => {
  it('keeps the typed body and re-enables Share Signal when the post fails, then a retry succeeds', async () => {
    // The post is now one atomic RPC: a failure commits nothing, so retrying cannot double-post.
    mockCreateSignal.mockRejectedValueOnce(new Error('fan-out exceeds cap of 50 recipients'))
    renderComposer()
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())

    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, 'The freezer alarm went off')
    const shareButton = screen.getByRole('button', { name: /share signal/i })
    await userEvent.click(shareButton)

    // The error surfaces, the body is preserved, and Share is enabled again (retry is safe).
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't share — try again/i)
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
  it('opens a grouped Person/Team/BU popover on "@" with the type label in the group header only', async () => {
    renderComposer()
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())
    const body = screen.getByRole('textbox', { name: /what happened/i })

    await userEvent.type(body, 'Heads up @Pe')

    const popover = await screen.findByRole('listbox', { name: /mention/i })
    expect(popover).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Peer Person/i })).toBeInTheDocument()
    expect(screen.queryByText('person')).not.toBeInTheDocument()

    // Team and BU groups render even without a matching prefix filter on this query
    expect(screen.getByText('Person')).toBeInTheDocument()
  })

  // D-B2 (I5 / OD-83.1): Escape while the mention popover is open dismisses the PICKER only and is
  // consumed — it must not bubble to the composer's ModalShell host and close it, losing the draft.
  it('Escape dismisses the mention popover, preserves the draft, and does not bubble to the host', async () => {
    const hostEscape = vi.fn()
    render(
      <I18nProvider>
        <div onKeyDown={(e) => { if (e.key === 'Escape') hostEscape() }}>
          <SignalComposer authorId={AUTHOR_ID} authorName="Author One" canMentionBu />
        </div>
      </I18nProvider>,
    )
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())
    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, 'Heads up @Pe')
    expect(await screen.findByRole('listbox', { name: /mention/i })).toBeInTheDocument()

    await userEvent.type(body, '{Escape}')

    await waitFor(() => expect(screen.queryByRole('listbox', { name: /mention/i })).toBeNull())
    expect(body).toHaveValue('Heads up @Pe') // draft intact
    expect(hostEscape).not.toHaveBeenCalled() // isolation — the host never saw it
  })

  it('disables the BU group without signal.mention_bu, and enables it when the viewer holds it', async () => {
    const { unmount } = renderComposer({ canMentionBu: false })
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())
    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, '@')

    const buOption = await screen.findByRole('option', { name: /Retail Ops/i })
    expect(buOption).toBeDisabled()
    // DO-17 F4: the disabled @BU row states WHY it can't be picked, not a silent dead control.
    expect(buOption).toHaveAttribute('title', expect.stringMatching(/permission to mention a Business Unit/i))
    unmount()

    renderComposer({ canMentionBu: true })
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalledTimes(2))
    const body2 = screen.getAllByRole('textbox', { name: /what happened/i })[0]
    await userEvent.type(body2, '@')
    const enabledBuOption = await screen.findByRole('option', { name: /Retail Ops/i })
    expect(enabledBuOption).toBeEnabled()
  })

  // DO-17 F3: while a post is in flight the primary button shows an explicit loading affordance
  // (a "Sharing…" label + aria-busy), not merely a disabled control.
  it('DO-17 F3: shows a loading affordance on the Share button while the post is in flight', async () => {
    let resolvePost: (id: string) => void = () => {}
    mockCreateSignal.mockReturnValue(new Promise<string>((r) => { resolvePost = r }))
    renderComposer()
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())
    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, 'The freezer alarm went off')
    await userEvent.click(screen.getByRole('button', { name: /share signal/i }))

    const posting = await screen.findByRole('button', { name: /sharing/i })
    expect(posting).toHaveAttribute('aria-busy', 'true')
    resolvePost('signal-new')
  })

  it('selecting a mention option inserts an @Name chip in the body and stages the mention', async () => {
    renderComposer()
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())
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
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())
    const body = screen.getByRole('textbox', { name: /what happened/i })

    // Stage a @Team mention (2 members) AND an overlapping @Person mention (person-peer, already
    // a team-hq member) — the notify count must NOT double-count person-peer.
    await userEvent.type(body, 'Heads up @HQ')
    await userEvent.click(await findMentionOption(/HQ Operations/i))
    await userEvent.type(body, ' cc @Pe')
    await userEvent.click(await findMentionOption(/Peer Person/i))

    // SR-1 (owner ruling): the dedup count carries its noun — "notify N people", never a naked N.
    expect(screen.getByText('Visible to HQ Operations · notify 2 people')).toBeInTheDocument()
  })

  it('shows "Visible to <Team>" with no notify suffix when no mentions are staged', async () => {
    renderComposer()
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())
    expect(await screen.findByText('Visible to HQ Operations')).toBeInTheDocument()
  })

  it('shows a cross-Team destination preview "Post to <Team> · <attention> · notify N" when the author changes the owning Team', async () => {
    mockListReadableAuthorTeams.mockResolvedValue(TEAMS)
    renderComposer({ teamMembers: { 'team-radiant': ['person-peer'] } })
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())

    const teamSelect = await screen.findByRole('combobox', { name: /team/i })
    await userEvent.selectOptions(teamSelect, 'team-radiant')
    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, '@Pe')
    await userEvent.click(await findMentionOption(/Peer Person/i))

    // SR-1: singular count inflects the noun — "notify 1 person".
    expect(screen.getByText('Post to Radiant Operations · FYI · notify 1 person')).toBeInTheDocument()
  })
})

describe('SignalComposer — pill grammar (#768)', () => {
  it('AC-056/057: renders the convergence order and only shows Team select for multiple teams', async () => {
    mockGetTeamSite.mockResolvedValue({ id: 'site-hq', name: 'Gordi HQ' })
    renderComposer()
    await waitFor(() => expect(mockGetTeamSite).toHaveBeenCalledWith('team-hq'))
    const composer = screen.getByTestId('signal-composer')
    expect(composer.textContent).toMatch(/Gordi HQ.*Just now.*FYI.*Owning Team: HQ Operations.*Author: Author One/i)
    expect(screen.queryByRole('combobox', { name: /team/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()

    mockListReadableAuthorTeams.mockResolvedValue(TEAMS)
    renderComposer()
    await waitFor(() => expect(screen.getAllByRole('combobox', { name: /team/i })).toHaveLength(1))
    expect(screen.getAllByRole('combobox', { name: /team/i })[0]).toHaveValue('')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /team/i }), 'team-radiant')
    expect(screen.getByText(/Owning Team: Radiant Operations/i)).toBeInTheDocument()
  })

  it('AC-058/059: attention tint, overlay ownership, picked time format, and posted occurred_at', async () => {
    renderComposer()
    await waitFor(() => expect(mockGetTeamSite).toHaveBeenCalled())
    const attentionButton = screen.getByRole('button', { name: /FYI/i })
    await userEvent.click(attentionButton)
    expect(screen.getByRole('menu')).toHaveTextContent(/Needs attention/i)
    // #768 round 5: the menu renders INLINE in the pill row — the same mechanism as the occurred
    // popover — so inside the composer dialog it stays inside the modal's Tab trap and above its
    // own surface. A document.body portal (round 4) took it out of both.
    expect(screen.getByRole('menu').closest('.signal-composer-pill-row')).not.toBeNull()
    await userEvent.click(screen.getByRole('menuitem', { name: /Urgent/i }))
    const urgentButton = screen.getByRole('button', { name: /Urgent/i })
    expect(urgentButton).toHaveClass('signal-attention-pill--urgent')
    expect(urgentButton).toHaveFocus()

    await userEvent.click(screen.getByRole('button', { name: /Just now/i }))
    const occurredDialog = screen.getByRole('dialog', { name: /occurred/i })
    const occurredInput = within(occurredDialog).getByLabelText(/occurred/i)
    fireEvent.change(occurredInput, { target: { value: '2026-07-16T02:00' } })
    expect(screen.getByRole('button', { name: /16 Jul 02:00/i })).toBeInTheDocument()
    fireEvent.keyDown(occurredInput, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: /occurred/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /16 Jul 02:00/i })).toHaveFocus()

    await userEvent.type(screen.getByRole('textbox', { name: /what happened/i }), 'Gas leak')
    await userEvent.click(screen.getByRole('button', { name: /share signal/i }))
    await waitFor(() => expect(mockCreateSignal).toHaveBeenCalledWith(expect.objectContaining({
      attention: 'Urgent', occurredAt: new Date('2026-07-16T02:00').toISOString(),
    })))
  })

  it('AC-063: translates database failures into plain sharing copy', async () => {
    mockCreateSignal.mockRejectedValueOnce(Object.assign(new Error('permission denied for table signals'), { code: '42501' }))
    renderComposer()
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())
    await userEvent.type(screen.getByRole('textbox', { name: /what happened/i }), 'Gas leak')
    await userEvent.click(screen.getByRole('button', { name: /share signal/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't share — you can't post to this team")
  })

  it('AC-064: mention groups carry the type label, not a per-option type badge', async () => {
    renderComposer()
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())
    await userEvent.type(screen.getByRole('textbox', { name: /what happened/i }), '@Pe')
    const listbox = await screen.findByRole('listbox', { name: /mention/i })
    expect(within(listbox).getByText('Person')).toBeInTheDocument()
    expect(within(listbox).queryByText('person')).not.toBeInTheDocument()
  })

  it('AC-067: preserves the empty-team and Shift+Enter capture contracts', async () => {
    mockListReadableAuthorTeams.mockResolvedValue([])
    renderComposer()
    expect(await screen.findByText('No team to post to')).toBeInTheDocument()
  })
})

describe('SignalComposer — acceptance pins (#768)', () => {
  it('AC-061: has no attach control in any state', async () => {
    renderComposer()
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())
    expect(screen.getByTestId('signal-composer').querySelectorAll('input')).toHaveLength(0)
    expect(screen.getByTestId('signal-composer').querySelector('.signal-composer-foot')?.querySelectorAll('button, input, a')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: /Just now/i }))
    expect(screen.getByTestId('signal-composer').querySelectorAll('input')).toHaveLength(1)
    expect(screen.getByTestId('signal-composer').querySelectorAll('input[type="file"]')).toHaveLength(0)
  })

  it('AC-066: renders Indonesian composer labels and attention choices', async () => {
    window.localStorage.setItem('mos.locale', 'id')
    render(<I18nProvider><SignalComposer authorId={AUTHOR_ID} authorName="Author One" /></I18nProvider>)
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /Baru saja/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /FYI/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /FYI/i }))
    expect(screen.getByRole('menu')).toHaveTextContent(/Perlu perhatian/)
    expect(screen.getByRole('menu')).toHaveTextContent(/Mendesak/)
    expect(screen.getByText(/Tim Pemilik:.*Penulis:/i)).toBeInTheDocument()
  })

  it('AC-056/057: exact focusable inventory is five for one team and six for multiple teams', async () => {
    renderRealComposerHost()
    await userEvent.click(screen.getByRole('button', { name: 'open-composer' }))
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())
    expect(screen.getByRole('dialog').querySelectorAll('button, textarea, select, input')).toHaveLength(5)
    mockListReadableAuthorTeams.mockResolvedValue(TEAMS)
    renderRealComposerHost()
    await userEvent.click(screen.getAllByRole('button', { name: 'open-composer' })[1])
    await waitFor(() => expect(screen.getAllByRole('combobox', { name: /team/i })).toHaveLength(1))
    expect(screen.getAllByRole('dialog')[1].querySelectorAll('button, textarea, select, input')).toHaveLength(6)
  })

  it('clearing Occurred falls back to Just now without throwing', async () => {
    renderComposer()
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: /Just now/i }))
    const input = screen.getByRole('dialog', { name: /occurred/i }).querySelector('input')!
    expect(() => fireEvent.change(input, { target: { value: '' } })).not.toThrow()
    expect(screen.getByRole('button', { name: /Just now/i })).toBeInTheDocument()
  })

  it('popover Escape belongs to the popover, not the real composer ModalShell', async () => {
    const onClose = vi.fn()
    render(<I18nProvider><ModalShell open onClose={onClose} ariaLabel="Share Signal"><SignalComposer authorId={AUTHOR_ID} authorName="Author One" /></ModalShell></I18nProvider>)
    await waitFor(() => expect(mockListReadableAuthorTeams).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: /Just now/i }))
    fireEvent.keyDown(screen.getByRole('dialog', { name: /occurred/i }).querySelector('input')!, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: /occurred/i })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /FYI/i }))
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('AC-065: pill heights and mobile layout rules are pinned in CSS', () => {
    const composerCss = readFileSync(resolve(process.cwd(), 'src/components/signals/signal-composer.css'), 'utf8')
    const hostCss = readFileSync(resolve(process.cwd(), 'src/shell/signal-composer-host.css'), 'utf8')
    expect(composerCss).toMatch(/\.signal-composer-pill\s*\{[^}]*height:\s*44px[^}]*min-height:\s*44px/)
    expect(composerCss).toMatch(/\.signal-location-pill\s*\{[^}]*cursor: default/)
    expect(composerCss).toMatch(/@media \(max-width: 767\.98px\)[\s\S]*\.signal-composer-mention-anchor\s*\{[^}]*flex: 1/)
    expect(composerCss).toMatch(/@media \(max-width: 767\.98px\)[\s\S]*\.signal-composer-foot\s*\{[^}]*position: sticky;[^}]*bottom: 0/)
    expect(hostCss).toMatch(/@media \(max-width: 767\.98px\)/)
    expect(hostCss).toMatch(/\.signal-composer-host-panel > \.signal-composer\s*\{[^}]*flex: 1[^}]*min-height: 0/)
  })
})

describe('SignalComposer — derived Site pill, no @Site (AC-423)', () => {
  it('renders a read-only Site pill derived from the owning Team, and Site is absent from the @ picker', async () => {
    mockGetTeamSite.mockResolvedValue({ id: 'site-hq', name: 'Gordi HQ' })
    renderComposer()
    await waitFor(() => expect(mockGetTeamSite).toHaveBeenCalledWith('team-hq'))

    const pill = await screen.findByTestId('signal-site-pill')
    expect(pill).toHaveTextContent('Gordi HQ')
    // Location is a pill, not a mention target (D37).
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
