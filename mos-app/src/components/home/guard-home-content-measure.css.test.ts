import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── Home is a two-column operating surface, not a readable single column ───────────────────────
// PageFrame caps its content region at the readable measure (1180px) and LEFT-aligns it. That cap
// is right for a single-column page and wrong for Home: Home is a work region + a standing Signals
// aside, so on a wide monitor the cap stranded a dead gutter to the right of everything — the
// header rule, the bento and the Signals column all stopped ~250px short of the content area
// ("why is the container for home got cut mid screen horizontally?" — owner, ~1730px window).
//
// The fix follows the ONE precedent already in this codebase (TasksWorkspace.css, "owner-eyes
// item 7 — kill the dead right void"): the page's OWN stylesheet lifts the cap through a `:has()`
// scope, so exactly the route that hosts the multi-column surface is affected and every
// single-column readable page keeps 1180px.
//
// These two assertions are a pair, and neither is redundant: the first fails if the lift is
// reverted/deleted (Home goes back to being cut mid-screen), the second fails if someone "fixes"
// it by raising or removing the SHARED cap (every readable page loses its measure).
const HOME_CSS = readFileSync(join(__dirname, 'home-layouts.css'), 'utf8')
const FRAME_CSS = readFileSync(join(__dirname, '../../shell/page-families.css'), 'utf8')

/** The readable-measure cap PageFrame applies to a single-column page. */
const READABLE_MEASURE = 1180

function maxWidthOf(css: string, selector: string): string | null {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)
  const body = re.exec(css)?.[1]
  return body ? (/max-width:\s*([^;]+);/.exec(body)?.[1].trim() ?? null) : null
}

describe('Home content region: the readable-measure cap is lifted for Home, and only for Home', () => {
  it('lifts the cap on the content region that hosts Home, scoped by :has(.home-frame)', () => {
    const declared = maxWidthOf(HOME_CSS, '.page-frame__content:has(.home-frame)')
    expect(declared, 'Home must lift PageFrame\'s single-column cap through its own :has() scope')
      .not.toBeNull()
    const px = Number(/^(\d+(?:\.\d+)?)px$/.exec(declared!)?.[1] ?? NaN)
    expect(px, `expected a wide cap in px, got "${declared}"`).toBeGreaterThan(READABLE_MEASURE)
  })

  it('leaves the shared PageFrame cap at the readable measure for every other page', () => {
    expect(maxWidthOf(FRAME_CSS, '.page-frame--v3 .page-frame__content'))
      .toBe(`${READABLE_MEASURE}px`)
    // …and Home's sheet must not reach the shared rule unscoped, which would lift it globally.
    expect(HOME_CSS, 'an unscoped .page-frame__content rule would lift the cap for every page')
      .not.toMatch(/(^|[\s,}])\.page-frame__content\s*\{/m)
  })
})
