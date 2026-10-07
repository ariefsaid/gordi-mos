import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
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

// The device clear runs for real unless a test swaps in a failing or hanging one.
const deviceDrafts = vi.hoisted(() => ({ clear: null as null | (() => Promise<void>) }))
vi.mock('@/lib/device-drafts', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/device-drafts')>()
  return { clearDeviceDrafts: vi.fn(() => (deviceDrafts.clear ?? actual.clearDeviceDrafts)()) }
})

import { AuthProvider } from './auth-provider'
import { useAuth } from './use-auth'
import { getReadScope } from '@/lib/scoped-reads'
import { supabase } from '@/lib/supabase'
import { resolveViewer } from '@/lib/db/viewer'
import { __resetReferenceCacheForTests, withReferenceCache } from '@/lib/db/reference-cache'
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
  must_change_password: false,
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
      {auth.status === 'unauthenticated' && auth.signedOut && <span data-testid="signed-out" />}
      {auth.status === 'recovering' && (
        <button onClick={() => auth.clearRecovering()}>Clear recovering</button>
      )}
    </div>
  )
}

function AuthScopeConsumer() {
  const auth = useAuth()
  const value = auth.status === 'authenticated' ? auth.readScope?.generation ?? 'missing' : auth.status
  return <span data-testid="auth-scope-generation">{value}</span>
}

function sessionFor(userId: string): Session {
  return { user: { id: userId } } as Partial<Session> as Session
}

function viewerFor(userId: string) {
  const person = userId === 'auth-user-b'
    ? { ...personRow, id: '40000000-0000-0000-0000-000000000002', user_id: userId, full_name: 'Other Fixture' }
    : { ...personRow, user_id: userId }
  return { person, roles, isManager: false, accessRoles: ['member'], affiliated: [] }
}

async function flushAuth() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('AuthProvider', () => {
  afterEach(() => {
    deviceDrafts.clear = null
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    __resetReferenceCacheForTests()
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
    mockResolveViewer.mockResolvedValue({ person: personRow, roles, isManager: false, accessRoles: [], affiliated: [] })

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
    mockResolveViewer.mockResolvedValue({ person: null, roles: [], isManager: false, accessRoles: [], affiliated: [] })

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
    mockResolveViewer.mockResolvedValue({ person: personRow, roles, isManager: false, accessRoles: [], affiliated: [] })

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
    mockResolveViewer.mockResolvedValue({ person: personRow, roles, isManager: false, accessRoles: [], affiliated: [] })
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
    localStorage.setItem('mos.cafe.receiptExplanations.person-a.receipt-1', '{"line-1":{"conditions":["damaged_wrong"],"condition_reason":"Seal torn","serverUpdatedAt":null}}')
    localStorage.setItem('mos.cafe.receiptExplanations.person-b.receipt-2', '{}')
    localStorage.setItem('mos.tasks.groupBy', 'owner')
    localStorage.setItem('mos.cafe.receiveDrafts.v2.person-a.branch-1.kitchen.2026-10-06', '{"version":2}')
    localStorage.setItem('cafe.receive.draft.v1:person-a:branch-1:kitchen:2026-10-06', '{"version":1}')
    const deleteDatabase = vi.fn(() => {
      const request = {} as IDBOpenDBRequest
      queueMicrotask(() => request.onsuccess?.(new Event('success')))
      return request
    })
    vi.stubGlobal('indexedDB', { deleteDatabase })
    const cachedViewerLoad = vi.fn(async () => 'cached')
    await withReferenceCache('shared.auth.viewer', cachedViewerLoad, {
      identity: 'auth:auth-user-001',
      persist: true,
    })

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Sign out' }))
    })

    // A shared phone keeps no receiver's unsent reason, counts or photos for the next person;
    // other preferences stay.
    expect(Object.keys(localStorage).filter(key => key.startsWith('mos.cafe.') || key.startsWith('cafe.receive.'))).toEqual([])
    expect(deleteDatabase).toHaveBeenCalledWith('gordi-mos-offline-photos')
    expect(localStorage.getItem('mos.tasks.groupBy')).toBe('owner')
    const reloadViewer = vi.fn(async () => 'reloaded')
    await expect(withReferenceCache('shared.auth.viewer', reloadViewer, {
      identity: 'auth:auth-user-001',
      persist: true,
    })).resolves.toBe('reloaded')
    expect(reloadViewer).toHaveBeenCalledOnce()
    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
    // Marks the session as ended, so ProtectedRoute keeps no return route for the next person.
    expect(screen.getByTestId('signed-out')).toBeInTheDocument()
  })

  async function signOutWithClear(clear: () => Promise<void>) {
    deviceDrafts.clear = clear
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'auth-user-001' } } },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
    mockResolveViewer.mockResolvedValue({ person: personRow, roles, isManager: false, accessRoles: [], affiliated: [] })
    mockSignOut.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    await act(async () => {
      render(<AuthProvider><AuthConsumer /></AuthProvider>)
    })
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Sign out' }))
    })
  }

  it('sign-out still ends the session when clearing the device fails', async () => {
    await signOutWithClear(() => Promise.reject(new Error('storage denied')))

    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
  })

  it('sign-out still ends the session when clearing the device never finishes', async () => {
    await signOutWithClear(() => new Promise<void>(() => {}))

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledOnce(), { timeout: 4000 })
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'))
  })

  it('does not revive A across A → B → A or an AuthProvider remount, and ignores a late B resolution', async () => {
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

    let resolveB!: (value: ReturnType<typeof viewerFor>) => void
    mockResolveViewer.mockImplementation((userId) => {
      if (userId === 'auth-user-b') {
        return new Promise((resolve) => { resolveB = resolve })
      }
      return Promise.resolve(viewerFor(userId))
    })

    let view = render(
      <AuthProvider>
        <><AuthConsumer /><AuthScopeConsumer /></>
      </AuthProvider>,
    )
    await flushAuth()

    act(() => capturedCallback!('SIGNED_IN', sessionFor('auth-user-a')))
    await flushAuth()
    const firstA = getReadScope()
    expect(firstA).toMatchObject({
      authUserId: 'auth-user-a',
      viewerId: personRow.id,
      orgId: personRow.org_id,
    })
    expect(screen.getByTestId('auth-scope-generation').textContent).toBe(String(firstA?.generation))

    act(() => capturedCallback!('SIGNED_IN', sessionFor('auth-user-b')))
    expect(getReadScope()).toBeNull()
    expect(screen.getByTestId('status').textContent).toBe('loading')

    act(() => capturedCallback!('SIGNED_IN', sessionFor('auth-user-a')))
    await flushAuth()
    const returnedA = getReadScope()
    expect(returnedA?.authUserId).toBe('auth-user-a')
    expect(returnedA?.viewerId).toBe(firstA?.viewerId)
    expect(returnedA?.orgId).toBe(firstA?.orgId)
    expect(returnedA?.authorityKey).toBe(firstA?.authorityKey)
    expect(returnedA?.generation).toBeGreaterThan(firstA?.generation ?? 0)

    resolveB(viewerFor('auth-user-b'))
    await flushAuth()
    expect(getReadScope()?.authUserId).toBe('auth-user-a')
    expect(screen.getByTestId('name').textContent).toBe('Cahya Cafe')

    const beforeUnmount = getReadScope()
    view.unmount()
    expect(getReadScope()).toBeNull()

    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'auth-user-a' } } },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
    view = render(
      <AuthProvider>
        <AuthScopeConsumer />
      </AuthProvider>,
    )
    await flushAuth()
    expect(getReadScope()?.authUserId).toBe('auth-user-a')
    expect(getReadScope()?.generation).toBeGreaterThan(beforeUnmount?.generation ?? 0)
    view.unmount()
  })

  it('retires scope during PASSWORD_RECOVERY and sign-out, then activates a fresh scope after recovery', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'auth-user-a' } } },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
    mockResolveViewer.mockImplementation(async (userId) => viewerFor(userId))

    let capturedCallback: Parameters<typeof supabase.auth.onAuthStateChange>[0] | null = null
    mockOnAuthStateChange.mockImplementation((cb) => {
      capturedCallback = cb
      return {
        data: { subscription: { unsubscribe: vi.fn(), id: 'sub', callback: vi.fn() } },
      } as ReturnType<typeof supabase.auth.onAuthStateChange>
    })

    render(
      <AuthProvider>
        <><AuthConsumer /><AuthScopeConsumer /></>
      </AuthProvider>,
    )
    await flushAuth()
    const beforeRecovery = getReadScope()
    expect(beforeRecovery?.authUserId).toBe('auth-user-a')

    act(() => capturedCallback!('PASSWORD_RECOVERY', sessionFor('auth-user-a')))
    expect(getReadScope()).toBeNull()
    expect(screen.getByTestId('status').textContent).toBe('recovering')

    await act(async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: 'Clear recovering' }))
    })
    await flushAuth()
    const afterRecovery = getReadScope()
    expect(afterRecovery?.authUserId).toBe('auth-user-a')
    expect(afterRecovery?.generation).toBeGreaterThan(beforeRecovery?.generation ?? 0)
    await withReferenceCache('shared.auth.viewer', async () => 'cached', {
      identity: 'auth:auth-user-a',
      persist: true,
    })

    act(() => capturedCallback!('SIGNED_OUT', null))
    const reload = vi.fn(async () => 'reloaded')
    await expect(withReferenceCache('shared.auth.viewer', reload, {
      identity: 'auth:auth-user-a',
      persist: true,
    })).resolves.toBe('reloaded')
    expect(reload).toHaveBeenCalledOnce()
    expect(getReadScope()).toBeNull()
    expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
  })

  it('does not let a late initial session bootstrap republish scope after sign-out', async () => {
    let resolveBootstrap!: (value: Awaited<ReturnType<typeof supabase.auth.getSession>>) => void
    mockGetSession.mockReturnValue(new Promise((resolve) => {
      resolveBootstrap = resolve
    }) as ReturnType<typeof supabase.auth.getSession>)
    mockResolveViewer.mockImplementation(async (userId) => viewerFor(userId))

    let capturedCallback: Parameters<typeof supabase.auth.onAuthStateChange>[0] | null = null
    mockOnAuthStateChange.mockImplementation((cb) => {
      capturedCallback = cb
      return {
        data: { subscription: { unsubscribe: vi.fn(), id: 'sub', callback: vi.fn() } },
      } as ReturnType<typeof supabase.auth.onAuthStateChange>
    })

    render(
      <AuthProvider>
        <><AuthConsumer /><AuthScopeConsumer /></>
      </AuthProvider>,
    )
    await flushAuth()

    act(() => capturedCallback!('SIGNED_OUT', null))
    expect(getReadScope()).toBeNull()
    expect(screen.getByTestId('status').textContent).toBe('unauthenticated')

    await act(async () => {
      resolveBootstrap({
        data: { session: { user: { id: 'auth-user-a' } } },
        error: null,
      } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(getReadScope()).toBeNull()
    expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
    expect(mockResolveViewer).not.toHaveBeenCalled()
  })

  describe('a sample account only enters the sample org', () => {
    const token = (claims: Record<string, unknown>) =>
      `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`
    const sampleOrg = '5a000000-0000-0000-0000-000000000001'
    const realOrg = '10000000-0000-0000-0000-000000000001'

    async function signInWith(accessToken: string) {
      let capturedCallback: ((event: string, session: Session | null) => void) | undefined
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
      mockOnAuthStateChange.mockImplementation((cb) => {
        capturedCallback = cb as typeof capturedCallback
        return {
          data: { subscription: { unsubscribe: vi.fn(), id: 'sub', callback: vi.fn() } },
        } as ReturnType<typeof supabase.auth.onAuthStateChange>
      })
      mockResolveViewer.mockResolvedValue(viewerFor('auth-user-001'))
      mockSignOut.mockResolvedValue({ error: null })
      render(
        <AuthProvider>
          <><AuthConsumer /><AuthScopeConsumer /></>
        </AuthProvider>,
      )
      await flushAuth()
      await act(async () => {
        capturedCallback!('SIGNED_IN', { user: { id: 'auth-user-001' }, access_token: accessToken } as Partial<Session> as Session)
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }

    it('signs a sample account out before reading anything when its token names another org', async () => {
      await signInWith(token({ email: 'dewi@sample.gordi.test', org_id: realOrg }))

      expect(mockResolveViewer).not.toHaveBeenCalled()
      expect(mockSignOut).toHaveBeenCalledOnce()
      expect(getReadScope()).toBeNull()
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
    })

    it('matches the sample address without regard to letter case', async () => {
      await signInWith(token({ email: 'Dewi@Sample.Gordi.Test', org_id: realOrg }))

      expect(mockResolveViewer).not.toHaveBeenCalled()
      expect(mockSignOut).toHaveBeenCalledOnce()
    })

    it('lets a sample account into the sample org', async () => {
      await signInWith(token({ email: 'dewi@sample.gordi.test', org_id: sampleOrg }))

      expect(mockSignOut).not.toHaveBeenCalled()
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
    })

    it('lets real staff into the real org', async () => {
      await signInWith(token({ email: 'cahya.dev@example.test', org_id: realOrg }))

      expect(mockSignOut).not.toHaveBeenCalled()
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
    })
  })
})
