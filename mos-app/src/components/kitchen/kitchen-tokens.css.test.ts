// RI-4 (design-reviewer regression invariant): every CSS custom property
// `var(--…)` referenced by kitchen components/page CSS is defined either in the
// app token surface or in the same stylesheet. Same-file definitions are for
// component state, not theme tokens; unresolved references still fail this guard.
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

// Collect `--token:` DEFINITIONS in a CSS source.
function declaredTokens(css: string): Set<string> {
  const defined = new Set<string>()
  for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) {
    defined.add(m[1])
  }
  return defined
}

// Collect definitions across the app's shared token sources.
function definedTokens(): Set<string> {
  const defined = new Set<string>()
  for (const src of TOKEN_SOURCES) {
    for (const token of declaredTokens(read(src))) defined.add(token)
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

// Component-state declarations count only within their own stylesheet; a typo
// with no shared or local declaration remains an undefined reference.
function undefinedTokens(css: string, sharedDefinitions: Set<string>): string[] {
  const defined = new Set([...sharedDefinitions, ...declaredTokens(css)])
  return referencedTokens(css).filter((token) => !defined.has(token))
}

describe('RI-4: kitchen CSS references only defined tokens', () => {
  const defined = definedTokens()

  it('accepts component state declared in the same stylesheet', () => {
    expect(defined.has('--ri4-local-component-state-fixture')).toBe(false)
    const css = '.component { --ri4-local-component-state-fixture: 8px; padding-bottom: var(--ri4-local-component-state-fixture); }'
    expect(undefinedTokens(css, defined)).toEqual([])
  })

  it('rejects a reference with no shared or same-file definition', () => {
    expect(defined.has('--ri4-undefined-local-reference-fixture')).toBe(false)
    const css = '.component { padding-bottom: var(--ri4-undefined-local-reference-fixture); }'
    expect(undefinedTokens(css, defined)).toEqual(['--ri4-undefined-local-reference-fixture'])
  })

  for (const cssPath of KITCHEN_CSS) {
    it(`every var(--…) in ${cssPath.replace(SRC, 'src')} is defined`, () => {
      const css = read(cssPath)
      expect(css.length, `expected ${cssPath} to exist and be non-empty`).toBeGreaterThan(0)
      const undefinedRefs = undefinedTokens(css, defined)
      expect(undefinedRefs, `undefined token(s) referenced: ${undefinedRefs.join(', ')}`).toEqual([])
    })
  }
})
