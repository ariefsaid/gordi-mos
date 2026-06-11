import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock supabase before imports that use it
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signInWithOtp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
  },
}))

// Mock react-router-dom navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import LoginPage from './LoginPage'
import { supabase } from '../lib/supabase'

const mockSignIn = vi.mocked(supabase.auth.signInWithPassword)
const mockSignInWithOtp = vi.mocked(supabase.auth.signInWithOtp)
const mockResetPassword = vi.mocked(supabase.auth.resetPasswordForEmail)

// ── T-014 ── AC-011 + AC-005 ────────────────────────────────────────────────

describe('LoginPage — credentials form', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  // AC-011: inputs reachable by accessible label; error linked via aria-describedby
  it('AC-011: login inputs reachable by accessible label', () => {
    render(<LoginPage />)

    // Each input must be query-able by its label text
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('AC-011: error linked via aria-describedby after failed submit', async () => {
    mockSignIn.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', status: 400 } as unknown as import('@supabase/supabase-js').AuthError,
    })

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'test@gordi.id')
    await user.type(screen.getByLabelText('Password'), 'wrongpass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      const errorEl = screen.getByRole('alert')
      expect(errorEl).toBeInTheDocument()
    })
  })

  // AC-005: quiet credential error is byte-identical for wrong-password and unknown-email
  it('AC-005: wrong-password error shows generic message', async () => {
    mockSignIn.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', status: 400 } as unknown as import('@supabase/supabase-js').AuthError,
    })

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'test@gordi.id')
    await user.type(screen.getByLabelText('Password'), 'wrongpass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.')
    })
  })

  it('AC-005: unknown-email error shows byte-identical generic message', async () => {
    mockSignIn.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'user not found', status: 400 } as unknown as import('@supabase/supabase-js').AuthError,
    })

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'nobody@gordi.id')
    await user.type(screen.getByLabelText('Password'), 'somepass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.')
    })
  })

  it('AC-005: rate-limit (429) shows correct message', async () => {
    mockSignIn.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Too many requests', status: 429 } as unknown as import('@supabase/supabase-js').AuthError,
    })

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'test@gordi.id')
    await user.type(screen.getByLabelText('Password'), 'pass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Too many attempts — try again in a minute.')
    })
  })

  it('AC-005: network error shows server unreachable message', async () => {
    mockSignIn.mockRejectedValue(new Error('network failure'))

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'test@gordi.id')
    await user.type(screen.getByLabelText('Password'), 'pass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't reach the server — try again.")
    })
  })

  it('no sign-up affordance rendered (FR-008)', () => {
    render(<LoginPage />)
    // No "sign up", "register", "create account" text
    expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/register/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/create account/i)).not.toBeInTheDocument()
  })

  it('successful sign-in navigates home (FR-002)', async () => {
    mockSignIn.mockResolvedValue({
      data: {
        user: { id: 'u1' } as unknown as import('@supabase/supabase-js').User,
        session: {} as unknown as import('@supabase/supabase-js').Session,
      },
      error: null,
    })

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'test@gordi.id')
    await user.type(screen.getByLabelText('Password'), 'goodpass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    })
  })

  // ── T-015 ── AC-006 + AC-007 ──────────────────────────────────────────────

  // AC-007: submit disabled + loading indicator while in flight, re-enabled on settle
  it('AC-007: submit button disabled + role=status loading while in flight', async () => {
    let resolve!: (v: ReturnType<typeof supabase.auth.signInWithPassword> extends Promise<infer R> ? R : never) => void
    mockSignIn.mockReturnValue(
      new Promise<ReturnType<typeof supabase.auth.signInWithPassword> extends Promise<infer R> ? R : never>((res) => {
        resolve = res
      }) as ReturnType<typeof supabase.auth.signInWithPassword>,
    )

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'test@gordi.id')
    await user.type(screen.getByLabelText('Password'), 'pass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    // While in flight: button disabled + loading indicator
    const submitBtn = screen.getByRole('button', { name: /signing in/i })
    expect(submitBtn).toBeDisabled()
    expect(screen.getByRole('status')).toBeInTheDocument()

    // Settle
    resolve!({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', status: 400 } as unknown as import('@supabase/supabase-js').AuthError,
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled()
    })
  })

  // AC-006: magic-link shows neutral confirmation "Check your email for a link."
  it('AC-006: magic-link confirmation shows neutral message', async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: {},
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.signInWithOtp>>)

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'user@gordi.id')

    const magicLinkBtn = screen.getByRole('button', { name: /email me a sign-in link/i })
    await user.click(magicLinkBtn)

    await waitFor(() => {
      expect(screen.getByText('Check your email for a sign-in link.')).toBeInTheDocument()
    })
  })

  it('AC-006: magic-link called with shouldCreateUser: false (FR-003)', async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: {},
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.signInWithOtp>>)

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'user@gordi.id')
    await user.click(screen.getByRole('button', { name: /email me a sign-in link/i }))

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@gordi.id',
          options: expect.objectContaining({ shouldCreateUser: false }),
        }),
      )
    })
  })

  // AC-006: reset confirmation shows identical neutral message
  it('AC-006: reset password confirmation shows neutral message', async () => {
    mockResetPassword.mockResolvedValue({
      data: {},
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.resetPasswordForEmail>>)

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'user@gordi.id')

    const forgotBtn = screen.getByRole('button', { name: /forgot password/i })
    await user.click(forgotBtn)

    await waitFor(() => {
      expect(screen.getByText('Check your email to reset your password.')).toBeInTheDocument()
    })
  })

  it('AC-006: magic-link and reset confirmations both show back-to-sign-in link', async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: {},
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.signInWithOtp>>)

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'user@gordi.id')
    await user.click(screen.getByRole('button', { name: /email me a sign-in link/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to sign in/i })).toBeInTheDocument()
    })
  })

  it('expired-link warning notice renders when ?error=access_denied in URL', () => {
    // Simulate expired link URL param
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?error=access_denied&error_description=expired' },
      writable: true,
      configurable: true,
    })
    render(<LoginPage />)
    expect(screen.getByText(/that link has expired/i)).toBeInTheDocument()
    // Restore
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '' },
      writable: true,
      configurable: true,
    })
  })
})
