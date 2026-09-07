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

  // NOTE (#751 round 3): there is deliberately NO CSS-string test here for the pinned header's
  // scroll behaviour. The round-2 test asserted the literal `position: sticky; top:
  // var(--header-h)` in this sheet — and that value was the BROKEN render: `.record-doc` never
  // scrolls (no scrollport, so no pinning) and the offset displaced the header 56px DOWN over
  // the tab strip. A regex over a stylesheet is not a geometry test; the oracle is the rendered
  // box in e2e/guards.geometry.spec.ts ("pinned record header geometry"), which scrolls the real
  // record body and measures header/tabs at 1440 and 390.

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
