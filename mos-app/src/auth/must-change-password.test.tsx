// #131 — the shell gate. A viewer whose password was set by an admin must replace it before
// reaching any app content, and must always be able to sign out instead (or a user who cannot
// choose a password is trapped).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('./use-auth')
vi.mock('@/lib/db/account')
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { updateUser: vi.fn() } },
}))

import { useAuth } from './use-auth'
import { ProtectedRoute } from './protected-route'
import { clearMustChangePassword } from '@/lib/db/account'
import { supabase } from '@/lib/supabase'
import type { PeopleRow } from '@/lib/database.types'

const mockUseAuth = vi.mocked(useAuth)
const mockClear = vi.mocked(clearMustChangePassword)
const mockUpdateUser = vi.mocked(supabase.auth.updateUser)

function person(mustChange: boolean): PeopleRow {
  return {
    id: 'p1',
    org_id: 'o1',
    user_id: 'u1',
    full_name: 'Test User',
    email: 'test@example.test',
    must_change_password: mustChange,
    archived_at: null,
    created_at: '',
    updated_at: '',
  }
}

function authed(mustChange: boolean, signOut = vi.fn()) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: { person: person(mustChange), roles: [], isManager: false, accessRoles: [] },
    signOut,
  })
  return signOut
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/tasks']}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/tasks" element={<div data-testid="protected-content">Secret</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('location', { ...window.location, reload: vi.fn() })
  mockUpdateUser.mockResolvedValue({ data: { user: null }, error: null } as never)
  mockClear.mockResolvedValue(undefined)
})

afterEach(() => {
  // Or the fake `location` leaks into every later suite sharing this worker.
  vi.unstubAllGlobals()
})

describe('must_change_password gate', () => {
  it('blocks app content and shows the set-password surface when the flag is true', () => {
    authed(true)
    renderApp()

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /set a new password/i })).toBeInTheDocument()
  })

  it('renders app content normally when the flag is false', () => {
    authed(false)
    renderApp()

    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /set a new password/i })).not.toBeInTheDocument()
  })

  it('keeps sign-out reachable, so a user who cannot choose a password is not trapped', async () => {
    const signOut = authed(true)
    renderApp()

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))

    expect(signOut).toHaveBeenCalled()
  })

  it('sets the password via Auth, then clears the flag — in that order', async () => {
    authed(true)
    renderApp()

    await userEvent.type(screen.getByLabelText(/new password/i), 'correct horse battery')
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'correct horse battery')
    await userEvent.click(screen.getByRole('button', { name: /save password/i }))

    await waitFor(() => expect(mockClear).toHaveBeenCalled())
    // GoTrue is the password authority (#130 installs its policy); the RPC only clears the flag.
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'correct horse battery' })
    expect(mockUpdateUser.mock.invocationCallOrder[0]).toBeLessThan(mockClear.mock.invocationCallOrder[0])
  })

  it('leaves the gate up when Auth rejects the password', async () => {
    authed(true)
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'weak_password', message: 'Password is too short.' },
    } as never)
    renderApp()

    await userEvent.type(screen.getByLabelText(/new password/i), 'short')
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'short')
    await userEvent.click(screen.getByRole('button', { name: /save password/i }))

    expect(await screen.findByText(/too short/i)).toBeInTheDocument()
    expect(mockClear).not.toHaveBeenCalled()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('fails safe: a failed flag-clear keeps the user on the gate', async () => {
    authed(true)
    mockClear.mockRejectedValue(new Error('rpc down'))
    renderApp()

    await userEvent.type(screen.getByLabelText(/new password/i), 'correct horse battery')
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'correct horse battery')
    await userEvent.click(screen.getByRole('button', { name: /save password/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(location.reload).not.toHaveBeenCalled()
  })

  it('resumes at the flag-clear on retry, because the password is already changed', async () => {
    authed(true)
    mockClear.mockRejectedValueOnce(new Error('rpc down')).mockResolvedValueOnce(undefined)
    renderApp()

    await userEvent.type(screen.getByLabelText(/new password/i), 'correct horse battery')
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'correct horse battery')
    await userEvent.click(screen.getByRole('button', { name: /save password/i }))
    await screen.findByRole('alert')

    await userEvent.click(screen.getByRole('button', { name: /save password/i }))
    await waitFor(() => expect(mockClear).toHaveBeenCalledTimes(2))

    // Retrying updateUser would be rejected by GoTrue as `same_password`, stranding the user in a
    // loop with no visible cause. Step 1 must not run again.
    expect(mockUpdateUser).toHaveBeenCalledTimes(1)
    expect(location.reload).toHaveBeenCalled()
  })
})
