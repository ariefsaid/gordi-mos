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

// F1 (OD-K-5 redesign plan §1): <main> must be a BOUNDED scroll container so that
// `position: sticky; bottom: 0` (e.g. the Log `.kl-footer`) pins to the viewport, not
// to the bottom of an unbounded content box. The enablers are `flex-1` (grow to fill
// the grid's main cell = viewport − header) + `min-h-0` (allow shrink below content so
// overflow-auto engages). This is a SHARED-SHELL change → regression-checked across all
// pages (task A2 runs the full suite).
describe('PageFrame — <main> is a bounded scroll container (F1)', () => {
  it('<main> carries overflow-auto + the bounded-height utilities (flex-1 + min-h-0)', () => {
    const { container } = render(<PageFrame variant="data"><div>x</div></PageFrame>)
    const main = container.querySelector('main') as HTMLElement
    expect(main.className).toContain('overflow-auto')
    expect(main.className).toContain('flex-1')
    expect(main.className).toContain('min-h-0')
  })

  it('applies to the default prose variant too (every page shares the scroll region)', () => {
    const { container } = render(<PageFrame><div>x</div></PageFrame>)
    const main = container.querySelector('main') as HTMLElement
    expect(main.className).toContain('flex-1')
    expect(main.className).toContain('min-h-0')
  })
})
