import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../auth/useAuth')
import { useAuth } from '../auth/useAuth'

const mockUseAuth = vi.mocked(useAuth)

import Home from './Home'

const authenticatedState = {
  status: 'authenticated' as const,
  viewer: {
    person: {
      id: '40000000-0000-0000-0000-000000000001',
      org_id: '10000000-0000-0000-0000-000000000001',
      user_id: 'auth-user-001',
      full_name: 'Cahya Cafe',
      email: 'cahya@gordi.id',
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    roles: [],
    isManager: false,
  },
  signOut: vi.fn(),
}

describe('Home', () => {
  it("FR-017: home shows viewer's full name", () => {
    mockUseAuth.mockReturnValue(authenticatedState)
    render(<Home />)
    expect(screen.getByText('Cahya Cafe')).toBeInTheDocument()
  })

  it('FR-017: home shows sign-out control', () => {
    mockUseAuth.mockReturnValue(authenticatedState)
    render(<Home />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('FR-017: clicking sign-out calls signOut', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)
    mockUseAuth.mockReturnValue({ ...authenticatedState, signOut })

    const user = userEvent.setup()
    render(<Home />)

    await user.click(screen.getByRole('button', { name: /sign out/i }))
    expect(signOut).toHaveBeenCalledOnce()
  })
})
