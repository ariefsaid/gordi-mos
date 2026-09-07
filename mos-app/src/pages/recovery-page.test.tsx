import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
  },
}))

// Mock react-router-dom navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useLocation: () => ({ pathname: '/recovery', search: '', hash: '', state: null, key: 'test' }),
    useNavigate: () => mockNavigate,
  }
})

// Mock useAuth for recovery-state tests
const mockClearRecovering = vi.fn()
let mockAuthState: unknown = { status: 'recovering', clearRecovering: mockClearRecovering }
vi.mock('../auth/use-auth', () => ({
  useAuth: () => mockAuthState,
}))

import { RecoveryPage } from './recovery-page'
import { supabase } from '@/lib/supabase'

const mockUpdateUser = vi.mocked(supabase.auth.updateUser)
const mockResetPassword = vi.mocked(supabase.auth.resetPasswordForEmail)

describe('RecoveryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    mockClearRecovering.mockClear()
    mockAuthState = { status: 'recovering', clearRecovering: mockClearRecovering }
  })

  // FR-005: form renders a labelled new-password input
  it('FR-005: recovery set-new-password — form renders labelled new-password input', () => {
    render(<RecoveryPage />)
    expect(screen.getByLabelText('New password')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument()
  })

  it('FR-005: recovery link exchange — form waits until PASSWORD_RECOVERY is active', () => {
    mockAuthState = { status: 'loading' }
    render(<RecoveryPage />)
    expect(screen.getByRole('status', { name: /verifying recovery link/i })).toBeInTheDocument()
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  })

  it('FR-005: direct recovery route without a recovery session shows expired notice', () => {
    mockAuthState = { status: 'unauthenticated' }
    render(<RecoveryPage />)
    expect(screen.getByText(/that link has expired/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  })

  it('FR-005: recovery set-new-password — on submit calls updateUser with new password', async () => {
    mockUpdateUser.mockResolvedValue({
      data: { user: {} as unknown as import('@supabase/supabase-js').User },
      error: null,
    })

    const user = userEvent.setup()
    render(<RecoveryPage />)

    await user.type(screen.getByLabelText('New password'), 'newpassword123')
    await user.type(screen.getByLabelText('Confirm password'), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /save password/i }))

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword123' })
    })
  })

  it('FR-005: recovery set-new-password — on success navigates home', async () => {
    mockUpdateUser.mockResolvedValue({
      data: { user: {} as unknown as import('@supabase/supabase-js').User },
      error: null,
    })

    const user = userEvent.setup()
    render(<RecoveryPage />)

    await user.type(screen.getByLabelText('New password'), 'newpassword123')
    await user.type(screen.getByLabelText('Confirm password'), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /save password/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    })
  })

  it('FR-005: recovery set-new-password — password mismatch shows field error', async () => {
    const user = userEvent.setup()
    render(<RecoveryPage />)

    await user.type(screen.getByLabelText('New password'), 'abc12345')
    await user.type(screen.getByLabelText('Confirm password'), 'different')
    await user.click(screen.getByRole('button', { name: /save password/i }))

    await waitFor(() => {
      expect(screen.getByText("Passwords don't match.")).toBeInTheDocument()
    })
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('FR-005: recovery set-new-password — expired/invalid link shows expired notice', async () => {
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid claim', status: 422 } as unknown as import('@supabase/supabase-js').AuthError,
    } as unknown as Awaited<ReturnType<typeof supabase.auth.updateUser>>)

    const user = userEvent.setup()
    render(<RecoveryPage />)

    await user.type(screen.getByLabelText('New password'), 'newpass123')
    await user.type(screen.getByLabelText('Confirm password'), 'newpass123')
    await user.click(screen.getByRole('button', { name: /save password/i }))

    await waitFor(() => {
      expect(screen.getByText(/that link has expired/i)).toBeInTheDocument()
    })
  })

  it('FR-005: weak password error stays on the form instead of showing expired-link notice', async () => {
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: {
        code: 'weak_password',
        message: 'Password should contain lower, upper, and digits.',
        status: 422,
      } as unknown as import('@supabase/supabase-js').AuthError,
    } as unknown as Awaited<ReturnType<typeof supabase.auth.updateUser>>)

    const user = userEvent.setup()
    render(<RecoveryPage />)

    await user.type(screen.getByLabelText('New password'), 'lowercase123')
    await user.type(screen.getByLabelText('Confirm password'), 'lowercase123')
    await user.click(screen.getByRole('button', { name: /save password/i }))

    await waitFor(() => {
      expect(screen.getByText(/password should contain/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/that link has expired/i)).not.toBeInTheDocument()
  })

  it('FR-005: recovery success — calls clearRecovering before navigating home', async () => {
    mockUpdateUser.mockResolvedValue({
      data: { user: {} as unknown as import('@supabase/supabase-js').User },
      error: null,
    })

    const user = userEvent.setup()
    render(<RecoveryPage />)

    await user.type(screen.getByLabelText('New password'), 'newpassword123')
    await user.type(screen.getByLabelText('Confirm password'), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /save password/i }))

    await waitFor(() => {
      expect(mockClearRecovering).toHaveBeenCalledOnce()
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    })
    // clearRecovering must be called before or alongside navigate
    const clearOrder = mockClearRecovering.mock.invocationCallOrder[0]
    const navOrder = mockNavigate.mock.invocationCallOrder[0]
    expect(clearOrder).toBeLessThanOrEqual(navOrder)
  })

  it('FR-005: loading state — save button disabled + loading indicator while in flight', async () => {
    let resolve!: (v: ReturnType<typeof supabase.auth.updateUser> extends Promise<infer R> ? R : never) => void
    mockUpdateUser.mockReturnValue(
      new Promise<ReturnType<typeof supabase.auth.updateUser> extends Promise<infer R> ? R : never>((res) => { resolve = res }) as ReturnType<typeof supabase.auth.updateUser>,
    )

    const user = userEvent.setup()
    render(<RecoveryPage />)

    await user.type(screen.getByLabelText('New password'), 'newpass123')
    await user.type(screen.getByLabelText('Confirm password'), 'newpass123')
    await user.click(screen.getByRole('button', { name: /save password/i }))

    // While in flight
    const saveBtn = screen.getByRole('button', { name: /saving/i })
    expect(saveBtn).toBeDisabled()
    expect(screen.getByRole('status')).toBeInTheDocument()

    resolve!({ data: { user: null }, error: null } as unknown as Awaited<ReturnType<typeof supabase.auth.updateUser>>)
  })

  // ── #799 ── AC-016: the expired dead end offers a way forward ───────────────────────────────

  it('AC-016: the expired card offers Request a new link beside Back to sign in', () => {
    mockAuthState = { status: 'unauthenticated' }
    render(<RecoveryPage />)

    expect(screen.getByRole('button', { name: 'Request a new link' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toBeInTheDocument()
  })

  it('AC-016: requesting a new link sends it and shows the on-its-way result', async () => {
    mockAuthState = { status: 'unauthenticated' }
    mockResetPassword.mockResolvedValue({
      data: {},
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.resetPasswordForEmail>>)

    const user = userEvent.setup()
    render(<RecoveryPage />)

    await user.type(screen.getByLabelText('Email'), 'user@example.test')
    await user.click(screen.getByRole('button', { name: 'Request a new link' }))

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith('user@example.test', {
        redirectTo: `${window.location.origin}/mos/recovery`,
      })
    })
    expect(
      await screen.findByText('If an account exists for that address, a reset link is on its way.'),
    ).toBeInTheDocument()
    // The result state replaces the card body — the form is gone, the other way out stays.
    expect(screen.queryByRole('button', { name: 'Request a new link' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toBeInTheDocument()
  })

  it('AC-016: a refused re-send is indistinguishable from a successful one', async () => {
    mockAuthState = { status: 'unauthenticated' }
    mockResetPassword.mockResolvedValue({
      data: null,
      error: { message: 'rate limit', status: 429 },
    } as unknown as Awaited<ReturnType<typeof supabase.auth.resetPasswordForEmail>>)

    const user = userEvent.setup()
    render(<RecoveryPage />)

    await user.type(screen.getByLabelText('Email'), 'user@example.test')
    await user.click(screen.getByRole('button', { name: 'Request a new link' }))

    expect(
      await screen.findByText('If an account exists for that address, a reset link is on its way.'),
    ).toBeInTheDocument()
  })
})
