// Tests for AuthShell.tsx — fix-1: reduced-motion spinner
// Design-plan §5: under prefers-reduced-motion: reduce, spinner must not use animate-spin.
// Implementation uses Tailwind motion-safe:animate-spin so the browser handles the guard;
// we test the class string in the DOM (jsdom), which is what RTL can assert.

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Spinner } from './AuthShell'

describe('Spinner — reduced-motion (design-plan §5)', () => {
  // fix-1: spinner must NOT carry bare animate-spin — it must use motion-safe: guard so
  // the browser suppresses the animation under prefers-reduced-motion: reduce.
  it('uses motion-safe:animate-spin (not bare animate-spin) so browser reduces motion', () => {
    render(<Spinner />)
    const spinner = document.querySelector('svg[aria-hidden="true"]')
    expect(spinner).not.toBeNull()
    // Must NOT have bare animate-spin (no reduced-motion guard)
    expect(spinner!.classList.contains('animate-spin')).toBe(false)
    // Must use the motion-safe variant.
    // SVG className in jsdom is an SVGAnimatedString; read .baseVal or getAttribute
    const classAttr = spinner!.getAttribute('class') ?? ''
    expect(classAttr).toContain('motion-safe:animate-spin')
  })

  it('aria-hidden is set so screen readers ignore the spinner graphic', () => {
    render(<Spinner />)
    const spinner = document.querySelector('svg')
    expect(spinner).toHaveAttribute('aria-hidden', 'true')
  })
})
