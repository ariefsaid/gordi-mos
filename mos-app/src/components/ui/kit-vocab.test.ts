// Kit vocabulary guard (v3 kit-normalize). Source-scan CSS-lock in the cohesion-chrome
// style: the primitive kit (src/components/ui/*.css) may only speak the SEMANTIC token
// vocabulary — no raw font-size px, no raw radius px, no raw hex/rgb/hsl. This is what
// makes the "deliberate scale" enforceable instead of a one-time cleanup that re-rots.
// Owner complaint 2026-07: "multiple font sizes that feel untidy instead of deliberate."
// AC-ids as KIT-VOCAB-* so `grep -r KIT-VOCAB` finds the proof.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const SRC = resolve(process.cwd(), 'src')
const UI_DIR = resolve(SRC, 'components/ui')

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Every non-test .css directly under components/ui. */
function uiCssFiles(): { rel: string; css: string }[] {
  return readdirSync(UI_DIR)
    .filter((f) => f.endsWith('.css'))
    .map((f) => ({ rel: `components/ui/${f}`, css: stripComments(readFileSync(join(UI_DIR, f), 'utf8')) }))
}

// The declared, deliberate type ladder (index.css SEMANTIC layer). DESIGN.md §Typography
// is the authority: page-title 24 / heading 20 / subheading 18 / body 14 / control 13.5 /
// mono 13 / label 12 / overline 11 / micro 10.
const FONT_SIZE_TOKENS = new Set([
  'page-title', 'heading', 'subheading', 'body', 'control', 'mono', 'label', 'overline', 'micro',
])
const RADIUS_VALUES = new Set([
  'var(--radius-xs)', 'var(--radius-sm)', 'var(--radius-md)', 'var(--radius-lg)', 'var(--radius-pill)',
  '50%', // circles (avatar-rounded, toggle knob)
  'inherit',
])

describe('KIT-VOCAB: the primitive kit speaks only the semantic token vocabulary', () => {
  const files = uiCssFiles()

  it('KIT-VOCAB: finds the kit CSS to police', () => {
    // Guard the guard: if the dir moves/empties, this test must fail loudly, not vacuously pass.
    expect(files.length).toBeGreaterThanOrEqual(10)
  })

  it('KIT-VOCAB-FONT: every font-size in ui/*.css is a var(--font-size-*) token in the declared ladder', () => {
    const offenders: string[] = []
    for (const { rel, css } of files) {
      for (const m of css.matchAll(/font-size:\s*([^;]+);/g)) {
        const value = m[1].trim()
        if (value === 'inherit') continue
        const tok = value.match(/^var\(--font-size-([a-z-]+)\)$/)
        if (!tok || !FONT_SIZE_TOKENS.has(tok[1])) offenders.push(`${rel} — font-size: ${value}`)
      }
    }
    expect(offenders, 'raw/undeclared font-size — use a var(--font-size-*) token').toEqual([])
  })

  it('KIT-VOCAB-RADIUS: every border-radius in ui/*.css is a radius token (or 50% for circles)', () => {
    const offenders: string[] = []
    for (const { rel, css } of files) {
      for (const m of css.matchAll(/border-radius:\s*([^;]+);/g)) {
        const value = m[1].trim()
        // allow multi-value seam radii composed entirely of radius tokens / 0 (e.g. card-seam)
        const parts = value.split(/\s+/)
        const ok = RADIUS_VALUES.has(value) || parts.every((p) => RADIUS_VALUES.has(p) || p === '0')
        if (!ok) offenders.push(`${rel} — border-radius: ${value}`)
      }
    }
    expect(offenders, 'raw radius — use a var(--radius-*) token (or 50% for a circle)').toEqual([])
  })

  it('KIT-VOCAB-COLOR: no raw hex or rgb()/hsl() color literal in ui/*.css (all colors via token)', () => {
    const offenders: string[] = []
    for (const { rel, css } of files) {
      const hex = css.match(/#[0-9a-fA-F]{3,8}\b/)
      if (hex) offenders.push(`${rel} — hex ${hex[0]}`)
      const fn = css.match(/\b(?:rgb|rgba|hsl|hsla)\(/)
      if (fn) offenders.push(`${rel} — ${fn[0]}`)
    }
    expect(offenders, 'raw color literal — reference a semantic color token via var()').toEqual([])
  })
})

describe('KIT-VOCAB-TOKENS: the semantic layer the kit consumes is actually defined', () => {
  const index = stripComments(readFileSync(resolve(SRC, 'index.css'), 'utf8'))

  it('KIT-VOCAB-TOKENS: every declared --font-size-* token is defined in index.css with a px value', () => {
    for (const name of FONT_SIZE_TOKENS) {
      expect(index, `--font-size-${name} must be defined`).toMatch(
        new RegExp(`--font-size-${name}:\\s*[0-9.]+px`),
      )
    }
  })

  it('KIT-VOCAB-TOKENS: the chip/pill/tag inline-pad alignment affordances are defined', () => {
    expect(index).toMatch(/--pill-inline-pad:\s*[0-9]+px/)
    expect(index).toMatch(/--tag-inline-pad:\s*[0-9]+px/)
  })

  it('KIT-VOCAB-TOKENS: control size is 13.5px and body is 14px (DESIGN.md §Typography ladder)', () => {
    expect(index).toMatch(/--font-size-control:\s*13\.5px/)
    expect(index).toMatch(/--font-size-body:\s*14px/)
  })
})
