// #401 structural twins (jsdom computes no layout — these pin the authored
// declarations; the rendered boxes live in e2e/guards.geometry.spec.ts):
//  • KP-LINEHEIGHT — the two-line name+category stack must lead at 1.2 or it
//    overflows the Data Table's 52px desktop row (the same defect the Log page's
//    .kl-dish-name/.kl-dish-cat fix already killed — the fix landed there only).
//  • KP-BANNER — offline and save-failed use the SAME amber/red vocabulary as
//    Café · Log (warning / destructive tokens), never a plain grey box.
//  • KP-GROUP-LOG-LINK (#784 AC-058) — the group-header "See these in Log" is the
//    links-in-context vocabulary (Action Blue + underline), replacing the retired
//    per-row .kp-row-link on both faces.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/pages/kitchen-plan-page.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

function ruleBody(selector: string): string {
  const idx = css.indexOf(selector)
  expect(idx, `expected kitchen-plan-page.css to style ${selector}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('KP-LINEHEIGHT: the dish stack leads at 1.2 (the 52px desktop row)', () => {
  it('.kp-name declares line-height: 1.2', () => {
    expect(ruleBody('.kp-name')).toMatch(/line-height:\s*1\.2/)
  })
  it('.kp-cat declares line-height: 1.2', () => {
    expect(ruleBody('.kp-cat')).toMatch(/line-height:\s*1\.2/)
  })
})

describe('KP-BANNER: same warning vocabulary as Café · Log (amber offline, red error)', () => {
  it('.kp-banner-offline is amber (--warning), not a grey box', () => {
    const body = ruleBody('.kp-banner-offline')
    expect(body).toMatch(/var\(--warning\)/)
    expect(body).not.toMatch(/background:\s*var\(--muted\)/)
  })
  it('.kp-banner-error is red (--destructive), not a grey box', () => {
    const body = ruleBody('.kp-banner-error')
    expect(body).toMatch(/var\(--destructive\)/)
    expect(body).not.toMatch(/background:\s*var\(--muted\)/)
  })
})

describe('KP-GROUP-LOG-LINK: the group-header shortcut is links-in-context blue + underline (#784 AC-058)', () => {
  it('.kp-group-log-link declares primary colour + underline', () => {
    const body = ruleBody('.kp-group-log-link')
    expect(body).toMatch(/color:\s*var\(--primary\)/)
    expect(body).toMatch(/text-decoration:\s*underline/)
  })

  it('the retired per-row .kp-row-link rule is gone — item names are plain text', () => {
    // A stripped-comment css slice — the rule body must not exist any more.
    expect(css).not.toMatch(/\.kp-row-link\s*\{/)
  })
})
