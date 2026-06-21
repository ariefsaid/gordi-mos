// RI-4 (design-reviewer regression invariant): every CSS custom property
// `var(--…)` referenced by the kitchen components/page CSS is DEFINED somewhere
// in the app's token surface (index.css + styles/tokens/*). Catches the next
// `--shadow-brand-button` (an undefined token that silently resolves to nothing).
//
// Layering: pure fs-read, mirrors task-surface.css.test.ts.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const SRC = resolve(process.cwd(), 'src')

// Kitchen CSS surfaces — GLOBBED so a NEW kitchen .css (page or component) is
// auto-covered by this guard the moment it lands (no manual list to drift). Covers
// every `pages/kitchen-*.css` (log/plan/review/stock/pushes) + every
// `components/kitchen/*.css`.
const KITCHEN_CSS = [
  ...readdirSync(join(SRC, 'pages'))
    .filter((f) => f.startsWith('kitchen-') && f.endsWith('.css'))
    .map((f) => join(SRC, 'pages', f)),
  ...readdirSync(join(SRC, 'components', 'kitchen'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => join(SRC, 'components', 'kitchen', f)),
]

// Where tokens may be DEFINED: index.css + the token css + Button.css (.btn-touch etc).
const TOKEN_SOURCES = [
  join(SRC, 'index.css'),
  ...readdirSync(join(SRC, 'styles', 'tokens')).map((f) => join(SRC, 'styles', 'tokens', f)),
]

function read(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

// Collect all `--token:` DEFINITIONS across the token sources.
function definedTokens(): Set<string> {
  const defined = new Set<string>()
  for (const src of TOKEN_SOURCES) {
    const css = read(src)
    for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) {
      defined.add(m[1])
    }
  }
  return defined
}

// Collect all `var(--token …)` REFERENCES in a CSS file.
function referencedTokens(css: string): string[] {
  const refs = new Set<string>()
  for (const m of css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
    refs.add(m[1])
  }
  return [...refs]
}

describe('RI-4: kitchen CSS references only defined tokens', () => {
  const defined = definedTokens()

  for (const cssPath of KITCHEN_CSS) {
    it(`every var(--…) in ${cssPath.replace(SRC, 'src')} is defined`, () => {
      const css = read(cssPath)
      expect(css.length, `expected ${cssPath} to exist and be non-empty`).toBeGreaterThan(0)
      const undefinedRefs = referencedTokens(css).filter((t) => !defined.has(t))
      expect(undefinedRefs, `undefined token(s) referenced: ${undefinedRefs.join(', ')}`).toEqual([])
    })
  }
})
