import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PageFrame } from './page-frame'

describe('PageFrame variant', () => {
  it('AC-121: variant="prose" (default) caps content at 1080px', () => {
    const { container } = render(<PageFrame><div>x</div></PageFrame>)
    const inner = container.querySelector('main > div') as HTMLElement
    expect(inner.style.maxWidth).toBe('1080px')
  })
  it('AC-121: variant="data" removes the 1080px cap (full-bleed)', () => {
    const { container } = render(<PageFrame variant="data"><div>x</div></PageFrame>)
    const inner = container.querySelector('main > div') as HTMLElement
    expect(inner.style.maxWidth).toBe('none')
  })
})
