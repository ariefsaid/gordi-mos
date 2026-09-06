import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'

// C1 (AC-428 backing / FR-417): one global command, many entry points. The host owns:
//  - the useSignalComposer().open() hook consumed by ⌘K / FAB / Home feed (C2/C3),
//  - mounting SignalComposer in the shared drawer host on open() / unmounting on close,
//  - wiring the real viewer (authorId/authorName) + mention capability (canMentionBu)
//    + real fan-out-preview rosters (KNOWN GAP 1 — loadMentionRosters, not the {} default).

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

vi.mock('@/lib/db/signals', () => ({ loadMentionRosters: vi.fn() }))
import { loadMentionRosters } from '@/lib/db/signals'
const mockLoadMentionRosters = vi.mocked(loadMentionRosters)

// SignalComposer itself is fully covered by signal-composer.test.tsx (B8–B11) — the host's own
// job is wiring, so it mocks the child component and asserts the props it receives + how open/
// close/onShared propagate.
vi.mock('@/components/signals/signal-composer', () => ({
  SignalComposer: vi.fn((props: Record<string, unknown>) => (
    <div data-testid="signal-composer-stub">
      <textarea ref={props.textareaRef as React.RefObject<HTMLTextAreaElement>} aria-label="What happened?" />
      <button type="button" onClick={() => (props.onDirtyChange as (dirty: boolean) => void)(true)}>make-dirty</button>
      <button type="button" onClick={() => (props.onShared as (id: string) => void)('signal-new')}>
        stub-share
      </button>
    </div>
  )),
}))
import { SignalComposer } from '@/components/signals/signal-composer'
const mockSignalComposer = vi.mocked(SignalComposer)

import { SignalComposerHost, useSignalComposer } from './signal-composer-host'

function Opener() {
  const { open, postCount } = useSignalComposer()
  return (
    <>
      <button type="button" onClick={() => open()}>open-composer</button>
      <span data-testid="post-count">{postCount}</span>
    </>
  )
}

function renderHost(auth: AuthState) {
  mockUseAuth.mockReturnValue(auth)
  return render(
    <I18nProvider>
      <SignalComposerHost>
        <Opener />
      </SignalComposerHost>
    </I18nProvider>,
  )
}

// Narrowed to the authenticated arm, not the whole union: the "plain member" case below re-spreads
// `.viewer`, which is only reachable on this arm. `must_change_password` is on `PeopleRow` on this
// line (the credential security series, which exists only here) and v4's fixture predates it.
type AuthedState = Extract<AuthState, { status: 'authenticated' }>

const authedViewer: AuthedState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: 'person-author', org_id: 'org-1', user_id: 'auth-1', full_name: 'Signal Author',
      email: 'author@example.test', archived_at: null, must_change_password: false,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
    roles: [], isManager: false, accessRoles: ['ops_lead'], affiliated: [],
  },
  signOut: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadMentionRosters.mockResolvedValue({ teamMembers: { 'team-a': ['p1'] }, buMembers: { 'bu-1': ['p1'] } })
})

describe('SignalComposerHost — one command, many entry points (C1, AC-428 backing / FR-417)', () => {
  it('does not mount the composer before open() is called', () => {
    renderHost(authedViewer)
    expect(screen.queryByTestId('signal-composer-stub')).not.toBeInTheDocument()
  })

  it('open() mounts SignalComposer in the shared drawer host', async () => {
    renderHost(authedViewer)
    await userEvent.click(screen.getByRole('button', { name: 'open-composer' }))
    expect(screen.getByTestId('signal-composer-stub')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: /share signal/i })
    expect(dialog).toHaveClass('modal-shell__surface')
    expect(dialog).toHaveAttribute('data-phone-mode', 'fullscreen')
    expect(screen.getAllByTestId('modal-shell-scrim')).toHaveLength(1)
  })

  it('closing (the scrim / Close control) unmounts the composer', async () => {
    renderHost(authedViewer)
    await userEvent.click(screen.getByRole('button', { name: 'open-composer' }))
    expect(screen.getByTestId('signal-composer-stub')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByTestId('signal-composer-stub')).not.toBeInTheDocument()
  })

  it('Escape/close with a body asks to discard; Keep editing restores textarea focus and Discard closes', async () => {
    renderHost(authedViewer)
    await userEvent.click(screen.getByRole('button', { name: 'open-composer' }))
    await userEvent.click(screen.getByRole('button', { name: 'make-dirty' }))
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.getByRole('heading', { name: 'Discard this Signal?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'What happened?' })).toHaveFocus())

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('heading', { name: 'Discard this Signal?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.getByRole('heading', { name: 'Discard this Signal?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.queryByTestId('signal-composer-stub')).not.toBeInTheDocument()
  })

  it('confirm Escape cancels the confirm instead of closing or swallowing it', async () => {
    renderHost(authedViewer)
    await userEvent.click(screen.getByRole('button', { name: 'open-composer' }))
    await userEvent.click(screen.getByRole('button', { name: 'make-dirty' }))
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('heading', { name: 'Discard this Signal?' })).not.toBeInTheDocument()
    expect(screen.getByTestId('signal-composer-stub')).toBeInTheDocument()
  })

  it('closes automatically when the composer reports a successful share (onShared)', async () => {
    renderHost(authedViewer)
    await userEvent.click(screen.getByRole('button', { name: 'open-composer' }))
    await userEvent.click(screen.getByRole('button', { name: 'stub-share' }))
    expect(screen.queryByTestId('signal-composer-stub')).not.toBeInTheDocument()
  })

  it('increments postCount on each successful share so feed/archive surfaces reload (AC-430)', async () => {
    renderHost(authedViewer)
    expect(screen.getByTestId('post-count')).toHaveTextContent('0')

    await userEvent.click(screen.getByRole('button', { name: 'open-composer' }))
    await userEvent.click(screen.getByRole('button', { name: 'stub-share' }))
    expect(screen.getByTestId('post-count')).toHaveTextContent('1')

    await userEvent.click(screen.getByRole('button', { name: 'open-composer' }))
    await userEvent.click(screen.getByRole('button', { name: 'stub-share' }))
    expect(screen.getByTestId('post-count')).toHaveTextContent('2')
  })

  it('wires the real viewer as authorId/authorName and derives mention capability', async () => {
    renderHost(authedViewer)
    await userEvent.click(screen.getByRole('button', { name: 'open-composer' }))

    await waitFor(() => expect(mockSignalComposer).toHaveBeenCalled())
    const props = mockSignalComposer.mock.calls.at(-1)![0]
    expect(props.authorId).toBe('person-author')
    expect(props.authorName).toBe('Signal Author')
    // ops_lead holds signal.mention_bu (A2 seed / capabilities.ts).
    expect(props.canMentionBu).toBe(true)
    expect(props.canCreateForTeam).toBe(true)
  })

  it('denies canMentionBu for a plain member (fail-closed default)', async () => {
    renderHost({ ...authedViewer, viewer: { ...authedViewer.viewer, accessRoles: [] } })
    await userEvent.click(screen.getByRole('button', { name: 'open-composer' }))

    await waitFor(() => expect(mockSignalComposer).toHaveBeenCalled())
    const props = mockSignalComposer.mock.calls.at(-1)![0]
    expect(props.canMentionBu).toBe(false)
    expect(props.canCreateForTeam).toBe(false)
  })

  it('loads real fan-out-preview rosters (KNOWN GAP 1) instead of the {} default', async () => {
    renderHost(authedViewer)
    await userEvent.click(screen.getByRole('button', { name: 'open-composer' }))

    await waitFor(() => expect(mockLoadMentionRosters).toHaveBeenCalled())
    await waitFor(() => {
      const props = mockSignalComposer.mock.calls.at(-1)![0]
      expect(props.teamMembers).toEqual({ 'team-a': ['p1'] })
      expect(props.buMembers).toEqual({ 'bu-1': ['p1'] })
    })
  })

  it('does not mount the composer for an unauthenticated/loading viewer (no person to author as)', async () => {
    renderHost({ status: 'loading' })
    await userEvent.click(screen.getByRole('button', { name: 'open-composer' }))
    expect(screen.queryByTestId('signal-composer-stub')).not.toBeInTheDocument()
  })
})
