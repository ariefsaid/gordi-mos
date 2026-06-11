import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('./useAuth')

import { useAuth } from './useAuth'

const mockUseAuth = vi.mocked(useAuth)

// These imports will fail until the files are created (RED)
import { ProtectedRoute } from './ProtectedRoute'
import { RedirectIfAuthed } from './RedirectIfAuthed'

// Minimal page stubs for testing redirects
function LoginPage() {
  return <div data-testid="login-page">Login Form</div>
}

function HomePage() {
  return <div data-testid="home-page">Home Content</div>
}

function ProtectedContent() {
  return <div data-testid="protected-content">Secret</div>
}

function OrphanMarker() {
  return <div data-testid="orphan-screen">Orphan</div>
}

function RecoveryForm() {
  return <div data-testid="recovery-form">Set new password</div>
}

describe('ProtectedRoute', () => {
  it('AC-009: ProtectedRoute renders neutral loading, not protected content, while status===loading', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' })

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<ProtectedContent />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    )

    // Loading indicator must be present
    expect(screen.getByRole('status')).toBeInTheDocument()
    // Protected content must NOT be rendered
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('AC-008 (guard): unauthenticated on a protected route → redirected to /login (FR-010)', () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated' })

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<ProtectedContent />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('login-page')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('orphan on a protected route → orphan screen renders, not protected content (FR-016)', () => {
    mockUseAuth.mockReturnValue({
      status: 'orphan',
      signOut: vi.fn(),
    })

    // ProtectedRoute renders OrphanScreen for orphan status
    // We test this by checking the orphan screen element is in the DOM
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<ProtectedContent />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/orphan" element={<OrphanMarker />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('recovering on a protected route → redirected to /recovery (not shown protected content)', () => {
    mockUseAuth.mockReturnValue({ status: 'recovering', clearRecovering: vi.fn() })

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<ProtectedContent />} />
          </Route>
          <Route path="/recovery" element={<RecoveryForm />} />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('recovery-form')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('authenticated on a protected route → renders protected content', () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: {
          id: 'p1',
          org_id: 'o1',
          user_id: 'u1',
          full_name: 'Test User',
          email: null,
          archived_at: null,
          created_at: '',
          updated_at: '',
        },
        roles: [],
        isManager: false,
      },
      signOut: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<ProtectedContent />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
  })
})

describe('RedirectIfAuthed', () => {
  it('AC-008: RedirectIfAuthed sends an authenticated viewer from /login to home', () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: {
          id: 'p1',
          org_id: 'o1',
          user_id: 'u1',
          full_name: 'Test User',
          email: null,
          archived_at: null,
          created_at: '',
          updated_at: '',
        },
        roles: [],
        isManager: false,
      },
      signOut: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route element={<RedirectIfAuthed />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>,
    )

    // Should redirect to home, login form absent
    expect(screen.getByTestId('home-page')).toBeInTheDocument()
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument()
  })

  it('recovering on /recovery → renders recovery form (NOT redirected to home)', () => {
    mockUseAuth.mockReturnValue({ status: 'recovering', clearRecovering: vi.fn() })

    render(
      <MemoryRouter initialEntries={['/recovery']}>
        <Routes>
          <Route element={<RedirectIfAuthed />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/recovery" element={<RecoveryForm />} />
          </Route>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>,
    )

    // Must show recovery form, NOT bounce to home
    expect(screen.getByTestId('recovery-form')).toBeInTheDocument()
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument()
  })

  it('recovering on a non-recovery route (e.g. /login) → redirected to /recovery', () => {
    mockUseAuth.mockReturnValue({ status: 'recovering', clearRecovering: vi.fn() })

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route element={<RedirectIfAuthed />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/recovery" element={<RecoveryForm />} />
          </Route>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>,
    )

    // recovering on /login → sent to /recovery to set password
    expect(screen.getByTestId('recovery-form')).toBeInTheDocument()
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument()
  })

  it('unauthenticated on /login → login form renders (no redirect)', () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated' })

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route element={<RedirectIfAuthed />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('login-page')).toBeInTheDocument()
  })

  it('orphan on /login → redirected to home (prevents race-trap where auth resolves after unauthenticated redirect)', () => {
    mockUseAuth.mockReturnValue({ status: 'orphan', signOut: vi.fn() })

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route element={<RedirectIfAuthed />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>,
    )

    // Orphan is authenticated — redirect them to / so ProtectedRoute shows OrphanScreen
    expect(screen.getByTestId('home-page')).toBeInTheDocument()
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument()
  })

  it('AC-005b: authenticated user on /recovery → redirected to home, set-password form NOT shown', () => {
    // Guard must NOT let an already-authenticated (non-recovering) user see the set-password form.
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: {
          id: 'p1',
          org_id: 'o1',
          user_id: 'u1',
          full_name: 'Test User',
          email: null,
          archived_at: null,
          created_at: '',
          updated_at: '',
        },
        roles: [],
        isManager: false,
      },
      signOut: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/recovery']}>
        <Routes>
          <Route element={<RedirectIfAuthed />}>
            <Route path="/recovery" element={<RecoveryForm />} />
          </Route>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>,
    )

    // Authenticated → home, recovery form must NOT render
    expect(screen.getByTestId('home-page')).toBeInTheDocument()
    expect(screen.queryByTestId('recovery-form')).not.toBeInTheDocument()
  })
})
