/**
 * MECH-GUARD — Signal title identity never truncates to meaninglessness (H6 · Luna floor), and the
 * Home ambient-tail title never forces horizontal overflow (H8(a) · Luna floor).
 *
 * Two surfaces render a Signal's identity as a title line: the archive TABLE cell and the Home
 * ambient-tail feed row (shared by SignalFeedSection + the archive Feed). Both previously used a
 * single-line `white-space: nowrap` + ellipsis, which (a) clipped the title mid-word at 1280 and on
 * the phone tail, and (b) let a long single-line Signal set the row's min-content width to ~680px —
 * on the stacked 375px phone main that measured ~700px of horizontal scroll.
 *
 * The fix is ONE shared clamp vocabulary (the SAME the condensed Task title + the ranked-stream
 * title use): a 2-line `-webkit-line-clamp` with `white-space: normal`. This guard pins that
 * grammar on BOTH Signal title surfaces so neither can regress to the nowrap defect — jsdom has no
 * layout engine, so the CSS grammar of the wrap IS the expressible structural no-overflow guard.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Body of the first balanced `{…}` block whose selector matches `pattern`. */
function ruleBody(css: string, pattern: RegExp): string | null {
  const m = pattern.exec(css)
  if (!m) return null
  const open = css.indexOf('{', m.index)
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  return null
}

const feedCss = stripComments(
  readFileSync(resolve(process.cwd(), 'src/components/signals/signal-feed-rows.css'), 'utf8'),
)
const tableCss = stripComments(
  readFileSync(resolve(process.cwd(), 'src/components/signals/signal-table-presentation.css'), 'utf8'),
)
const grammarCss = stripComments(
  readFileSync(resolve(process.cwd(), 'src/components/collection-grammar.css'), 'utf8'),
)

describe('GUARD H6/H8(a): Signal title identity clamps to 2 lines, never a nowrap single line', () => {
  // A FEED is for reading (signed mockup: `.feed-text` renders in full). The clamp was never the
  // fix for H8(a) — `white-space: normal` was; the clamp rode along and truncated Signal prose
  // mid-sentence in a column whose entire job is that prose. It is dropped here and KEPT on the
  // task row (.stream-row-title), where the title is an identifier, not prose. What must never
  // come back is the `nowrap` that set a ~680px min-content width and blew a 375px row out to
  // ~700px of horizontal scroll.
  it('GUARD: the feed title (.home-signal-body-text) wraps in FULL — no nowrap, and no clamp', () => {
    const body = ruleBody(feedCss, /\.home-signal-body-text\s*\{/)
    expect(body, 'signal-feed-rows.css must define .home-signal-body-text').not.toBeNull()
    expect(body!).toMatch(/white-space:\s*normal/)
    expect(body!).not.toMatch(/white-space:\s*nowrap/)
    expect(body!, 'a feed is for reading — the body is not clamped').not.toMatch(/line-clamp/)
  })

  // PORT NOTE (#193): v4's third case here reads `src/components/home/home-stream.css` and pins
  // `.stream-row-title`'s 2-line clamp — the CONTRAST case for the rule above. That file is Home's
  // (#191) and does not exist on this line yet, so the case travels with Home's port rather than
  // being asserted against a stylesheet that is not there. Nothing about the Signal grammar below
  // depends on it; it documents why the feed body is deliberately NOT clamped.

  it('GUARD: the archive TABLE title (.signal-table-message) is a 2-line clamp, not nowrap', () => {
    const body = ruleBody(tableCss, /\.signal-table-message\s*\{/)
    expect(body, 'signal-table-presentation.css must define .signal-table-message').not.toBeNull()
    expect(body!).toMatch(/-webkit-line-clamp:\s*2/)
    expect(body!).toMatch(/white-space:\s*normal/)
    expect(body!).not.toMatch(/white-space:\s*nowrap/)
  })

  it('GUARD: the title cell (a div in the td) + its message win the cascade with white-space:normal', () => {
    // The title cell is a DIV inside an unclassed td, so the override must target the class, not a
    // `td.` selector (which never matched — the original H6 bug: guard-on-file-text passed while the
    // rendered title stayed a hard nowrap clip). Pin the cell opt-out AND the cascade-winning
    // message rule that keeps white-space:normal authoritative over the shared grammar rule.
    const cell = ruleBody(tableCss, /\.signal-collection-table \.signal-table-title-cell\s*\{/)
    expect(cell, 'the title cell must override the td nowrap by class').not.toBeNull()
    expect(cell!).toMatch(/white-space:\s*normal/)
    const scoped = ruleBody(tableCss, /\.signal-collection-table \.signal-table-title-cell \.signal-table-message\s*\{/)
    expect(scoped, 'the scoped message rule must win the cascade').not.toBeNull()
    expect(scoped!).toMatch(/-webkit-line-clamp:\s*2/)
    expect(scoped!).toMatch(/white-space:\s*normal/)
  })
})

describe('GUARD H8(c): the phone Signals result is ONE calm surface, not a stack of raised cards', () => {
  it('GUARD: the signal phone card is flat — no border / radius / resting shadow', () => {
    // The flatten rule is the single-selector `.signal-collection-presentation .dt-card` block
    // whose body zeroes border/radius/shadow (distinct from the shared min-height rule).
    expect(grammarCss).toMatch(
      /\.signal-collection-presentation \.dt-card\s*\{[^}]*border:\s*0[^}]*border-radius:\s*0[^}]*box-shadow:\s*none/s,
    )
  })

  it('GUARD: consecutive signal cards form one surface — zero inter-card gap, a single hairline divider', () => {
    const cards = ruleBody(grammarCss, /\.signal-collection-presentation \.dt-cards\s*\{/)
    expect(cards, 'the signal card container must drop the inter-card gap').not.toBeNull()
    expect(cards!).toMatch(/gap:\s*0/)
    const divider = ruleBody(grammarCss, /\.signal-collection-presentation \.dt-card \+ \.dt-card\s*\{/)
    expect(divider, 'consecutive signal cards must be separated by a hairline, not a gap').not.toBeNull()
    expect(divider!).toMatch(/border-top:\s*1px solid/)
  })
})
