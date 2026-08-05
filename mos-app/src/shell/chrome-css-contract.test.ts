import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every bespoke class the shell chrome APPLIES must be DEFINED by a stylesheet in this app.
 *
 * This exists because the port already lost one: `mobile-drawer.tsx` applies `.scrim` for its
 * overlay, the `.scrim` utility lived in a part of the design payload that had not come across,
 * and the result was a drawer whose backdrop rendered fully transparent — the content behind it
 * never dimmed. Not one of the 2600+ unit tests could see it: jsdom computes no layout and
 * applies no stylesheet, so a class that resolves to nothing looks exactly like a class that
 * resolves correctly. A grep found it; this makes the grep permanent.
 *
 * Classes are DERIVED from the chrome source by prefix, not listed by hand, so a new bespoke
 * class is covered the moment it is written rather than when someone remembers to add it here.
 */

const SRC = resolve(__dirname, '..')
const SHELL = __dirname

// The chrome's own naming families. Tailwind utilities also contain hyphens, so a prefix list is
// what separates "ours" from "the framework's" — matching Tailwind here would be noise, and
// missing one of ours is the failure this test exists to prevent.
const CHROME_CLASS_PREFIXES = [
  'bottom-tab', 'mobile-drawer', 'mobile-action', 'rail-item', 'rail-count', 'rail-tooltip',
  'content-header', 'ch-', 'page-head', 'page-frame', 'scrim', 'tap-target-phone',
  // The record overlay/page chrome (#190). `drawer` covers the shared modal regime the record
  // panel host applies — the exact class family that had no stylesheet at the shell root before
  // this port, which is this test's own failure mode one layer up.
  'drawer', 'record-panel', 'record-page', 'record-split', 'overlay-companion',
]

/**
 * Classes applied for a reason other than styling, each with the reason. A DOM hook that a test
 * queries by is legitimate; it just must be a deliberate entry here rather than an oversight.
 */
const NOT_STYLED_BY_CSS: Record<string, string> = {
  'ctx-row': 'ContextRow styles the strip inline (its height collapses to 0 on a route whose head owns the context); the class is a query hook',
  'ctx-scope': 'inline flex/maxWidth — the crumb must never shrink, which is a per-element rule, not a shared one',
  'ctx-job': 'inline flex/minWidth, paired with ctx-scope above',
  'overlay-companion-host--phone-over-record':
    'a state hook, not a skin: at phone widths RecordPanelHost already selects its modal regime, so .drawer-modal-root owns the layering above an open record and the companion needs no rule of its own. The two DESKTOP companion layouts beside it are styled, which is what makes this one a deliberate blank rather than the missing-rule bug',
}

function cssSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') cssSources(full, out)
    } else if (entry.name.endsWith('.css')) {
      out.push(full)
    }
  }
  return out
}

function chromeSources(): string[] {
  return readdirSync(SHELL)
    .filter((f) => (f.endsWith('.tsx') || f.endsWith('.ts')) && !f.includes('.test.'))
    .map((f) => join(SHELL, f))
}

/** Class tokens appearing in a `className="…"` / `className={'…'}` literal in the chrome. */
function appliedClasses(): Set<string> {
  const found = new Set<string>()
  for (const file of chromeSources()) {
    const source = readFileSync(file, 'utf8')
    for (const [, literal] of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
      for (const token of (literal ?? '').split(/\s+/)) {
        if (token && CHROME_CLASS_PREFIXES.some((p) => token.startsWith(p))) found.add(token)
      }
    }
    // Class strings also reach className via helper joins ('rail-item', 'bottom-tab', …).
    for (const [, quoted] of source.matchAll(/'([a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*)*)'/g)) {
      for (const token of quoted.split(/\s+/)) {
        if (CHROME_CLASS_PREFIXES.some((p) => token.startsWith(p))) found.add(token)
      }
    }
  }
  return found
}

describe('shell chrome CSS contract', () => {
  const applied = [...appliedClasses(), ...Object.keys(NOT_STYLED_BY_CSS)].sort()
  const allCss = cssSources(SRC).map((f) => readFileSync(f, 'utf8')).join('\n')

  it('derives a real class list from the chrome source', () => {
    // Without this the loop below would pass vacuously if the source scan ever broke.
    expect(applied.length).toBeGreaterThanOrEqual(10)
    expect(applied).toContain('scrim')
    expect(applied).toContain('bottom-tab')
  })

  it.each(applied)('.%s is defined by a stylesheet, or declared inline-styled on purpose', (cls) => {
    if (cls in NOT_STYLED_BY_CSS) {
      expect(NOT_STYLED_BY_CSS[cls].length, `${cls} needs a real reason`).toBeGreaterThan(20)
      return
    }
    // A rule for the class: `.name` followed by a selector boundary.
    const rule = new RegExp(`\\.${cls.replace(/[-]/g, '\\-')}(?![a-zA-Z0-9_-])`)
    expect(rule.test(allCss), `.${cls} is applied by the chrome but no stylesheet defines it`).toBe(true)
  })
})
