// AC-011 — the whole entry journey, in the route shape router.tsx actually uses.
//
// The unit tests around LoginPage and ProtectedRoute each pass while the journey is broken: the
// landing is decided by RedirectIfAuthed, which neither of them mounts. This file mounts the real
// pair — /login under RedirectIfAuthed, the protected surfaces under ProtectedRoute — and drives
// the real form against an auth stub that flips the way the provider does, so the assertion is the
// URL the person ends on.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

const authStub = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  let snapshot: unknown = { status: 'unauthenticated' }
  return {
    subscribe(notify: () => void) {
      listeners.add(notify)
      return () => {
        listeners.delete(notify)
      }
    },
    read: () => snapshot,
    set(next: unknown) {
      snapshot = next
      listeners.forEach((notify) => notify())
    },
  }
})

// A store, not a plain return value: the guard has to re-render when the status flips mid-journey,
// which is the moment the defect lived in.
vi.mock('./use-auth', async () => {
  const { useSyncExternalStore } = await import('react')
  return { useAuth: () => useSyncExternalStore(authStub.subscribe, authStub.read) }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signInWithOtp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
  },
}))

import { supabase } from '@/lib/supabase'
import { LoginPage } from '@/pages/login-page'
import { RedirectIfAuthed } from './redirect-if-authed'
import { ProtectedRoute } from './protected-route'

const AUTHENTICATED = { status: 'authenticated', viewer: { person: { must_change_password: false } } }

function UrlProbe() {
  const location = useLocation()
  return <div data-testid="url">{`${location.pathname}${location.search}`}</div>
}

// The /login and protected branches of router.tsx, same guards, stub leaves.
function EntryApp({ start }: { start: string | { pathname: string; state: unknown } }) {
  return (
    <MemoryRouter initialEntries={[start]}>
      <UrlProbe />
      <Routes>
        <Route element={<RedirectIfAuthed />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/work/tasks" element={<div>Tasks</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

async function signIn() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), 'test@example.test')
  await user.type(screen.getByLabelText('Password'), 'goodpass')
  await user.click(screen.getByRole('button', { name: /sign in/i }))
}

describe('AC-011: sign-in returns you to the route you asked for', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authStub.set({ status: 'unauthenticated' })
    // Signing in flips the session, exactly as the provider's auth-state listener does.
    vi.mocked(supabase.auth.signInWithPassword).mockImplementation(async () => {
      authStub.set(AUTHENTICATED)
      return {
        data: {
          user: { id: 'u1' } as unknown as import('@supabase/supabase-js').User,
          session: {} as unknown as import('@supabase/supabase-js').Session,
        },
        error: null,
      }
    })
  })

  function url() {
    return screen.getByTestId('url').textContent
  }

  it('a signed-out deep link into /work/tasks finishes on /work/tasks', async () => {
    render(<EntryApp start="/work/tasks" />)

    // Turned away first: the deep link is parked in router state, the form is what renders.
    await waitFor(() => expect(url()).toBe('/login'))

    await signIn()

    await waitFor(() => expect(url()).toBe('/work/tasks'))
    expect(screen.getByText('Tasks')).toBeInTheDocument()
  })

  it('with no route asked for, sign-in finishes on Home', async () => {
    render(<EntryApp start="/login" />)

    await signIn()

    await waitFor(() => expect(url()).toBe('/'))
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('a remembered auth surface finishes on Home, not back on the form', async () => {
    render(<EntryApp start={{ pathname: '/login', state: { from: '/recovery' } }} />)

    await signIn()

    await waitFor(() => expect(url()).toBe('/'))
  })
})
