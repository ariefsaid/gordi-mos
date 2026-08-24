// Avatar tests — #359: a broken avatarUrl must fall back to the seeded initial,
// not render the browser's broken-image glyph on a bare box.
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Avatar } from './avatar'

describe('Avatar — image fallback (#359)', () => {
  it('renders the image when avatarUrl is given', () => {
    const { container } = render(<Avatar avatarUrl="https://example.test/x.png" placeholder="Riri" />)
    expect(container.querySelector('img')).not.toBeNull()
    expect(container.textContent).toBe('')
  })

  it('falls back to the seeded initial when the image fails to load', () => {
    const { container } = render(<Avatar avatarUrl="https://example.test/broken.png" placeholder="Riri" />)
    const img = container.querySelector('img')!
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('R')
  })

  it('renders the seeded initial when no avatarUrl is given (unchanged baseline)', () => {
    const { container } = render(<Avatar placeholder="Riri" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('R')
  })
})
