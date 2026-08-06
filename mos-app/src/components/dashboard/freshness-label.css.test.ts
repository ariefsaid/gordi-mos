/**
 * MECH-GUARD — the freshness label wraps; only a formatted value stays unbroken (#277).
 *
 * `.freshness-label` carried `white-space: nowrap`, so the Café · Stock provenance note ("ERP
 * inventory not connected yet — comparison column pending") ran past a 375px viewport and was
 * clipped at the right edge. Measured on the running app: 387px right edge against a 375px
 * viewport with nowrap, 337px without.
 *
 * Two halves are pinned here, and the distinction between them is the point:
 *   - the LABEL wraps, so prose can never set a min-content width wider than the phone;
 *   - the TIMESTAMP span keeps nowrap, so a formatted value ("02 Jul 2026, 15:30 WIB",
 *     "03:30 WIB") never splits across lines.
 *
 * `white-space: normal` is DECLARED rather than omitted: `.content-header .ch-meta-line` sets
 * nowrap, and an omitted declaration inherits it — which would leave the fix silently inert on the
 * surfaces that nest the label inside that span.
 *
 * jsdom has no layout engine, so the CSS grammar of the wrap IS the expressible structural
 * no-overflow guard — same reasoning as guard-signal-title-clamp.css.test.ts.
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

const css = stripComments(
  readFileSync(resolve(process.cwd(), 'src/components/dashboard/freshness-label.css'), 'utf8'),
)

describe('GUARD #277: the freshness label wraps, its timestamp does not', () => {
  it('GUARD: .freshness-label declares white-space:normal and never nowrap', () => {
    const body = ruleBody(css, /\.freshness-label\s*\{/)
    expect(body, 'freshness-label.css must define .freshness-label').not.toBeNull()
    // Declared, not omitted — an ancestor (.content-header .ch-meta-line) sets nowrap.
    expect(body!).toMatch(/white-space:\s*normal/)
    expect(body!, 'nowrap here clipped the stock provenance note at 375px (#277)').not.toMatch(
      /white-space:\s*nowrap/,
    )
  })

  it('GUARD: .freshness-label-ts keeps nowrap so a formatted value never splits', () => {
    const body = ruleBody(css, /\.freshness-label-ts\s*\{/)
    expect(body, 'freshness-label.css must define .freshness-label-ts').not.toBeNull()
    expect(body!).toMatch(/white-space:\s*nowrap/)
  })
})
