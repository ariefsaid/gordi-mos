import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('./use-auth')
import { useAuth } from './use-auth'

const mockUseAuth = vi.mocked(useAuth)

import { OrphanScreen } from './orphan-screen'

describe('OrphanScreen', () => {
  it('AC-014: orphan screen sends the person to a role, not a person', () => {
    const signOut = vi.fn()
    mockUseAuth.mockReturnValue({ status: 'orphan', signOut })

    render(<OrphanScreen />)

    expect(screen.getByText(/Your account isn't set up yet/)).toBeInTheDocument()
    // The card body and the shell footer both point at the admin role.
    expect(screen.getAllByText(/Contact your admin/i).length).toBe(2)
  })

  it('FR-016: orphan screen keeps sign-out and exposes public locale controls', () => {
    const signOut = vi.fn()
    mockUseAuth.mockReturnValue({ status: 'orphan', signOut })

    render(<OrphanScreen />)

    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'EN' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ID' })).toBeInTheDocument()
  })

  it('FR-016: orphan screen — clicking sign-out invokes signOut', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)
    mockUseAuth.mockReturnValue({ status: 'orphan', signOut })

    const user = userEvent.setup()
    render(<OrphanScreen />)

    await user.click(screen.getByRole('button', { name: /sign out/i }))
    expect(signOut).toHaveBeenCalledOnce()
  })
})
