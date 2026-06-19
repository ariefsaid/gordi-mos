import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('./use-auth')
import { useAuth } from './use-auth'

const mockUseAuth = vi.mocked(useAuth)

import { OrphanScreen } from './orphan-screen'

describe('OrphanScreen', () => {
  it('FR-016: orphan screen shows contact-Arief message', () => {
    const signOut = vi.fn()
    mockUseAuth.mockReturnValue({ status: 'orphan', signOut })

    render(<OrphanScreen />)

    // The exact message from the spec Error-Handling table
    expect(screen.getByText(/Your account isn't set up yet/)).toBeInTheDocument()
    // "contact Arief" appears in both the card body and foot line — check at least one
    const arief = screen.getAllByText(/contact Arief/i)
    expect(arief.length).toBeGreaterThanOrEqual(1)
  })

  it('FR-016: orphan screen — only interactive control is sign-out', () => {
    const signOut = vi.fn()
    mockUseAuth.mockReturnValue({ status: 'orphan', signOut })

    render(<OrphanScreen />)

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveAccessibleName(/sign out/i)
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
