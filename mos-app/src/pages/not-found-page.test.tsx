import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NotFoundPage } from './not-found-page'

// AC-009: Unknown route shows "Page not found." + link to My Week
describe('AC-009: Not-found page', () => {
  it('shows "Page not found." text', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Page not found.')).toBeInTheDocument()
  })

  it('shows a "Back to My Week" link pointing to /', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: /My Week|Back to My Week/i })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('href')).toBe('/')
  })
})
