// PR-6 AC-D05 — status tags / dots / toggles must resolve to the PILL radius, not 0px.
// The dangling token (an undefined --radius-FULL alias) used to be referenced here; the real
// tokens are --radius-xs/sm/md/lg/pill/round, so getComputedStyle resolved border-radius to 0px —
// every status tag rendered as a hard rectangle and the status dot as an 8×8 square.
// jsdom does not compute var() chains, so we assert at the CSS-SOURCE level:
//   (1) the tag/dot/toggle rules reference --radius-pill (the fully-rounded token that exists),
//   (2) NO src css references the dangling alias anymore (guard string built at runtime).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function ruleBody(css: string, selector: string): string {
  const idx = css.indexOf(selector)
  expect(idx, `expected to find ${selector}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

/** Recursively collect every .css under src/. */
function allCssFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) allCssFiles(full, acc)
    else if (entry.endsWith('.css')) acc.push(full)
  }
  return acc
}

describe('AC-D05: status pill + dot resolve to the pill radius, not 0px', () => {
  it('AC-D05: .mk-tag border-radius references --radius-pill (fully-rounded), not the dangling --radius-full', () => {
    const body = ruleBody(read('src/components/ui/Tag.css'), '.mk-tag {')
    expect(body).toMatch(/border-radius:\s*var\(--radius-pill\)/)
    expect(body).not.toMatch(/--radius-full/)
  })

  it('AC-D05: .status-dot is a circle via --radius-pill, not 0px (8×8 square regression)', () => {
    const body = ruleBody(read('src/components/tasks/status-pill.css'), '.status-pill .status-dot {')
    expect(body).toMatch(/border-radius:\s*var\(--radius-pill\)/)
    expect(body).not.toMatch(/--radius-full/)
  })

  it('AC-D05: .mk-toggle track uses --radius-pill, not the dangling --radius-full', () => {
    const body = ruleBody(read('src/components/ui/Toggle.css'), '.mk-toggle {')
    expect(body).toMatch(/border-radius:\s*var\(--radius-pill\)/)
    expect(body).not.toMatch(/--radius-full/)
  })
})

describe('AC-D05: no src CSS references the undefined --radius-full token', () => {
  it('AC-D05: grep guard — the dangling radius alias appears in zero src css files', () => {
    // Build the needle at runtime so this guard test never itself trips a repo-wide grep.
    const danglingRef = `var(${['--radius', 'full'].join('-')})`
    const offenders = allCssFiles(resolve(process.cwd(), 'src'))
      .filter(f => readFileSync(f, 'utf8').includes(danglingRef))
      .map(f => f.replace(process.cwd() + '/', ''))
    expect(offenders, `these CSS files still reference the undefined radius alias: ${offenders.join(', ')}`).toEqual([])
  })
})
