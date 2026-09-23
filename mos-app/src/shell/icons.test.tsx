import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import * as icons from './icons'

/**
 * The rail, bottom tab bar, drawer and breadcrumb all read glyphs from this one module, and each
 * glyph is decorative — its meaning is carried by the link label beside it. Two things therefore
 * have to hold for EVERY export, including the ones whose destination has not been ported yet:
 * it renders an <svg>, and that <svg> is hidden from assistive tech. A glyph that forgot
 * `aria-hidden` gets announced as a second, meaningless stop next to a link that already has a
 * name — the exact "Tugas12" class of defect the rail's badge labels exist to prevent.
 *
 * Enumerated from the module namespace rather than a hand-written list, so a new icon is covered
 * the moment it is exported and cannot be added without meeting the contract.
 */
const components: [string, () => React.ReactElement][] = Object.entries(icons).filter(
  ([, value]) => typeof value === 'function',
) as [string, () => React.ReactElement][]

describe('shell icons', () => {
  it('exports at least the glyphs the ported chrome renders', () => {
    // Guards the enumeration itself: if the namespace read broke, every case below would pass
    // vacuously over an empty list.
    expect(components.length).toBeGreaterThanOrEqual(20)
  })

  it.each(components.map(([name]) => name))('%s renders an svg that is hidden from assistive tech', (name) => {
    const Icon = Object.fromEntries(components)[name]
    const { container } = render(<Icon />)
    const svg = container.querySelector('svg')
    expect(svg, `${name} renders no <svg>`).not.toBeNull()
    expect(svg!.getAttribute('aria-hidden'), `${name} is not aria-hidden`).toBe('true')
  })
})
