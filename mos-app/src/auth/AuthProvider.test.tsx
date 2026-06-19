import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock supabase and resolveViewer before imports that use them
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
    },
  },
}))

vi.mock('../lib/db/viewer', () => ({
  resolveViewer: vi.fn(),
}))

import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'
import { supabase } from '@/lib/supabase'
import { resolveViewer } from '@/lib/db/viewer'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { Session } from '@supabase/supabase-js'

const mockGetSession = vi.mocked(supabase.auth.getSession)
const mockOnAuthStateChange = vi.mocked(supabase.auth.onAuthStateChange)
const mockSignOut = vi.mocked(supabase.auth.signOut)
const mockResolveViewer = vi.mocked(resolveViewer)

const personRow: PeopleRow = {
  id: '40000000-0000-0000-0000-000000000001',
  org_id: '10000000-0000-0000-0000-000000000001',
  user_id: 'auth-user-001',
  full_name: 'Cahya Cafe',
  email: 'cahya.dev@example.test',
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const roles: RolesRow[] = []

// Consumer component to inspect auth state
function AuthConsumer() {
  const auth = useAuth()
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      {auth.status === 'authenticated' && (
        <>
          <span data-testid="name">{auth.viewer.person.full_name}</span>
          <button onClick={() => auth.signOut()}>Sign out</button>
        </>
      )}
      {auth.status === 'orphan' && (
        <button onClick={() => auth.signOut()}>Sign out orphan</button>
      )}
      {auth.status === 'recovering' && (
        <button onClick={() => auth.clearRecovering()}>Clear recovering</button>
      )}
    </div>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: onAuthStateChange returns an unsubscribe fn
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn(), id: 'sub', callback: vi.fn() } },
    } as ReturnType<typeof supabase.auth.onAuthStateChange>)
  })

  it('AC-009: provider exposes status loading before the session settles', async () => {
    // Never resolves during this test
    mockGetSession.mockReturnValue(new Promise(() => {}) as ReturnType<typeof supabase.auth.getSession>)

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    )

    // Before session settles, status should be 'loading'
    expect(screen.getByTestId('status').textContent).toBe('loading')
  })

  it('session resolves with a person → status authenticated, viewer.person set', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'auth-user-001' } } },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
    mockResolveViewer.mockResolvedValue({ person: personRow, roles, isManager: false })

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      )
    })

    expect(screen.getByTestId('status').textContent).toBe('authenticated')
    expect(screen.getByTestId('name').textContent).toBe('Cahya Cafe')
  })

  it('session resolves but resolveViewer returns person null → status orphan', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'auth-user-orphan' } } },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
    mockResolveViewer.mockResolvedValue({ person: null, roles: [], isManager: false })

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      )
    })

    expect(screen.getByTestId('status').textContent).toBe('orphan')
  })

  it('PASSWORD_RECOVERY event → status recovering', async () => {
    // Setup: getSession resolves no session initially (recovery link provides session via event)
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>)

    let capturedCallback: Parameters<typeof supabase.auth.onAuthStateChange>[0] | null = null
    mockOnAuthStateChange.mockImplementation((cb) => {
      capturedCallback = cb
      return {
        data: { subscription: { unsubscribe: vi.fn(), id: 'sub', callback: vi.fn() } },
      } as ReturnType<typeof supabase.auth.onAuthStateChange>
    })

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      )
    })

    // Fire PASSWORD_RECOVERY event (simulates Supabase consuming the recovery link)
    await act(async () => {
      capturedCallback!('PASSWORD_RECOVERY', {
        user: { id: 'auth-user-001' },
      } as Partial<Session> as Session)
    })

    expect(screen.getByTestId('status').textContent).toBe('recovering')
  })

  it('recovering → clearRecovering → transitions to authenticated', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
    mockResolveViewer.mockResolvedValue({ person: personRow, roles, isManager: false })

    let capturedCallback: Parameters<typeof supabase.auth.onAuthStateChange>[0] | null = null
    mockOnAuthStateChange.mockImplementation((cb) => {
      capturedCallback = cb
      return {
        data: { subscription: { unsubscribe: vi.fn(), id: 'sub', callback: vi.fn() } },
      } as ReturnType<typeof supabase.auth.onAuthStateChange>
    })

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      )
    })

    await act(async () => {
      capturedCallback!('PASSWORD_RECOVERY', {
        user: { id: 'auth-user-001' },
      } as Partial<Session> as Session)
    })

    expect(screen.getByTestId('status').textContent).toBe('recovering')

    // Simulate success: RecoveryPage calls clearRecovering after updateUser succeeds
    await act(async () => {
      screen.getByRole('button', { name: 'Clear recovering' }).click()
    })

    // After clearRecovering, resolves viewer and transitions to authenticated
    await act(async () => {})

    expect(screen.getByTestId('status').textContent).toBe('authenticated')
  })

  it('signOut calls supabase.auth.signOut and transitions to unauthenticated', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'auth-user-001' } } },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
    mockResolveViewer.mockResolvedValue({ person: personRow, roles, isManager: false })
    mockSignOut.mockResolvedValue({ error: null })

    const user = userEvent.setup()

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      )
    })

    expect(screen.getByTestId('status').textContent).toBe('authenticated')

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Sign out' }))
    })

    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
  })
})
