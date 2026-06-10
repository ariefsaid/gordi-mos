import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App smoke', () => {
  it('renders the Gordi MOS heading at the /mos root route', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Gordi MOS' }),
    ).toBeInTheDocument()
  })
})
