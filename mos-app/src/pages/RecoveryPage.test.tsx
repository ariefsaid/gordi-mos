import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser: vi.fn(),
    },
  },
}))

// Mock react-router-dom navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

// Mock useAuth for clearRecovering tests
const mockClearRecovering = vi.fn()
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ status: 'recovering', clearRecovering: mockClearRecovering }),
}))

import RecoveryPage from './RecoveryPage'
import { supabase } from '@/lib/supabase'

const mockUpdateUser = vi.mocked(supabase.auth.updateUser)

describe('RecoveryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    mockClearRecovering.mockClear()
  })

  // FR-005: form renders a labelled new-password input
  it('FR-005: recovery set-new-password — form renders labelled new-password input', () => {
    render(<RecoveryPage />)
    expect(screen.getByLabelText('New password')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument()
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
})
