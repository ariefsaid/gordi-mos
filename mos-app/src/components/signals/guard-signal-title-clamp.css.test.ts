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

describe('GUARD H6/H8(a): Signal title identity clamps to 2 lines, never a nowrap single line', () => {
  it('GUARD: the Home ambient-tail title (.home-signal-body-text) is a 2-line clamp, not nowrap', () => {
    const body = ruleBody(feedCss, /\.home-signal-body-text\s*\{/)
    expect(body, 'signal-feed-rows.css must define .home-signal-body-text').not.toBeNull()
    expect(body!).toMatch(/-webkit-line-clamp:\s*2/)
    expect(body!).toMatch(/line-clamp:\s*2/)
    // The nowrap that forced ~680px min-content width (the H8(a) overflow) must be gone.
    expect(body!).not.toMatch(/white-space:\s*nowrap/)
  })

  it('GUARD: the archive TABLE title (.signal-table-message) is a 2-line clamp, not nowrap', () => {
    const body = ruleBody(tableCss, /\.signal-table-message\s*\{/)
    expect(body, 'signal-table-presentation.css must define .signal-table-message').not.toBeNull()
    expect(body!).toMatch(/-webkit-line-clamp:\s*2/)
    expect(body!).toMatch(/white-space:\s*normal/)
    expect(body!).not.toMatch(/white-space:\s*nowrap/)
  })

  it('GUARD: the title cell opts out of the table blanket nowrap so the clamp can wrap', () => {
    const body = ruleBody(tableCss, /td\.signal-table-title-cell\s*\{/)
    expect(body, 'the title cell must override the td nowrap').not.toBeNull()
    expect(body!).toMatch(/white-space:\s*normal/)
  })
})
