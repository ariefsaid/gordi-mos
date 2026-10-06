// Café capture presentation contracts: the sticky band, first-screen filter set, list clearance,
// and the verbatim A3/A4 design amendments. These pin the layout fence, not log behavior.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/pages/kitchen-log-page.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const toolbarCss = readFileSync(resolve(process.cwd(), 'src/components/kitchen/kitchen-toolbar.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const captureControlsCss = readFileSync(resolve(process.cwd(), 'src/components/kitchen/cafe-capture-controls.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

function ruleBodyAt(idx: number): string {
  expect(idx, 'expected kitchen-log-page.css to contain the capture layout rule').toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('KL-FOOTER-NAV: the capture footer stays reachable above the shell bottom-tab bar', () => {
  it('keeps the footer at the scrollport edge without a tab-bar-sized gap', () => {
    const captureFrame = ruleBodyAt(css.indexOf('.page-frame--v3:has(.cafe-capture-head) {'))
    const captureContent = ruleBodyAt(css.indexOf('.kl-capture-content,\n.kl-capture-content .kl-capture-main,'))
    const captureFooter = ruleBodyAt(css.indexOf('.cafe-capture-footer.kl-footer {'))

    expect(captureFrame).toMatch(/padding-bottom:\s*0/)
    expect(captureContent).toMatch(/flex:\s*1 0 auto/)
    expect(captureContent).toMatch(/flex-direction:\s*column/)
    expect(captureFooter).toMatch(/bottom:\s*0/)
    expect(captureFooter).toMatch(/margin-bottom:\s*0/)
    expect(captureFooter).toMatch(/margin-top:\s*auto/)
    expect(css).toMatch(/@media\s*\(max-width:\s*767\.98px\)\s*\{\s*\.cafe-capture-footer\.kl-footer\s*\{[^}]*padding-bottom:\s*calc\(8px \+ env\(safe-area-inset-bottom,\s*0px\)\)/)
  })

  it('keeps the tally and primary action together and reserves list clearance for the phone band', () => {
    const captureFooter = ruleBodyAt(css.indexOf('.cafe-capture-footer.kl-footer {'))
    const countRow = ruleBodyAt(css.indexOf('.cafe-capture-footer > .kl-footer-count-row {'))
    const primaryAction = ruleBodyAt(css.indexOf('.cafe-capture-footer > .kl-submit,\n.cafe-capture-footer > .btn {'))

    expect(captureFooter).toMatch(/flex-direction:\s*row/)
    expect(captureFooter).toMatch(/flex-wrap:\s*wrap/)
    expect(countRow).toMatch(/flex:\s*1 1 0/)
    expect(primaryAction).toMatch(/min-height:\s*44px/)
    expect(css).toMatch(/\.kl-form\s*\{[^}]*--kl-footer-clearance:\s*113px/)
    expect(css).toMatch(/\.kl-form:has\(\.kl-submit-reason\)[^}]*--kl-footer-clearance:\s*176px/)
    expect(css).toMatch(/\.kl-form:has\(\.kl-submit-reason\):has\(\.kl-submit-outcome\)[^}]*--kl-footer-clearance:\s*208px/)
    expect(css).toMatch(/margin-bottom:\s*var\(--kl-footer-clearance\)/)
  })

  it('keeps the phone search and hides filter selects until the desktop breakpoint', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*767\.98px\)[\s\S]*?\.kl-form\s+\.ktb-filter-selects\s*\{\s*display:\s*none/)
  })

  it('puts transfer destination and search on separate full-width phone rows', () => {
    expect(toolbarCss).toMatch(/\.ktb-children--band\s*\{[^}]*flex:\s*1 0 100%/)
    expect(toolbarCss).toMatch(/\.ktb-children--band > \*\s*\{\s*width:\s*100%/)
    expect(css).toMatch(/\.kl-form \.ktb:has\(\.kl-scope\) \.ktb-search-wrap\s*\{\s*max-width:\s*none/)
    expect(css).toMatch(/@media\s*\(max-width:\s*767\.98px\)[\s\S]*?\.kl-form \.ktb-filter-selects\s*\{\s*display:\s*none/)
  })
})

describe('dense Café capture controls stay in one aligned desktop row', () => {
  it('keeps the quantity and full unit label inline in a fixed shared track', () => {
    const quantityGroup = ruleBodyAt(css.indexOf('.kl-form .kls-quantity {'))
    const desktopQuantity = ruleBodyAt(css.indexOf('.kl-form .kls-quantity .kls-qty {'))
    const desktopUnit = ruleBodyAt(css.indexOf('.kl-form .kls-quantity .cafe-capture-unit {'))
    const sharedUnit = captureControlsCss.slice(captureControlsCss.indexOf('.cafe-capture-unit {'), captureControlsCss.indexOf('.cafe-capture-action {'))
    expect(quantityGroup).toMatch(/flex-direction:\s*row/)
    expect(quantityGroup).toMatch(/width:\s*var\(--cafe-capture-control-group-width/)
    expect(quantityGroup).toMatch(/gap:\s*8px/)
    expect(desktopQuantity).toMatch(/flex:\s*0\s+0\s+var\(--cafe-capture-quantity-width/)
    expect(desktopUnit).toMatch(/flex:\s*0 0 var\(--cafe-capture-unit-track-width/)
    expect(desktopUnit).toMatch(/white-space:\s*nowrap/)
    expect(desktopUnit).toMatch(/text-align:\s*left/)
    expect(css).toMatch(/dt-table thead th:nth-child\(2\),[\s\S]*?td:nth-child\(2\) \{ width: 27rem; \}/)
    expect(sharedUnit).toMatch(/overflow-wrap:\s*anywhere/)
    expect(sharedUnit).toMatch(/text-overflow:\s*clip/)
    expect(sharedUnit).not.toMatch(/text-overflow:\s*ellipsis/)
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

describe('capture summary line keeps the item name readable', () => {
  it('wraps the date and status labels onto their own row instead of squeezing the name', () => {
    const line = ruleBodyAt(css.indexOf('.kl-capture-summary__lines li {'))
    const labels = ruleBodyAt(css.indexOf('.kl-capture-summary__lines li > small,'))
    expect(line).toMatch(/flex-wrap:\s*wrap/)
    expect(labels).toMatch(/flex:\s*0 0 100%/)
  })
})
