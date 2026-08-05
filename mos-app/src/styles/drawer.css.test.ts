import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const drawerCss = readFileSync(resolve(process.cwd(), 'src/styles/drawer.css'), 'utf8')

/** Return the declaration block body for the first rule whose selector line contains `selector`. */
function ruleBody(css: string, selector: string): string {
  const idx = css.indexOf(selector)
  expect(idx, `expected to find selector ${selector}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  throw new Error(`unterminated rule: ${selector}`)
}

// TB-1 / OD-P4-9 — the shell-mounted overlay panels (Inbox quick-triage on `.drawer-shell-split`,
// standalone Deputy on `.overlay-companion-host--standalone`) float over MAIN content, so they must
// NOT cover the in-flow top-bar chrome (the bell/deputy/⌘K cluster, incl. the control that opened
// the panel). Both anchor at `top: var(--header-h)`, never `top: 0`.
describe('TB-1: shell overlay panels leave the top-bar chrome reachable', () => {
  it('.drawer-shell-split anchors below the header, not at top:0', () => {
    const body = ruleBody(drawerCss, '.drawer-shell-split {')
    expect(body).toMatch(/top:\s*var\(--header-h\)/)
    expect(body).not.toMatch(/(?<!-)top:\s*0\b/)
  })

  it('.overlay-companion-host--standalone anchors below the header, not at top:0', () => {
    const body = ruleBody(drawerCss, '.drawer.overlay-companion-host--standalone {')
    expect(body).toMatch(/top:\s*var\(--header-h\)/)
    expect(body).not.toMatch(/(?<!-)top:\s*0\b/)
  })
})
