// #131 — the shell gate. A viewer whose password was set by an admin must replace it before
// reaching any app content, and must always be able to sign out instead (or a user who cannot
// choose a password is trapped).
//
// The gate is only lowered by the password actually changing: the
// clear_must_change_password_on_pw_change trigger on auth.users runs inside GoTrue's own write.
// That contract is owned by supabase/tests/88_must_change_password.sql (AC-131c/c2/g/h/i) — there
// is deliberately nothing here that clears the flag, because the app cannot.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('./use-auth')
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { updateUser: vi.fn() } },
}))

import { useAuth } from './use-auth'
import { ProtectedRoute } from './protected-route'
import { supabase } from '@/lib/supabase'
import type { PeopleRow } from '@/lib/database.types'

const mockUseAuth = vi.mocked(useAuth)
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

  it('sets the password through Auth, then reloads to pick up the lowered flag', async () => {
    authed(true)
    renderApp()

    await userEvent.type(screen.getByLabelText(/new password/i), 'correct horse battery')
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'correct horse battery')
    await userEvent.click(screen.getByRole('button', { name: /save password/i }))

    // GoTrue is the password authority; the DB trigger lowers the flag inside that same write.
    await waitFor(() => expect(location.reload).toHaveBeenCalled())
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'correct horse battery' })
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
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(location.reload).not.toHaveBeenCalled()
  })
})
