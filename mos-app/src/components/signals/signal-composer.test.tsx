import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ModalShell } from '@/components/ui/modal-shell'
import type { TeamOption } from '@/lib/db/signals.types'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'

// ── Mock the DAL (component tests mock the DAL, never a live DB) ────────────
vi.mock('@/lib/db/signals', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/signals')>('@/lib/db/signals')
  return {
    listAllTeams: vi.fn(),
    createSignal: vi.fn(),
    dedupeRecipients: actual.dedupeRecipients, // real (pure) implementation — the point under test
  }
})
vi.mock('@/lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
}))

import { listAllTeams, createSignal } from '@/lib/db/signals'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { SignalComposer } from './signal-composer'

const mockListAllTeams = vi.mocked(listAllTeams)
const mockCreateSignal = vi.mocked(createSignal)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockGetPeople = vi.mocked(getPeople)

const AUTHOR_ID = 'person-author-a'

const TEAMS: TeamOption[] = [
  { id: 'team-hq', name: 'HQ Operations', business_unit_id: 'bu-retail', site_id: 'site-hq', is_primary: true },
  { id: 'team-radiant', name: 'Radiant Operations', business_unit_id: 'bu-retail', site_id: 'site-radiant', is_primary: false },
]
const BUS: BusinessUnitOption[] = [{ id: 'bu-retail', name: 'Retail Ops' }]
const PEOPLE: PersonOption[] = [{ id: AUTHOR_ID, full_name: 'Author One' }, { id: 'person-peer', full_name: 'Peer Person' }]

/** The mention popover's option role — scoped to the popover listbox. */
async function findMentionOption(name: RegExp) {
  const listbox = await screen.findByRole('listbox', { name: /mention/i })
  return within(listbox).findByRole('option', { name })
}

function renderComposer(props: Partial<React.ComponentProps<typeof SignalComposer>> = {}) {
  return render(
    <I18nProvider>
      <div style={{ width: 390 }}>
        <SignalComposer authorId={AUTHOR_ID} authorName="Author One" canTag canMentionBu {...props} />
      </div>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mockListAllTeams.mockResolvedValue(TEAMS)
  mockGetBusinessUnits.mockResolvedValue(BUS)
  mockGetPeople.mockResolvedValue(PEOPLE)
  mockCreateSignal.mockResolvedValue('signal-new')
})

describe('SignalComposer — repost prefill', () => {
  it('submits staged mention rows carried by a reposted draft', async () => {
    renderComposer({
      prefill: {
        body: 'The freezer alarm went off @Peer Person',
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

describe('SignalComposer — capture-minimal fields (AC-420)', () => {
  it('paints the capture fields and enables Share Signal with only body typed — no Team required', async () => {
    renderComposer()
    await waitFor(() => expect(mockGetPeople).toHaveBeenCalled())

    // 1. Content
    const body = screen.getByRole('textbox', { name: /what happened/i })
    // 2. Occurrence time — a contextual pill backed by the native picker.
    const occurred = screen.getByLabelText(/occurred/i)
    // 3. Author — one metadata line with the audience, read-only (not a form control).
    expect(screen.getByText('All teams · Author One')).toBeInTheDocument()

    // No owning-Team machinery anywhere: a new Signal is All Teams with no Team target.
    expect(screen.queryByRole('combobox', { name: /owning team|tim pemilik/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('signal-site-pill')).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: /attention.*FYI|FYI.*attention/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /attention.*FYI|FYI.*attention/i })).toHaveAttribute('id', 'signals-compose-attention')

    const shareButton = screen.getByRole('button', { name: /share signal/i })
    expect(shareButton).toBeDisabled() // no body yet

    await userEvent.type(body, 'The freezer alarm went off')
    expect(shareButton).toBeEnabled() // an All Teams Signal needs only a body (AC-7)
    expect((occurred as HTMLInputElement).value.length).toBeGreaterThan(0)

    // There is no category decision for the author to make at capture, so there is no caption
    // about one.
    expect(screen.queryByText(/category is added after posting/i)).not.toBeInTheDocument()
  })

  it('posts via createSignal with the typed body and no owning Team when Share is pressed', async () => {
    renderComposer()
    await waitFor(() => expect(mockGetPeople).toHaveBeenCalled())

    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, 'The freezer alarm went off')
    await userEvent.click(screen.getByRole('button', { name: /share signal/i }))

    await waitFor(() => expect(mockCreateSignal).toHaveBeenCalledTimes(1))
    const call = mockCreateSignal.mock.calls[0][0]
    expect(call.body).toBe('The freezer alarm went off')
    expect(call).not.toHaveProperty('owningTeamId')
    expect(call.mentions).toEqual([])
    expect(call.attention).toBe('FYI')
  })

  it('posts Urgent when the optional attention control is raised', async () => {
    renderComposer()
    await waitFor(() => expect(mockGetPeople).toHaveBeenCalled())
    await userEvent.type(screen.getByRole('textbox', { name: /what happened/i }), 'Gas leak')
    await userEvent.click(screen.getByRole('button', { name: /attention.*FYI|FYI.*attention/i }))
    await userEvent.click(screen.getByRole('option', { name: /urgent/i }))
    await userEvent.click(screen.getByRole('button', { name: /share signal/i }))

    await waitFor(() => expect(mockCreateSignal).toHaveBeenCalledTimes(1))
    expect(mockCreateSignal.mock.calls[0][0].attention).toBe('Urgent')
  })
})

describe('SignalComposer — directory-load error retry', () => {
  it('shows the directory error but never blocks capture; retry reloads the mention rosters', async () => {
    mockGetPeople.mockRejectedValueOnce(new Error('Network unavailable'))
    renderComposer()
    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, 'Keep this observation')
    const retry = await screen.findByRole('button', { name: /^Try again$/ })
    // An All Teams Signal needs only a body — a failed mention-directory load must not block Share
    // (Rule 8: capture never blocks on enrichment data).
    expect(screen.getByRole('button', { name: /share signal/i })).toBeEnabled()

    // Retry reloads the directory; the error banner is gone and the draft survives.
    await userEvent.click(retry)
    await waitFor(() => expect(mockGetPeople).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('button', { name: /^Try again$/ })).not.toBeInTheDocument()
    expect(body).toHaveValue('Keep this observation')

    await userEvent.click(screen.getByRole('button', { name: /share signal/i }))
    await waitFor(() => expect(mockCreateSignal).toHaveBeenCalledWith(expect.objectContaining({ body: 'Keep this observation' })))
  })
})

describe('SignalComposer — Shift+Enter send (OD-REDESIGN-91 #10)', () => {
  it('#10: Shift+Enter posts the Signal; plain Enter is a newline (not a post)', async () => {
    renderComposer()
    await waitFor(() => expect(mockGetPeople).toHaveBeenCalled())
    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, 'The freezer alarm went off')

    fireEvent.keyDown(body, { key: 'Enter' }) // plain Enter → newline
    expect(mockCreateSignal).not.toHaveBeenCalled()

    fireEvent.keyDown(body, { key: 'Enter', shiftKey: true }) // Shift+Enter → send
    await waitFor(() => expect(mockCreateSignal).toHaveBeenCalledTimes(1))
    expect(mockCreateSignal.mock.calls[0][0].body).toBe('The freezer alarm went off')
  })

  it('#20: keeps the native datetime picker and shows a WIB hint beside it', async () => {
    renderComposer()
    await waitFor(() => expect(mockGetPeople).toHaveBeenCalled())
    expect(screen.getByLabelText(/occurred/i)).toHaveAttribute('type', 'datetime-local')
    expect(screen.getByText('WIB')).toBeInTheDocument()
  })
})

describe('SignalComposer — safe retry after a failed post (CQ IMPORTANT-1)', () => {
  it('maps a blocked-posting error to the permission message and resets the in-flight state', async () => {
    // A policy/RLS-shaped denial (42501) surfaces the human permission message, never raw Postgres
    // internals (SECURITY-LOW-1 / D11 sanitization at the composer seam).
    mockCreateSignal.mockRejectedValueOnce(new Error('new row violates row-level security policy'))
    renderComposer()
    await waitFor(() => expect(mockGetPeople).toHaveBeenCalled())

    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, 'The freezer alarm went off')
    await userEvent.click(screen.getByRole('button', { name: /share signal/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/permission to share this Signal/i)
    expect(screen.queryByText(/row-level security/i)).not.toBeInTheDocument()
    // Posting reset: the Sharing in-flight state cleared and Share is enabled again for a retry.
    expect(screen.queryByRole('button', { name: /sharing/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /share signal/i })).toBeEnabled()
    expect(body).toHaveValue('The freezer alarm went off')
  })

  it('keeps the typed body and re-enables Share Signal when the post fails, then a retry succeeds', async () => {
    mockCreateSignal.mockRejectedValueOnce(new Error('fan-out exceeds cap of 50 recipients'))
    renderComposer()
    await waitFor(() => expect(mockGetPeople).toHaveBeenCalled())

    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, 'The freezer alarm went off')
    const shareButton = screen.getByRole('button', { name: /share signal/i })
    await userEvent.click(shareButton)

    expect(await screen.findByRole('alert')).toHaveTextContent(/fan-out exceeds cap/i)
    expect(body).toHaveValue('The freezer alarm went off')
    expect(shareButton).toBeEnabled()

    mockCreateSignal.mockResolvedValueOnce('signal-new')
    await userEvent.click(shareButton)
    await waitFor(() => expect(mockCreateSignal).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(body).toHaveValue(''))
  })
})

describe('SignalComposer — grouped @ mention picker (AC-421)', () => {
  it('opens a grouped Person/Team/BU popover on "@"', async () => {
    renderComposer()
    await waitFor(() => expect(mockGetPeople).toHaveBeenCalled())
    const body = screen.getByRole('textbox', { name: /what happened/i })

    await userEvent.type(body, 'Heads up @Pe')

    const popover = await screen.findByRole('listbox', { name: /mention/i })
    expect(popover).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Peer Person/i })).toBeInTheDocument()
    // The group header is the ONE label for the kind — no duplicate per-row badge.
    expect(screen.getByText('Person')).toBeInTheDocument()
  })

  it('Escape dismisses the mention popover, preserves the draft, and does not bubble to the host (div host)', async () => {
    const hostEscape = vi.fn()
    render(
      <I18nProvider>
        <div onKeyDown={(e) => { if (e.key === 'Escape') hostEscape() }}>
        <SignalComposer authorId={AUTHOR_ID} authorName="Author One" canTag canMentionBu />
        </div>
      </I18nProvider>,
    )
    await waitFor(() => expect(mockGetPeople).toHaveBeenCalled())
    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, 'Heads up @Pe')
    expect(await screen.findByRole('listbox', { name: /mention/i })).toBeInTheDocument()

    await userEvent.type(body, '{Escape}')

    await waitFor(() => expect(screen.queryByRole('listbox', { name: /mention/i })).toBeNull())
    expect(body).toHaveValue('Heads up @Pe')
    expect(hostEscape).not.toHaveBeenCalled()
  })

  it('Escape dismisses the mention popover inside a real modal host, without closing the modal', async () => {
    const onClose = vi.fn()
    render(
      <I18nProvider>
        <ModalShell open onClose={onClose} ariaLabel="Share a Signal">
          <SignalComposer authorId={AUTHOR_ID} authorName="Author One" canTag canMentionBu />
        </ModalShell>
      </I18nProvider>,
    )
    await waitFor(() => expect(mockGetPeople).toHaveBeenCalled())
    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, 'Heads up @Pe')
    expect(await screen.findByRole('listbox', { name: /mention/i })).toBeInTheDocument()

    await userEvent.type(body, '{Escape}')

    await waitFor(() => expect(screen.queryByRole('listbox', { name: /mention/i })).toBeNull())
    expect(body).toHaveValue('Heads up @Pe')
    expect(onClose).not.toHaveBeenCalled()
  })

  // The attention picker's own listbox is a nested popover over a host that also owns Escape —
  // the same shape as the mention popover above. Escape must close only the menu, never reach
  // the modal host.
  it('Escape with the attention menu open closes ONLY the menu, returns focus to its trigger, and never reaches the modal host', async () => {
    const onClose = vi.fn()
    render(
      <I18nProvider>
        <ModalShell open onClose={onClose} ariaLabel="Share a Signal">
          <SignalComposer authorId={AUTHOR_ID} authorName="Author One" canTag canMentionBu />
        </ModalShell>
      </I18nProvider>,
    )
    await waitFor(() => expect(mockGetPeople).toHaveBeenCalled())
    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, 'The freezer alarm went off')
    const trigger = screen.getByRole('button', { name: /attention.*FYI|FYI.*attention/i })
    await userEvent.click(trigger)
    expect(screen.getByRole('listbox', { name: /attention/i })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('listbox', { name: /attention/i })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(body).toHaveValue('The freezer alarm went off')
    expect(onClose).not.toHaveBeenCalled()
  })

  // The dialog scrolls its own content in an overflow: auto surface. A menu rendered as part of
  // that content (even absolutely positioned) can grow the surface's scrollable area and, once
  // focused, drag its scroll position to follow — hiding the dialog's own header. The menu must
  // sit entirely outside the dialog's DOM subtree.
  it('opening the attention menu never becomes part of the dialog surface, and never changes its scroll position', async () => {
    render(
      <I18nProvider>
        <ModalShell open onClose={vi.fn()} ariaLabel="Share a Signal">
          <SignalComposer authorId={AUTHOR_ID} authorName="Author One" canTag canMentionBu />
        </ModalShell>
      </I18nProvider>,
    )
    await waitFor(() => expect(mockGetPeople).toHaveBeenCalled())
    const dialog = screen.getByRole('dialog', { name: /share a signal/i })
    dialog.scrollTop = 0
    const trigger = screen.getByRole('button', { name: /attention.*FYI|FYI.*attention/i })
    await userEvent.click(trigger)

    const listbox = screen.getByRole('listbox', { name: /attention/i })
    expect(dialog.contains(listbox)).toBe(false)
    expect(dialog.scrollTop).toBe(0)
  })

  it('disables the BU group without signal.mention_bu, and enables it when the viewer holds it', async () => {
    const { unmount } = renderComposer({ canMentionBu: false })
    await waitFor(() => expect(mockGetPeople).toHaveBeenCalled())
    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, '@')

    const buOption = await screen.findByRole('option', { name: /Retail Ops/i })
    expect(buOption).toBeDisabled()
    expect(buOption).toHaveAttribute('title', expect.stringMatching(/permission to mention a Business Unit/i))
    unmount()

    renderComposer({ canMentionBu: true })
    const body2 = screen.getAllByRole('textbox', { name: /what happened/i })[0]
    await userEvent.type(body2, '@')
    const enabledBuOption = await screen.findByRole('option', { name: /Retail Ops/i })
    expect(enabledBuOption).toBeEnabled()
  })

  it('DO-17 F3: shows a loading affordance on the Share button while the post is in flight', async () => {
    let resolvePost: (id: string) => void = () => {}
    mockCreateSignal.mockReturnValue(new Promise<string>((r) => { resolvePost = r }))
    renderComposer()
    await waitFor(() => expect(mockGetPeople).toHaveBeenCalled())
    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, 'The freezer alarm went off')
    await userEvent.click(screen.getByRole('button', { name: /share signal/i }))

    const posting = await screen.findByRole('button', { name: /sharing/i })
    expect(posting).toHaveAttribute('aria-busy', 'true')
    resolvePost('signal-new')
  })

  it('selecting a mention option inserts an @Name chip in the body and stages the mention', async () => {
    renderComposer()
    await waitFor(() => expect(mockGetPeople).toHaveBeenCalled())
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

describe('SignalComposer — All Teams visibility + dedup fan-out preview (AC-422)', () => {
  it('shows "All teams · notifies N people · <author>" with the deduplicated count for overlapping mentions', async () => {
    renderComposer({ teamMembers: { 'team-hq': ['person-peer', 'person-other'] } })
    await waitFor(() => expect(mockGetPeople).toHaveBeenCalled())
    const body = screen.getByRole('textbox', { name: /what happened/i })

    // Stage a @Team mention (2 members) AND an overlapping @Person mention (person-peer) — the
    // count must NOT double-count person-peer.
    await userEvent.type(body, 'Heads up @HQ')
    await userEvent.click(await findMentionOption(/HQ Operations/i))
    await userEvent.type(body, ' cc @Pe')
    await userEvent.click(await findMentionOption(/Peer Person/i))

    // SR-1 (owner ruling): the dedup count carries its noun — "notifies N people", never a naked
    // N. One metadata line — audience, notify count, then author.
    expect(screen.getByText('All teams · notifies 2 people · Author One')).toBeInTheDocument()
  })

  // The audience phrase is STABLE — always "All teams" — with the notify segment appended, never
  // swapped in as a different phrase, so typing a mention can't change the wording the reader
  // already read.
  it('shows "All teams · <author>" with no notify suffix when no mentions are staged', async () => {
    renderComposer()
    await waitFor(() => expect(mockGetPeople).toHaveBeenCalled())
    expect(await screen.findByText('All teams · Author One')).toBeInTheDocument()
  })

  it('inflects the notify noun to the singular for one recipient', async () => {
    renderComposer({ teamMembers: { 'team-radiant': ['person-peer'] } })
    await waitFor(() => expect(mockGetPeople).toHaveBeenCalled())
    const body = screen.getByRole('textbox', { name: /what happened/i })
    await userEvent.type(body, '@Pe')
    await userEvent.click(await findMentionOption(/Peer Person/i))

    expect(screen.getByText('All teams · notifies 1 person · Author One')).toBeInTheDocument()
  })
})