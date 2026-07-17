import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'

// C1 (AC-428 backing / FR-417): one global command, many entry points. The host owns:
//  - the useSignalComposer().open() hook consumed by ⌘K / FAB / Home feed (C2/C3),
//  - mounting SignalComposer in the shared drawer host on open() / unmounting on close,
//  - wiring the real viewer (authorId/authorName) + capabilities (canCreateForTeam/canMentionBu)
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
      <button type="button" onClick={open}>open-composer</button>
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

const authedViewer: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: 'person-cahya', org_id: 'org-1', user_id: 'auth-1', full_name: 'Cahya Cafe',
      email: 'cahya@gordi.id', archived_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
    roles: [], isManager: false, accessRoles: ['ops_lead'],
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
    expect(screen.getByRole('dialog', { name: /share signal/i })).toBeInTheDocument()
  })

  it('closing (the scrim / Close control) unmounts the composer', async () => {
    renderHost(authedViewer)
    await userEvent.click(screen.getByRole('button', { name: 'open-composer' }))
    expect(screen.getByTestId('signal-composer-stub')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByTestId('signal-composer-stub')).not.toBeInTheDocument()
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

  it('wires the real viewer as authorId/authorName, and derives capabilities from accessRoles', async () => {
    renderHost(authedViewer)
    await userEvent.click(screen.getByRole('button', { name: 'open-composer' }))

    await waitFor(() => expect(mockSignalComposer).toHaveBeenCalled())
    const props = mockSignalComposer.mock.calls.at(-1)![0]
    expect(props.authorId).toBe('person-cahya')
    expect(props.authorName).toBe('Cahya Cafe')
    // ops_lead holds signal.create_for_team + signal.mention_bu (A2 seed / capabilities.ts).
    expect(props.canCreateForTeam).toBe(true)
    expect(props.canMentionBu).toBe(true)
  })

  it('denies canCreateForTeam/canMentionBu for a plain member (fail-closed default)', async () => {
    renderHost({ ...authedViewer, viewer: { ...authedViewer.viewer, accessRoles: [] } })
    await userEvent.click(screen.getByRole('button', { name: 'open-composer' }))

    await waitFor(() => expect(mockSignalComposer).toHaveBeenCalled())
    const props = mockSignalComposer.mock.calls.at(-1)![0]
    expect(props.canCreateForTeam).toBe(false)
    expect(props.canMentionBu).toBe(false)
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
