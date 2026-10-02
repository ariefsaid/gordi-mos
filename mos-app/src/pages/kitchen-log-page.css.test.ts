// Café capture presentation contracts: the sticky band, first-screen filter set, list clearance,
// and the verbatim A3/A4 design amendments. These pin the layout fence, not log behavior.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/pages/kitchen-log-page.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

function ruleBodyAt(idx: number): string {
  expect(idx, 'expected kitchen-log-page.css to style the phone .kl-footer override').toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('KL-FOOTER-NAV: the phone sticky footer clears the shell bottom-tab bar', () => {
  // `.kl-footer {` is declared twice: the base rule, then its phone (max-width: 767.98px)
  // override further down the file — the LAST occurrence is that phone override.
  const phoneFooterIdx = css.lastIndexOf('.kl-footer {')

  it('the phone .kl-footer offsets by the shell bottom-nav token (--tabbar-h), not a magic number', () => {
    const body = ruleBodyAt(phoneFooterIdx)
    expect(body).toMatch(/bottom:\s*calc\(-1 \* \(16px \+ var\(--tabbar-h,\s*60px\)\)\)/)
    expect(body).toMatch(/margin-bottom:\s*calc\(-1 \* \(16px \+ var\(--tabbar-h,\s*60px\)\)\)/)
  })

  it('uses one vertical action stack and reserves enough list clearance for the phone band', () => {
    const baseFooter = ruleBodyAt(css.indexOf('.kl-footer {'))
    expect(baseFooter).toMatch(/flex-direction:\s*column/)
    expect(baseFooter).toMatch(/align-items:\s*stretch/)
    expect(css).toMatch(/\.kl-submit\s*\{[^}]*width:\s*100%/)
    expect(css).toMatch(/\.kl-form\s*\{[^}]*--kl-footer-clearance:\s*113px/)
    expect(css).toMatch(/\.kl-form:has\(\.kl-submit-reason\)[^}]*--kl-footer-clearance:\s*176px/)
    expect(css).toMatch(/\.kl-form:has\(\.kl-submit-reason\):has\(\.kl-submit-outcome\)[^}]*--kl-footer-clearance:\s*208px/)
    expect(css).toMatch(/margin-bottom:\s*var\(--kl-footer-clearance\)/)
  })

  it('keeps the phone search and hides filter selects until the desktop breakpoint', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*767\.98px\)[\s\S]*?\.kl-form\s+\.ktb-filter-selects\s*\{\s*display:\s*none/)
  })

  it('shares the transfer scope strip with search on phone to stay inside the 300px first-row cap', () => {
    expect(css).toMatch(/\.kl-form \.ktb:has\(\.kl-scope\) \.ktb-children--band\s*\{\s*flex:\s*1 1 210px/)
    expect(css).toMatch(/\.kl-form \.ktb:has\(\.kl-scope\) \.ktb-filters\s*\{\s*flex:\s*1 1 120px/)
  })
})

describe('AC-046: DESIGN.md carries the #790 A3/A4 amendments verbatim', () => {
  const design = readFileSync(resolve(process.cwd(), '../DESIGN.md'), 'utf8')

  it('A3 — first row within 300px on phone', () => {
    expect(design).toContain('> **First row within 300px on phone.** Between the phone header and the first capture row sit at most: the title line, the scope statement, one segmented scope strip, one search field and one group label. Filters beyond search (category) are desktop-only. A group with zero rows renders no header; its count lives in the head\'s summary line.')
  })

  it('A4 — the capture band', () => {
    expect(design).toContain('> **The capture band.** One sticky band: a count line (`N item · N porsi`) and **one** primary (`Kirim N entri`), full-width at 390. Discard is a text link that renders only while something is staged; a precondition that blocks Submit is stated once, in the band, never as a third column. Content above the band ends with clearance equal to the band\'s height, so the list\'s last control is never occluded at max scroll.')
  })
})
