import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── The Home day header's wrap contract (ticket #747 / DESIGN.md "Home day header") ───────────
// jsdom computes no layout, so the contract is pinned at the authored-declaration layer (the same
// seam as guard-do16 / tap-targets): ONE line at every width — greeting + role chip left, `N left`
// right — with the role chip dropping to a second line at ≤390, and NO control left in the header
// that could sit under the 44px phone floor (the help tip and track are gone; a regression that
// reintroduces their CSS fails the retired-rules leg below).

function stripped(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

function mediaBody(css: string, query: string): string {
  const idx = css.indexOf(query)
  expect(idx, `expected to find ${query}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  throw new Error(`unterminated media query: ${query}`)
}

const HOME_CSS = stripped('src/pages/home-page.css')
const HEAD_CSS = stripped('src/shell/page-head.css')
const PAGE_TSX = readFileSync(resolve(process.cwd(), 'src/pages/home-page.tsx'), 'utf8')
const HEADER_CSS = readFileSync(resolve(process.cwd(), 'src/components/home/home-day-header.tsx'), 'utf8')

describe('AC-041 — the day header is one line, chip drops at 390 (CSS contract)', () => {
  // Between the phone breakpoint and 390 the header must stay ONE line. The shared phone stack
  // wraps every `.ch-meta` onto a full-width row at ≤767.98px; the day header opts out via the
  // shared compact mode (`content-header--compact .ch-meta` keeps meta inline on phone). This is
  // where that opt-in is authored — and this leg fails if the head ever loses it.
  it('the day header opts into the shared compact mode that keeps 391–767px one line', () => {
    expect(PAGE_TSX).toMatch(/headClassName="home-day-header content-header--compact"/)
    const phone = mediaBody(HEAD_CSS, '@media (max-width: 767.98px)')
    // The compact rules the one-line leg leans on: meta inline, action beside it.
    expect(phone).toMatch(/\.content-header--compact \.ch-meta\s*\{[^}]*order:\s*1[^}]*flex:\s*0 1 auto/)
    expect(phone).toMatch(/\.content-header--compact \.ch-action\s*\{[^}]*order:\s*2/)
  })

  it('at ≤390 the meta takes a full row (chip on line 2) and the tally stays on the greeting line', () => {
    const body = mediaBody(HOME_CSS, '@media (max-width: 390px)')
    expect(body).toMatch(/\.content-header\.home-day-header \.ch-meta\s*\{[^}]*flex-basis:\s*100%/)
    expect(body).toMatch(/\.content-header\.home-day-header \.ch-action\s*\{[^}]*order:\s*0/)
  })

  it('no control the floor could measure is left in the header CSS — the retired rules stay retired', () => {
    const all = [HOME_CSS, HEAD_CSS, HEADER_CSS].join('\n')
    for (const retired of ['home-head-state', 'home-head-msg', 'home-head-track', 'home-head-fill', 'home-head-row', 'home-head-meta']) {
      expect(all.includes(retired), `.${retired} is retired — it must not come back`).toBe(false)
    }
  })
})

describe('AC-043 — DESIGN.md carries the day-header amendment verbatim', () => {
  // Doc-grep: the amendment is owner law (ticket #747 quotes it verbatim). Grep the body sentence
  // so a rewording — the thing the verbatim rule exists to prevent — fails here, not silently.
  const DESIGN = readFileSync(resolve(process.cwd(), '../DESIGN.md'), 'utf8')

  it('the "Home day header" sub-heading sits under Home arrangements with the amendment text', () => {
    const section = DESIGN.slice(DESIGN.indexOf('### Home arrangements'))
    expect(section).toMatch(/#### Home day header\nOne line at every width: greeting \+ role chip left, `N left` right; the role chip drops to a second line at 390\. No rotating state sentence, no progress track, no help tip\. If a `handled` tally has a real source it renders as `N handled · N left`; otherwise only `N left`\./)
  })
})
