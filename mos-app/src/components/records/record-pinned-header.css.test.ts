// #751 AC-030 — the record's pinned title clamps at TWO lines and never breaks mid-word
// (drawer 1440 and 1370 alike; W-D step 8).
//
// jsdom has no layout engine, so this layer pins the CSS grammar verbatim (the established
// guard pattern — see guard-r1-split-parity.css.test.ts): the clamp rides the shared
// `--record-title-max-lines` token, and the pinned-title scope OVERRIDES the record field
// value's `overflow-wrap: anywhere` (the cause of the audited "Replac / e…" mid-word break)
// with `overflow-wrap: normal` at HIGHER specificity in the SAME stylesheet, so the override
// wins the cascade wherever the pinned header renders.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(
  resolve(process.cwd(), 'src/components/records/record-viewer.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

const indexCss = readFileSync(
  resolve(process.cwd(), 'src/index.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

describe('AC-030: the pinned title clamps at two lines with overflow-wrap: normal', () => {
  it('the clamp token is two lines', () => {
    expect(indexCss).toMatch(/--record-title-max-lines:\s*2;/)
  })

  it('the pinned-title heading clamps via the token', () => {
    expect(css).toMatch(
      /\.record-viewer__pinned-title \.record-field__heading\s*\{[^}]*-webkit-line-clamp:\s*var\(--record-title-max-lines\)/,
    )
  })

  it('the pinned header stays below the fixed app bar while scrolling', () => {
    expect(css).toMatch(/\.record-viewer__pinned-header\s*\{[^}]*position:\s*sticky[^}]*top:\s*var\(--header-h\)/)
  })

  it('phone keeps status, primary, and overflow in one control row', () => {
    const phone = css.match(/@media\s*\(max-width:\s*390px\)\s*\{([\s\S]*)/)?.[1] ?? ''
    expect(phone).not.toMatch(/\.record-viewer__pinned-header[^}]*flex-direction:\s*column/)
    expect(phone).toMatch(/\.record-viewer__pinned-status[^}]*flex-wrap:\s*nowrap/)
  })

  it('the pinned-title scope overrides the value wrap so words stay whole', () => {
    // The defect: the base value rule's `overflow-wrap: anywhere` breaks "Replace" mid-word.
    expect(css).toMatch(/\.record-field__value\s*\{[^}]*overflow-wrap:\s*anywhere/)
    // The fix: a scoped override at (0,2,0) specificity in the same sheet — it wins the
    // cascade over the (0,1,0) base rule regardless of rule order.
    expect(css).toMatch(
      /\.record-viewer__pinned-title \.record-field__value\s*\{[^}]*overflow-wrap:\s*normal/,
    )
  })
})
