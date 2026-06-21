// C1 regression invariant: NO two kitchen page/component CSS files define the same
// global class selector. The original bug — `pages/kitchen-plan-page.css` (S2) and
// `pages/kitchen-pushes-page.css` (S5) BOTH owned `.kp-block/.kp-table/.kp-empty/…`
// with divergent values — meant the last-imported file won and styles bled across
// pages (S5's `.kp-table tbody tr:hover` even leaked an interactive hover onto S2's
// read-only pesanan table). CSS Modules aren't in play here (plain global .css), so
// the namespaces must be disjoint per surface.
//
// Generic, intentionally-shared utility classes (the cross-surface design grammar:
// `.mono`, `.tabular`, `.sr-only`) are allowed to repeat — they carry the SAME
// definition everywhere by design. Everything else (the page/component prefixes
// kl-/kp-/kpu-/kr-/ks-/kpe-) must live in exactly one file.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const SRC = resolve(process.cwd(), 'src')

// Every kitchen .css surface (pages + components), globbed so new ones are covered.
function kitchenCssFiles(): string[] {
  const pages = readdirSync(join(SRC, 'pages'))
    .filter((f) => f.startsWith('kitchen-') && f.endsWith('.css'))
    .map((f) => join(SRC, 'pages', f))
  const components = readdirSync(join(SRC, 'components', 'kitchen'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => join(SRC, 'components', 'kitchen', f))
  return [...pages, ...components]
}

// Class selectors that are deliberately shared cross-surface (same definition by
// design) — the global utility grammar, NOT page-scoped chrome.
const SHARED_UTILITIES = new Set(['mono', 'tabular', 'sr-only'])

// Collect the leading class token of every class selector in a CSS file. We take
// the class that *starts* a selector (`.foo`, `.foo:hover`, `.foo td`, `.foo.bar`)
// — i.e. the namespace owner — which is what bleeds across pages on collision.
function classSelectors(css: string): Set<string> {
  const classes = new Set<string>()
  // Strip block bodies + at-rules; match selectors before each `{`.
  for (const m of css.matchAll(/(^|[},])\s*([^{}]+?)\s*\{/g)) {
    const selectorList = m[2]
    if (selectorList.includes('@') || selectorList.includes('%')) continue // at-rules / keyframes
    for (const sel of selectorList.split(',')) {
      const cls = sel.trim().match(/^\.([a-zA-Z0-9_-]+)/)
      if (cls && !SHARED_UTILITIES.has(cls[1])) classes.add(cls[1])
    }
  }
  return classes
}

describe('C1: kitchen CSS namespaces are disjoint (no global-class collisions)', () => {
  const files = kitchenCssFiles()
  const owners = new Map<string, string[]>() // class → files that define it

  for (const file of files) {
    const css = readFileSync(file, 'utf8')
    for (const cls of classSelectors(css)) {
      owners.set(cls, [...(owners.get(cls) ?? []), file.replace(SRC, 'src')])
    }
  }

  it('no class selector is defined in more than one kitchen CSS file', () => {
    const collisions = [...owners.entries()]
      .filter(([, fileList]) => fileList.length > 1)
      .map(([cls, fileList]) => `.${cls} → ${fileList.join(' + ')}`)
    expect(collisions, `colliding global classes:\n${collisions.join('\n')}`).toEqual([])
  })
})
