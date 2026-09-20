// #855 residual E2 — the required variance note shows exactly one ring at a time: red border
// when invalid, the standard accent ring when focused, and the destructive-coloured ring (not
// a second, differently-coloured one) when both apply.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/components/kitchen/wip-item-stepper.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

function ruleBody(selector: string): string {
  const idx = css.indexOf(selector)
  expect(idx, `expected wip-item-stepper.css to style ${selector}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('KLS-NOTE-RING: one ring at a time on the required variance note', () => {
  it('invalid resting state is a destructive-coloured border', () => {
    expect(ruleBody('.kls-note {')).toMatch(/border:\s*1px solid var\(--destructive\)/)
  })
  it('invalid + focused switches the focus ring to the destructive colour, not a second accent ring', () => {
    expect(ruleBody(".kls-note[aria-invalid='true']:focus-visible")).toMatch(/outline-color:\s*var\(--destructive\)/)
  })
})
