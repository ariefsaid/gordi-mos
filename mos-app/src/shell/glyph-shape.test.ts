import { describe, it, expect } from 'vitest'
import { glyphShape } from './glyph-shape'

/**
 * `glyphShape` answers ONE question: do these two `<svg>`s draw the same picture? The guard that
 * consumes it (`rail-glyph-uniqueness.test.tsx`) previously compared `svg.innerHTML`, and two
 * reviewers each slipped a pixel-identical copy of an existing rail mark past it by re-spelling
 * the markup. Every equivalence below is a re-spelling that must NOT buy uniqueness; every
 * difference below is a real change of picture that must NOT be normalised away.
 */

function svg(inner: string, attrs = 'viewBox="0 0 24 24"'): SVGElement {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`,
    'image/svg+xml',
  )
  return doc.documentElement as unknown as SVGElement
}

const same = (a: string, b: string, aAttrs?: string, bAttrs?: string) =>
  expect(glyphShape(svg(a, aAttrs))).toBe(glyphShape(svg(b, bAttrs)))
const differs = (a: string, b: string) => expect(glyphShape(svg(a))).not.toBe(glyphShape(svg(b)))

describe('the same picture, spelled differently', () => {
  it('sees through a wrapping <g> — reviewer mutation 1', () => {
    const cup = '<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M6 1v3M10 1v3M14 1v3"/>'
    same(cup, `<g>${cup}</g>`)
    same(cup, `<g><g>${cup}</g></g>`)
  })

  it('sees through trailing zeros and sub-quantum jitter — reviewer mutation 2', () => {
    same('<rect x="3" y="5" width="18" height="16" rx="2"/>', '<rect x="3.0" y="5.00" width="18" height="16" rx="2"/>')
    same('<path d="M3 9h18"/>', '<path d="M3.001 9h17.999"/>')
  })

  it('sees through expanded path commands — reviewer mutation 2', () => {
    same('<path d="M3 9h18M8 3v4"/>', '<path d="M3 9L21 9M8 3L8 7"/>')
    same('<path d="M6 9l6 6 6-6"/>', '<path d="M6 9L12 15L18 9"/>')
    // shorthand curves against their explicit forms
  })

  it('sees through the choice of element and the number of elements', () => {
    same('<path d="M6 1v3M10 1v3"/>', '<path d="M6 1v3"/><path d="M10 1v3"/>')
    same('<line x1="4" y1="17" x2="22" y2="7"/>', '<path d="M4 17L22 7"/>')
    same('<polyline points="3,11 12,4 21,11"/>', '<path d="M3 11L12 4L21 11"/>')
    same('<polygon points="3,3 21,3 21,21"/>', '<path d="M3 3L21 3L21 21Z"/>')
    same('<circle cx="12" cy="12" r="5"/>', '<path d="M7 12A5 5 0 1 0 17 12A5 5 0 1 0 7 12Z"/>')
    same('<circle cx="12" cy="12" r="5"/>', '<ellipse cx="12" cy="12" rx="5" ry="5"/>')
    same('<rect x="3" y="7" width="18" height="13"/>', '<path d="M3 7L21 7L21 20L3 20Z"/>')
  })

  it('sees through the order shapes are declared in', () => {
    same('<path d="M6 1v3"/><path d="M10 1v3"/>', '<path d="M10 1v3"/><path d="M6 1v3"/>')
  })

  it('sees through a translate folded into coordinates', () => {
    same('<path d="M6 1v3"/>', '<g transform="translate(2, 1)"><path d="M4 0v3"/></g>')
  })

  it('sees through a rescaled viewBox — the doubled-coordinate copy', () => {
    same('<path d="M6 1v3"/>', '<path d="M12 2v6"/>', 'viewBox="0 0 24 24"', 'viewBox="0 0 48 48"')
  })
})

describe('a different picture stays different', () => {
  it('separates the marks that actually differ', () => {
    differs('<path d="M6 1v3"/>', '<path d="M6 1v4"/>')
    differs('<rect x="3" y="5" width="18" height="16" rx="2"/>', '<rect x="3" y="5" width="18" height="16"/>')
    differs('<path d="M6 1v3"/>', '<path d="M6 1v3"/><path d="M10 1v3"/>')
  })

  it('separates two marks placed differently in the box', () => {
    differs('<path d="M6 1v3"/>', '<path d="M8 1v3"/>')
  })
})

describe('it refuses rather than certifies', () => {
  it('throws on an element it cannot convert to geometry', () => {
    expect(() => glyphShape(svg('<text x="1" y="1">x</text>'))).toThrow(/not a shape this guard can compare/)
  })

  it('throws on a malformed points list rather than signing it as empty', () => {
    // Odd coordinate count: a browser draws the pairs it has, so returning '' would sign a mark
    // that renders as nothing — the shape of a false collision with any other empty glyph.
    expect(() => glyphShape(svg('<polyline points="1 2 3 4 5"/>'))).toThrow(/odd coordinate count/)
  })

  it('throws on a rotated arc it cannot scale exactly, rather than guessing', () => {
    // Under a non-square viewBox the x and y scales differ, and a rotated arc's radii do not
    // follow them independently. No mark in the set is like this; the gate is what keeps a
    // future one from getting a signature the walk did not actually resolve.
    expect(() =>
      glyphShape(svg('<path d="M2 2A4 2 30 0 1 8 8"/>', 'viewBox="0 0 48 24"')),
    ).toThrow(/rotated arc under a non-square viewBox/)
  })

  it('throws on a transform it cannot fold exactly', () => {
    expect(() => glyphShape(svg('<g transform="scale(2)"><path d="M3 1v2"/></g>'))).toThrow(/only translate\(\)/)
    expect(() => glyphShape(svg('<g transform="rotate(90)"><path d="M3 1v2"/></g>'))).toThrow(/only translate\(\)/)
  })

  it('throws on an unsupported or malformed path command', () => {
    expect(() => glyphShape(svg('<path d="M3 1B2 2"/>'))).toThrow(/unsupported path command/)
    expect(() => glyphShape(svg('<path d="3 1L2 2"/>'))).toThrow(/does not open with a command/)
    expect(() => glyphShape(svg('<path d="M3 1L2"/>'))).toThrow(/expected a number/)
    expect(() => glyphShape(svg('<path d="M3 1A2 2 0 5 1 4 4"/>'))).toThrow(/expected an arc flag/)
    // The S/T smooth-curve shorthands are refused, not silently mis-read: no mark in the set uses
    // them, and reflecting a control point the walk never resolved is how a guard certifies a
    // picture it did not understand.
    expect(() => glyphShape(svg('<path d="M2 2C4 2 6 4 6 6S8 10 10 10"/>'))).toThrow(/unsupported path command/)
    expect(() => glyphShape(svg('<path d="M2 2Q4 2 6 6T10 10"/>'))).toThrow(/unsupported path command/)
  })

  it('throws when handed something that is not an <svg>, or one with no coordinate system', () => {
    expect(() => glyphShape(svg('<path d="M3 1v2"/>').querySelector('path')!)).toThrow(/expected an <svg>/)
    expect(() => glyphShape(svg('<path d="M3 1v2"/>', ''))).toThrow(/neither a usable viewBox/)
  })
})

describe('the shape of the signature', () => {
  it('is empty for an svg that draws nothing, which the rail guard treats as no glyph', () => {
    expect(glyphShape(svg(''))).toBe('')
    expect(glyphShape(svg('<title>Café</title>'))).toBe('')
  })

  it('reads arc flags as geometry, so a large-arc twin does not collide with its minor arc', () => {
    differs('<path d="M7 12A5 5 0 1 0 17 12"/>', '<path d="M7 12A5 5 0 0 0 17 12"/>')
  })

  it('a full turn of arc rotation is the same arc, and signs the same', () => {
    same('<path d="M7 12A5 5 0 1 0 17 12"/>', '<path d="M7 12A5 5 360 1 0 17 12"/>')
  })

  it('refuses a coordinate that is not finite instead of signing Infinity', () => {
    expect(() => glyphShape(svg('<path d="M1e400 0L2 2"/>'))).toThrow(/not a finite coordinate/)
  })
})
