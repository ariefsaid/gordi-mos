// The required variance note shows exactly one ring at a time: red border when invalid, the
// standard accent ring when focused, and the destructive-coloured ring (not a second,
// differently-coloured one) when both apply.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/components/kitchen/wip-item-stepper.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const captureCss = readFileSync(resolve(process.cwd(), 'src/components/kitchen/cafe-capture-controls.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const layoutCss = readFileSync(resolve(process.cwd(), 'src/components/kitchen/cafe-capture-layout.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const stepperSource = readFileSync(resolve(process.cwd(), 'src/components/kitchen/wip-item-stepper.tsx'), 'utf8')

function ruleBody(selector: string): string {
  const idx = css.indexOf(selector)
  expect(idx, `expected wip-item-stepper.css to style ${selector}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('WIP quantity input treatment stays owned by the stepper', () => {
  it('keeps the shared Count/Waste chrome off the Production and Transfer input', () => {
    expect(captureCss).toMatch(/\.cafe-capture-content \.cafe-capture-quantity-field:not\(\.kls-qty\)/)
    expect(ruleBody('.kls-qty {')).toMatch(/border:\s*1px solid var\(--input\)/)
    expect(ruleBody('.kls-qty {')).toMatch(/padding:\s*0 4px/)
    expect(ruleBody('.kls-qty {')).toMatch(/font-weight:\s*600/)
  })
})

describe('Café static capture units', () => {
  it('uses the shared quiet unit label recipe across capture rows', () => {
    expect(layoutCss).toMatch(/\.cafe-count__unit,\s*\.cafe-capture-unit-label,\s*\.kls-unit\s*\{[^}]*font-size:\s*var\(--font-size-label\)[^}]*color:\s*var\(--muted-foreground\)/)
    expect(stepperSource).toMatch(/kls-unit cafe-capture-unit/)
    expect(layoutCss).toMatch(/\.cafe-capture-unit-label/)
  })

  it('keeps the multi-unit label close to the quantity input', () => {
    const desktopRules = css.slice(css.indexOf('@media (min-width: 768px)'))
    expect(desktopRules).toMatch(/\.kls-dense \.kls-unit-change\s*\{[^}]*padding-inline:\s*2px/)
  })
})

describe('KLS-NOTE-RING: one ring at a time on the required variance note', () => {
  it('invalid resting state is a destructive-coloured border', () => {
    expect(ruleBody('.kls-note {')).toMatch(/border:\s*1px solid var\(--destructive\)/)
  })
  it('invalid + focused switches the focus ring to the destructive colour, not a second accent ring', () => {
    expect(ruleBody(".kls-note[aria-invalid='true']:focus-visible")).toMatch(/outline-color:\s*var\(--destructive\)/)
  })
})
