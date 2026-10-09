// Café capture presentation contracts: the sticky band, first-screen filter set, list clearance,
// and the verbatim A3/A4 design amendments. These pin the layout fence, not log behavior.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/pages/kitchen-log-page.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const captureCss = readFileSync(resolve(process.cwd(), 'src/components/kitchen/cafe-capture-layout.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const toolbarCss = readFileSync(resolve(process.cwd(), 'src/components/kitchen/kitchen-toolbar.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const captureControlsCss = readFileSync(resolve(process.cwd(), 'src/components/kitchen/cafe-capture-controls.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const stepperCss = readFileSync(resolve(process.cwd(), 'src/components/kitchen/wip-item-stepper.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

function ruleBodyAt(idx: number, source = css): string {
  expect(idx, 'expected the stylesheet to contain the capture layout rule').toBeGreaterThanOrEqual(0)
  const open = source.indexOf('{', idx)
  const close = source.indexOf('}', open)
  return source.slice(open + 1, close)
}

describe('KL-FOOTER-NAV: the capture footer stays reachable above the shell bottom-tab bar', () => {
  it('keeps the footer at the scrollport edge without a tab-bar-sized gap', () => {
    const captureFrame = ruleBodyAt(captureCss.indexOf('.page-frame--v3:has(.kl-capture-content),'), captureCss)
    const captureContent = ruleBodyAt(captureCss.indexOf('.kl-capture-content,\n.kl-capture-content .kl-capture-main,'), captureCss)
    const captureFooter = ruleBodyAt(captureCss.indexOf('.cafe-capture-footer.kl-footer {'), captureCss)

    expect(captureFrame).toMatch(/padding-bottom:\s*0/)
    expect(captureContent).toMatch(/flex:\s*1 0 auto/)
    expect(captureContent).toMatch(/flex-direction:\s*column/)
    expect(captureFooter).toMatch(/bottom:\s*0/)
    expect(captureFooter).toMatch(/margin-bottom:\s*0/)
    expect(captureFooter).toMatch(/margin-top:\s*auto/)
    expect(captureCss).toMatch(/@media\s*\(max-width:\s*767\.98px\)\s*\{\s*\.cafe-capture-footer\.kl-footer\s*\{[^}]*padding-bottom:\s*calc\(8px \+ env\(safe-area-inset-bottom,\s*0px\)\)/)
  })

  it('keeps the tally and primary action together and reserves list clearance for the phone band', () => {
    const captureFooter = ruleBodyAt(captureCss.indexOf('.cafe-capture-footer.kl-footer {'), captureCss)
    const countRow = ruleBodyAt(captureCss.indexOf('.cafe-capture-footer > .kl-footer-count-row {'), captureCss)
    const primaryAction = ruleBodyAt(captureCss.indexOf('.cafe-capture-footer > .kl-submit,'), captureCss)

    expect(captureFooter).toMatch(/flex-direction:\s*row/)
    expect(captureFooter).toMatch(/flex-wrap:\s*wrap/)
    expect(countRow).toMatch(/flex:\s*1 1 0/)
    expect(primaryAction).toMatch(/min-height:\s*44px/)
    expect(css).toMatch(/margin-bottom:\s*var\(--kl-footer-clearance\)/)
  })

  it('keeps the phone search and hides filter selects until the desktop breakpoint', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*767\.98px\)[\s\S]*?\.kl-form\s+\.ktb-filter-selects\s*\{\s*display:\s*none/)
  })

  it('M04: compacts shared capture chrome and keeps the missing-item action beside search', () => {
    expect(css).toMatch(/\.page-frame--v3:has\(\.kl-form\) \.page-head--v3\.content-header\s*\{[^}]*margin-bottom:\s*4px;[^}]*padding-bottom:\s*0/)
    expect(css).toMatch(/\.kl-context\s*\{[^}]*margin-bottom:\s*8px/)
    expect(css).toMatch(/\.kl-context-summary\s*\{[^}]*padding:\s*4px 8px/)
    expect(css).toMatch(/\.kl-form \.ktb\s*\{[^}]*padding-block:\s*0/)
    expect(css).toMatch(/\.kl-form \.ktb-search-wrap\s*\{[^}]*min-width:\s*160px/)
    expect(css).toMatch(/\.kl-form \.kl-missing\s*\{[^}]*flex:\s*0 0 auto;[^}]*padding:\s*0/)
    expect(css).toMatch(/\.kl-form \.dt-cards-group\s*\{[^}]*padding-top:\s*4px/)
  })

  it('keeps transfer destination above the shared search and missing-item action row', () => {
    expect(toolbarCss).toMatch(/\.ktb-children--band\s*\{[^}]*flex:\s*1 0 100%/)
    expect(toolbarCss).toMatch(/\.ktb-children--band > \*\s*\{\s*width:\s*100%/)
    expect(css).toMatch(/\.kl-form \.ktb-search-wrap\s*\{[^}]*flex:\s*1 1 180px;[^}]*min-width:\s*160px/)
    expect(css).toMatch(/@media\s*\(max-width:\s*767\.98px\)[\s\S]*?\.kl-form \.ktb-filter-selects\s*\{\s*display:\s*none/)
  })
})

describe('M02: Café toolbar controls use the interactive boundary token', () => {
  it('keeps the shared search and filter outlines at control contrast', () => {
    const search = ruleBodyAt(toolbarCss.indexOf('.ktb-search {'), toolbarCss)
    const filter = ruleBodyAt(toolbarCss.indexOf('.ktb-kind .mk-select__box,'), toolbarCss)
    expect(search).toMatch(/border:\s*1px solid var\(--input\)/)
    expect(filter).toMatch(/border-color:\s*var\(--input\)/)
  })
})

describe('dense Café capture controls stay in one aligned desktop row', () => {
  it('keeps the quantity and full unit label inline in a fixed shared track', () => {
    const quantityGroup = ruleBodyAt(stepperCss.indexOf('.kls-quantity .quantity-field-control--inline {'), stepperCss)
    const desktopUnit = ruleBodyAt(css.indexOf('.kl-form .kls-quantity .cafe-capture-unit {'))
    const sharedUnit = captureControlsCss.slice(captureControlsCss.indexOf('.cafe-capture-unit {'), captureControlsCss.indexOf('.cafe-capture-action {'))
    expect(quantityGroup).toMatch(/grid-template-columns:\s*var\(--cafe-capture-quantity-width,[^)]+\)\s*var\(--cafe-capture-unit-track-width/)
    expect(quantityGroup).toMatch(/width:\s*var\(--cafe-capture-control-group-width/)
    expect(quantityGroup).toMatch(/gap:\s*8px/)
    expect(css).not.toContain('.kl-form .kls-quantity .quantity-field-control--inline {')
    expect(css).not.toContain('.kl-form .kls-quantity .kls-qty {')
    expect(css).not.toContain('.kl-form .kls-quantity .kls-unit-change {')
    expect(css).not.toContain('.kl-form .kls-quantity .kls-unit-select .mk-select__field > span:first-child {')
    expect(css).not.toContain('.kl-form .kls-quantity .kls-unit-select .mk-select__box,')
    expect(css).not.toContain('.kl-form .kls-quantity .kls-unit-select {')
    const pickerSizing = ruleBodyAt(stepperCss.indexOf('.kls-unit-select .mk-select__box,'), stepperCss)
    expect(pickerSizing).toMatch(/width:\s*100%/)
    expect(pickerSizing).toMatch(/max-width:\s*100%/)
    expect(desktopUnit).toMatch(/max-width:\s*var\(--cafe-capture-unit-track-width/)
    expect(desktopUnit).toMatch(/text-align:\s*left/)
    expect(desktopUnit).not.toMatch(/white-space|overflow-wrap|text-overflow/)
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

describe('capture quantity errors span the entry row', () => {
  it('lets a phone error occupy the full identity-and-quantity row below the unit', () => {
    expect(stepperCss).toMatch(/\.kls-row\s*\{[^}]*display:\s*grid/)
    expect(stepperCss).toMatch(/\.kls-quantity \.quantity-field-error\s*\{[^}]*grid-column:\s*1 \/ -1/)
    expect(css).toMatch(/\.kl-card-head:has\(\.quantity-field-error\)[^{]*\{[^}]*grid-column:\s*1 \/ -1/)
  })
})

describe('capture summary line keeps the item name readable', () => {
  it('wraps the date and status labels onto their own row instead of squeezing the name', () => {
    const line = ruleBodyAt(captureCss.indexOf('.kl-capture-summary__lines li {'), captureCss)
    const labels = ruleBodyAt(captureCss.indexOf('.kl-capture-summary__lines li > small,'), captureCss)
    expect(line).toMatch(/flex-wrap:\s*wrap/)
    expect(labels).toMatch(/flex:\s*0 0 100%/)
  })
})
