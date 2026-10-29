import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RedirectIfAuthed } from './redirect-if-authed'
import { RecoveryPage } from '@/pages/recovery-page'

// Mock supabase and resolveViewer before imports that use them
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    schema: vi.fn(),
    auth: {
      initialize: vi.fn(),
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
          <span data-testid="must-change-password">{String(auth.viewer.person.must_change_password)}</span>
          <button onClick={() => auth.signOut()}>Sign out</button>
        </>
      )}
      {auth.status === 'orphan' && (
        <button onClick={() => auth.signOut()}>Sign out orphan</button>
      )}
      {auth.status === 'error' && (
        <>
          <button onClick={() => void auth.retry()}>Retry auth</button>
          <button onClick={() => void auth.signOut()}>Sign out error</button>
        </>
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

function ViewerIdentityConsumer({ capture }: { capture: (viewer: { canReadCafePushes?: boolean }) => void }) {
  const auth = useAuth()
  if (auth.status === 'authenticated') capture(auth.viewer)
  return <span>{auth.status}</span>
}

function sessionFor(userId: string): Session {
  return { user: { id: userId } } as Partial<Session> as Session
}

function viewerFor(userId: string) {
  const person = userId === 'auth-user-b'
    ? { ...personRow, id: '40000000-0000-0000-0000-000000000002', user_id: userId, full_name: 'Other Fixture' }
    : { ...personRow, user_id: userId }
  return { person, roles, isManager: false, accessRoles: ['member'], affiliated: [], canReadCafePushes: false }
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
    mockResolveViewer.mockReset()
    vi.mocked(supabase.auth.initialize).mockResolvedValue({ error: null })
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
    mockResolveViewer.mockResolvedValue({ person: personRow, roles, isManager: false, accessRoles: [], affiliated: [], canReadCafePushes: false })

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
    mockResolveViewer.mockResolvedValue({ person: null, roles: [], isManager: false, accessRoles: [], affiliated: [], canReadCafePushes: false })

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
    mockResolveViewer.mockResolvedValue({ person: personRow, roles, isManager: false, accessRoles: [], affiliated: [], canReadCafePushes: false })

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
    mockResolveViewer.mockResolvedValue({ person: personRow, roles, isManager: false, accessRoles: [], affiliated: [], canReadCafePushes: false })
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
    mockResolveViewer.mockResolvedValue({ person: personRow, roles, isManager: false, accessRoles: [], affiliated: [], canReadCafePushes: false })
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

  it('reuses the viewer object for repeated sign-in with unchanged identity and authority', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
    let capturedCallback: Parameters<typeof supabase.auth.onAuthStateChange>[0] | null = null
    mockOnAuthStateChange.mockImplementation((callback) => {
      capturedCallback = callback
      return { data: { subscription: { unsubscribe: vi.fn(), id: 'sub', callback: vi.fn() } } } as ReturnType<typeof supabase.auth.onAuthStateChange>
    })
    mockResolveViewer
      .mockResolvedValueOnce(viewerFor('auth-user-a'))
      .mockResolvedValueOnce(viewerFor('auth-user-a'))
      .mockResolvedValueOnce({ ...viewerFor('auth-user-a'), accessRoles: ['ops_lead'] })
    const observed: object[] = []

    render(<AuthProvider><ViewerIdentityConsumer capture={viewer => observed.push(viewer)} /></AuthProvider>)
    await flushAuth()

    act(() => capturedCallback!('SIGNED_IN', sessionFor('auth-user-a')))
    await flushAuth()
    const firstViewer = observed.at(-1)
    expect(firstViewer).toBeDefined()

    act(() => capturedCallback!('SIGNED_IN', sessionFor('auth-user-a')))
    await flushAuth()
    expect(observed.at(-1)).toBe(firstViewer)

    act(() => capturedCallback!('SIGNED_IN', sessionFor('auth-user-a')))
    await flushAuth()
    expect(observed.at(-1)).not.toBe(firstViewer)
  })

  it('replaces the viewer when the server-resolved Café Pushes read fact changes', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
    let capturedCallback: Parameters<typeof supabase.auth.onAuthStateChange>[0] | null = null
    mockOnAuthStateChange.mockImplementation((callback) => {
      capturedCallback = callback
      return { data: { subscription: { unsubscribe: vi.fn(), id: 'sub', callback: vi.fn() } } } as ReturnType<typeof supabase.auth.onAuthStateChange>
    })
    mockResolveViewer
      .mockResolvedValueOnce({ ...viewerFor('auth-user-a'), canReadCafePushes: false })
      .mockResolvedValueOnce({ ...viewerFor('auth-user-a'), canReadCafePushes: true })
    const observed: Array<{ canReadCafePushes?: boolean }> = []

    render(<AuthProvider><ViewerIdentityConsumer capture={viewer => observed.push(viewer)} /></AuthProvider>)
    await flushAuth()
    act(() => capturedCallback!('SIGNED_IN', sessionFor('auth-user-a')))
    await flushAuth()
    const firstViewer = observed.at(-1)
    expect(firstViewer?.canReadCafePushes).toBe(false)

    act(() => capturedCallback!('SIGNED_IN', sessionFor('auth-user-a')))
    await flushAuth()

    expect(observed.at(-1)?.canReadCafePushes).toBe(true)
    expect(observed.at(-1)).not.toBe(firstViewer)
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

  it('shows a fresh-link form after an invalid callback finishes processing', async () => {
    let finish!: (value: Awaited<ReturnType<typeof supabase.auth.getSession>>) => void
    mockGetSession.mockReturnValue(new Promise(resolve => { finish = resolve }))
    render(<MemoryRouter initialEntries={['/recovery#error=access_denied']}><AuthProvider><Routes>
      <Route element={<RedirectIfAuthed />}><Route path="/recovery" element={<RecoveryPage />} /></Route>
    </Routes></AuthProvider></MemoryRouter>)
    expect(screen.getByRole('status', { name: /verifying recovery link/i })).toBeInTheDocument()
    await act(async () => { finish({ data: { session: null }, error: null }) })
    expect(screen.getByRole('button', { name: 'Request a new link' })).toBeInTheDocument()
  })

  it('shows the fresh-link form for a failed callback even if an old session exists', async () => {
    window.history.replaceState({}, '', '/recovery#error=access_denied')
    vi.mocked(supabase.auth.initialize).mockResolvedValue({ error: { name: 'AuthError', message: 'expired' } } as Awaited<ReturnType<typeof supabase.auth.initialize>>)
    mockGetSession.mockResolvedValue({ data: { session: sessionFor('auth-user-001') }, error: null })
    mockResolveViewer.mockResolvedValue(viewerFor('auth-user-001'))
    try {
      await act(async () => { render(<MemoryRouter initialEntries={['/recovery#error=access_denied']}><AuthProvider><Routes>
        <Route element={<RedirectIfAuthed />}><Route path="/recovery" element={<RecoveryPage />} /></Route>
        <Route path="/" element={<div>Home</div>} />
      </Routes></AuthProvider></MemoryRouter>) })
      expect(screen.getByRole('button', { name: 'Request a new link' })).toBeInTheDocument()
    } finally {
      window.history.replaceState({}, '', '/')
    }
  })

  it('uses a newer sign-in when it supersedes a pending recovery callback', async () => {
    window.history.replaceState({}, '', '/recovery#access_token=token&type=recovery')
    let callback!: Parameters<typeof supabase.auth.onAuthStateChange>[0]
    vi.mocked(supabase.auth.initialize).mockReturnValue(new Promise(() => {}))
    mockResolveViewer.mockResolvedValue(viewerFor('auth-user-b'))
    mockOnAuthStateChange.mockImplementation(cb => {
      callback = cb
      return { data: { subscription: { unsubscribe: vi.fn(), id: 'sub', callback: vi.fn() } } } as ReturnType<typeof supabase.auth.onAuthStateChange>
    })
    try {
      render(<AuthProvider><AuthConsumer /></AuthProvider>)
      await act(async () => { callback('SIGNED_IN', sessionFor('auth-user-b')) })
      expect(screen.getByTestId('name').textContent).toBe('Other Fixture')
      await act(async () => { callback('PASSWORD_RECOVERY', sessionFor('auth-user-001')) })
      expect(screen.getByTestId('name').textContent).toBe('Other Fixture')
    } finally {
      window.history.replaceState({}, '', '/')
    }
  })

  it('does not revive a recovery callback after sign-out supersedes it', async () => {
    window.history.replaceState({}, '', '/recovery#access_token=token&type=recovery')
    let callback!: Parameters<typeof supabase.auth.onAuthStateChange>[0]
    vi.mocked(supabase.auth.initialize).mockReturnValue(new Promise(() => {}))
    mockOnAuthStateChange.mockImplementation(cb => {
      callback = cb
      return { data: { subscription: { unsubscribe: vi.fn(), id: 'sub', callback: vi.fn() } } } as ReturnType<typeof supabase.auth.onAuthStateChange>
    })
    try {
      render(<AuthProvider><AuthConsumer /></AuthProvider>)
      await act(async () => { callback('SIGNED_OUT', null) })
      await act(async () => { callback('PASSWORD_RECOVERY', sessionFor('auth-user-001')) })
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
    } finally {
      window.history.replaceState({}, '', '/')
    }
  })

  it('does not return to recovery if its delayed callback event follows a completed reset', async () => {
    window.history.replaceState({}, '', '/recovery#access_token=token&type=recovery')
    let callback!: Parameters<typeof supabase.auth.onAuthStateChange>[0]
    mockGetSession.mockResolvedValue({ data: { session: sessionFor('auth-user-001') }, error: null })
    mockResolveViewer.mockResolvedValue(viewerFor('auth-user-001'))
    mockOnAuthStateChange.mockImplementation(cb => {
      callback = cb
      return { data: { subscription: { unsubscribe: vi.fn(), id: 'sub', callback: vi.fn() } } } as ReturnType<typeof supabase.auth.onAuthStateChange>
    })
    try {
      await act(async () => { render(<AuthProvider><AuthConsumer /></AuthProvider>) })
      await act(async () => { screen.getByRole('button', { name: 'Clear recovering' }).click() })
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
      await act(async () => { callback('PASSWORD_RECOVERY', sessionFor('auth-user-001')) })
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
    } finally {
      window.history.replaceState({}, '', '/')
    }
  })

  it('keeps a valid recovery callback on recovery while Supabase delays its event', async () => {
    window.history.replaceState({}, '', '/recovery#access_token=token&type=recovery')
    let callback!: Parameters<typeof supabase.auth.onAuthStateChange>[0]
    mockOnAuthStateChange.mockImplementation(cb => {
      callback = cb
      return { data: { subscription: { unsubscribe: vi.fn(), id: 'sub', callback: vi.fn() } } } as ReturnType<typeof supabase.auth.onAuthStateChange>
    })
    mockGetSession.mockResolvedValue({ data: { session: sessionFor('auth-user-001') }, error: null })
    mockResolveViewer.mockResolvedValue(viewerFor('auth-user-001'))
    try {
      await act(async () => {
        render(<MemoryRouter initialEntries={['/recovery#access_token=token&type=recovery']}><AuthProvider><Routes>
          <Route element={<RedirectIfAuthed />}><Route path="/recovery" element={<RecoveryPage />} /></Route>
          <Route path="/" element={<div>Home</div>} />
        </Routes></AuthProvider></MemoryRouter>)
      })
      expect(screen.getByLabelText('New password')).toBeInTheDocument()
      await act(async () => { callback('PASSWORD_RECOVERY', sessionFor('auth-user-001')) })
      expect(screen.getByLabelText('New password')).toBeInTheDocument()
    } finally {
      window.history.replaceState({}, '', '/')
    }
  })

  it.each([
    ['name', { full_name: 'New name' }, 'name', 'New name'],
    ['password requirement', { must_change_password: true }, 'must-change-password', 'true'],
  ] as const)('refreshes %s through the real viewer resolver within its cache window', async (_label, change, field, expected) => {
    let person = { ...personRow }
    const people = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn(async () => ({ data: person, error: null })) }
    const rows = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) }
    vi.mocked(supabase.from).mockImplementation((table) => (table === 'people' ? people : rows) as unknown as ReturnType<typeof supabase.from>)
    vi.mocked(supabase.schema).mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: false, error: null }) } as unknown as ReturnType<typeof supabase.schema>)
    const realViewer = await vi.importActual<typeof import('@/lib/db/viewer')>('@/lib/db/viewer')
    mockResolveViewer.mockImplementation(realViewer.resolveViewer)
    mockGetSession.mockResolvedValue({ data: { session: sessionFor('auth-user-001') }, error: null })
    let callback!: Parameters<typeof supabase.auth.onAuthStateChange>[0]
    mockOnAuthStateChange.mockImplementation(cb => {
      callback = cb
      return { data: { subscription: { unsubscribe: vi.fn(), id: 'sub', callback: vi.fn() } } } as ReturnType<typeof supabase.auth.onAuthStateChange>
    })
    await act(async () => { render(<AuthProvider><AuthConsumer /></AuthProvider>) })
    person = { ...person, ...change }
    await act(async () => { callback('TOKEN_REFRESHED', sessionFor('auth-user-001')) })
    await waitFor(() => expect(screen.getByTestId(field).textContent).toBe(expected))
  })

  describe('viewer resolution recovery and account refresh (#1943, #1959)', () => {
    it('viewer resolution failure → status error with retry and signOut, retry finishes loading current session', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'auth-user-001' }, access_token: 'valid-token' } },
        error: null,
      } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
      mockResolveViewer.mockRejectedValueOnce(new Error('Network error'))

      await act(async () => {
        render(
          <AuthProvider>
            <AuthConsumer />
          </AuthProvider>,
        )
      })

      expect(screen.getByTestId('status').textContent).toBe('error')

      mockResolveViewer.mockResolvedValueOnce({
        person: personRow,
        roles,
        isManager: false,
        accessRoles: [],
        affiliated: [],
        canReadCafePushes: false,
      })

      await act(async () => {
        screen.getByRole('button', { name: 'Retry auth' }).click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('authenticated')
        expect(screen.getByTestId('name').textContent).toBe('Cahya Cafe')
      })
    })

    it('sign out from error state transitions to unauthenticated', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'auth-user-001' } } },
        error: null,
      } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
      mockResolveViewer.mockRejectedValueOnce(new Error('Database unavailable'))
      mockSignOut.mockResolvedValue({ error: null })

      await act(async () => {
        render(
          <AuthProvider>
            <AuthConsumer />
          </AuthProvider>,
        )
      })

      expect(screen.getByTestId('status').textContent).toBe('error')

      await act(async () => {
        screen.getByRole('button', { name: 'Sign out error' }).click()
      })

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledOnce()
        expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
      })
    })

    it('stale rejection or completion after sign-out does not overwrite unauthenticated state', async () => {
      let rejectViewer!: (err: Error) => void
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'auth-user-001' } } },
        error: null,
      } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
      mockResolveViewer.mockReturnValue(
        new Promise((_, reject) => {
          rejectViewer = reject
        }),
      )
      mockSignOut.mockResolvedValue({ error: null })

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

      // While resolveViewer is pending, sign out
      await act(async () => {
        capturedCallback!('SIGNED_OUT', null)
      })

      expect(screen.getByTestId('status').textContent).toBe('unauthenticated')

      // Now reject the stale viewer fetch
      await act(async () => {
        rejectViewer(new Error('Late network error'))
      })

      // Must remain unauthenticated, NOT error
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
      expect(getReadScope()).toBeNull()
    })

    it('stale rejection while PASSWORD_RECOVERY is active does not overwrite recovering state', async () => {
      let rejectViewer!: (err: Error) => void
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'auth-user-001' } } },
        error: null,
      } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
      mockResolveViewer.mockReturnValue(
        new Promise((_, reject) => {
          rejectViewer = reject
        }),
      )

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

      // Fire PASSWORD_RECOVERY event
      await act(async () => {
        capturedCallback!('PASSWORD_RECOVERY', {
          user: { id: 'auth-user-001' },
        } as Partial<Session> as Session)
      })

      expect(screen.getByTestId('status').textContent).toBe('recovering')

      // Stale viewer rejection
      await act(async () => {
        rejectViewer(new Error('Late network failure'))
      })

      // Must remain recovering
      expect(screen.getByTestId('status').textContent).toBe('recovering')
    })

    it('Issue 1959: refreshing a session after person name changes displays updated name even when roles stay same', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'auth-user-001' } } },
        error: null,
      } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
      mockResolveViewer
        .mockResolvedValueOnce({ person: personRow, roles, isManager: false, accessRoles: [], affiliated: [], canReadCafePushes: false })
        .mockResolvedValueOnce({
          person: { ...personRow, full_name: 'Cahya Updated Name' },
          roles,
          isManager: false,
          accessRoles: [],
          affiliated: [],
          canReadCafePushes: false,
        })

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

      expect(screen.getByTestId('status').textContent).toBe('authenticated')
      expect(screen.getByTestId('name').textContent).toBe('Cahya Cafe')

      // Trigger session refresh (e.g. token refresh / SIGNED_IN event with same user)
      await act(async () => {
        capturedCallback!('TOKEN_REFRESHED', {
          user: { id: 'auth-user-001' },
        } as Partial<Session> as Session)
      })

      await waitFor(() => {
        expect(screen.getByTestId('name').textContent).toBe('Cahya Updated Name')
      })
    })

    it('Issue 1959: refreshing a session after password-change requirement changes updates requirement even when roles stay same', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'auth-user-001' } } },
        error: null,
      } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
      mockResolveViewer
        .mockResolvedValueOnce({
          person: { ...personRow, must_change_password: false },
          roles,
          isManager: false,
          accessRoles: [],
          affiliated: [],
          canReadCafePushes: false,
        })
        .mockResolvedValueOnce({
          person: { ...personRow, must_change_password: true },
          roles,
          isManager: false,
          accessRoles: [],
          affiliated: [],
          canReadCafePushes: false,
        })

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

      expect(screen.getByTestId('must-change-password').textContent).toBe('false')

      // Refresh session
      await act(async () => {
        capturedCallback!('TOKEN_REFRESHED', {
          user: { id: 'auth-user-001' },
        } as Partial<Session> as Session)
      })

      await waitFor(() => {
        expect(screen.getByTestId('must-change-password').textContent).toBe('true')
      })
    })
  })
})
