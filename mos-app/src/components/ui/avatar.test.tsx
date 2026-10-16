// Avatar tests — #359: a broken avatarUrl must fall back to the seeded initial,
// not render the browser's broken-image glyph on a bare box.
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Avatar } from './avatar'

describe('Avatar — image fallback (#359)', () => {
  it('renders the image when avatarUrl is given', () => {
    const { container } = render(<Avatar avatarUrl="https://example.test/x.png" placeholder="Nico" />)
    expect(container.querySelector('img')).not.toBeNull()
    expect(container.textContent).toBe('')
  })

  it('falls back to the seeded initial when the image fails to load', () => {
    const { container } = render(<Avatar avatarUrl="https://example.test/broken.png" placeholder="Nico" />)
    const img = container.querySelector('img')!
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('N')
  })

  it('renders the seeded initial when no avatarUrl is given (unchanged baseline)', () => {
    const { container } = render(<Avatar placeholder="Nico" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('N')
  })
})

describe('Avatar — two-letter initials', () => {
  it('shows first + last initials when asked, one letter for a single word', () => {
    expect(render(<Avatar placeholder="Bagas Barista" initials={2} />).container.textContent).toBe('BB')
    expect(render(<Avatar placeholder="Bagas Yudha Barista" initials={2} />).container.textContent).toBe('BB')
    expect(render(<Avatar placeholder="Nico" initials={2} />).container.textContent).toBe('N')
  })

  it('keeps the single initial by default', () => {
    expect(render(<Avatar placeholder="Bagas Barista" />).container.textContent).toBe('B')
  })
})

// Review finding on #443: the failure must be per-URL — a NEW url after a failure renders again.
it('recovers when the url prop changes after a failure', () => {
  const { rerender, container } = render(<Avatar placeholder="Nico" avatarUrl="https://x/dead.png" />)
  fireEvent.error(container.querySelector('img')!)
  expect(container.querySelector('img')).toBeNull() // fallback to initial
  rerender(<Avatar placeholder="Nico" avatarUrl="https://x/alive.png" />)
  expect(container.querySelector('img')).not.toBeNull() // new url gets its chance
})
