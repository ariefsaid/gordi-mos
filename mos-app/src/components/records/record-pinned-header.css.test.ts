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

// #751 AC-031 round-4 pin — the pinned-header action row is ONE 44px flex box with
// align-items: center; the status pill, the primary button and the ⋯ overflow all share
// that ONE height and ONE vertical alignment. The round-4 audit measured `top: 239` on
// the pill against `top: 240` on the icon controls at 390 (the CSS split the rule
// between the row and the pill, and a nested content-box button drifted 1px past its
// siblings). jsdom has no layout engine, so this layer pins the CSS grammar of the fix:
// the row itself carries min-height: 44px + align-items: center, and the RecordField
// wrapper around the status pill is flattened to a same-line 44px flex box so no nested
// grid can offset the pill's top from its 44px neighbours. The rendered-pixel proof
// lives in e2e/guards.geometry.spec.ts ("pinned record header geometry" → the 390 row
// oracle: one shared top, every control ≥44px).
describe('AC-031: the pinned-header action row shares ONE 44px height and ONE vertical alignment', () => {
  function ruleBody(selector: string): string {
    // The base regex from the sibling suite: read the FIRST balanced `{...}` block for the
    // selector. Comment-stripping happened at file load, so no `/*…*/` can hide inside.
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)
    expect(match, `expected record-viewer.css to define ${selector}`).not.toBeNull()
    return match![1]
  }

  it('the row itself is a flex box with align-items: center and min-height: 44px', () => {
    const body = ruleBody('.record-viewer__pinned-status')
    expect(body).toMatch(/display:\s*flex/)
    expect(body).toMatch(/align-items:\s*center/)
    expect(body).toMatch(/min-height:\s*44px/)
  })

  it('the RecordField wrapper around the status pill is a same-line 44px flex box (no nested grid drift)', () => {
    // Combined selector `.record-viewer__pinned-status .record-field, .record-viewer__pinned-status .record-field__value-cell`
    // — reading the wrapper's body suffices: both selectors share it.
    const body = ruleBody('.record-viewer__pinned-status .record-field,\n.record-viewer__pinned-status .record-field__value-cell')
    expect(body).toMatch(/display:\s*flex/)
    expect(body).toMatch(/flex-direction:\s*row/)
    expect(body).toMatch(/align-items:\s*center/)
    expect(body).toMatch(/min-height:\s*44px/)
  })

  it('the status edit button is flattened to 44px with no padding or border, so its bounding box matches the pill it contains', () => {
    const body = ruleBody('.record-viewer__pinned-status .record-field__edit')
    expect(body).toMatch(/min-height:\s*44px/)
    expect(body).toMatch(/padding:\s*0/)
    expect(body).toMatch(/border:\s*0/)
    expect(body).toMatch(/align-items:\s*center/)
  })

  it('the status pill is raised to the 44px interactive floor and centred inside the row (never baseline-aligned)', () => {
    const body = ruleBody('.record-viewer__pinned-status .record-field__pill')
    expect(body).toMatch(/min-height:\s*44px/)
    expect(body).toMatch(/align-self:\s*center/)
  })
})
