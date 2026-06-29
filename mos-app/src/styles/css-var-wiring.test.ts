// CSS wiring guard — catches the "silent reference that never resolves" class of bug.
//
// CSS custom properties fail SILENTLY: `var(--typo)` with no definition and no fallback
// resolves to nothing (or `initial`) — no build error, no lint error, no test failure.
// This bit us twice: `--radius-full` (undefined → border-radius:0 → every status tag square)
// and the DM Sans family-name mismatch. This guard fails the suite if any .css file
// references a `var(--token)` that is neither defined anywhere in src CSS nor given a fallback.
//
// Scope: .css files only — .tsx/.ts use template-literal var() (`var(--ds-bg-${color})`) which
// is dynamic and can't be statically resolved; CSS has no interpolation, so every var() there
// is a literal token that MUST resolve. (Tailwind @theme `--color-*` + the token layers are all
// .css, so the definition set is complete.)
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

function allCss(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e)
    if (statSync(f).isDirectory()) allCss(f, acc)
    else if (e.endsWith('.css')) acc.push(f)
  }
  return acc
}

describe('CSS var() wiring — every referenced custom property resolves', () => {
  const root = resolve(process.cwd(), 'src')
  const files = allCss(root)
  // Strip CSS comments — they contain illustrative text like `var(--ds-*)` that isn't a real reference.
  const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
  const sources = files.map(f => ({ f, css: stripComments(readFileSync(f, 'utf8')) }))

  // 1. every defined custom property (--x: …)
  const defined = new Set<string>()
  for (const { css } of sources) {
    for (const m of css.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1])
  }

  it('has no undefined var(--token) reference without a fallback', () => {
    const orphans: string[] = []
    for (const { f, css } of sources) {
      // var( --token  [, fallback] )  — capture token + whether a comma (fallback) follows.
      for (const m of css.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
        const token = m[1]
        const hasFallback = !!m[2]
        if (!defined.has(token) && !hasFallback) {
          orphans.push(`${token}  (in ${f.replace(root + '/', '')})`)
        }
      }
    }
    expect(orphans, `Undefined var() with no fallback — these render to nothing:\n${orphans.join('\n')}`).toEqual([])
  })

  it('has a definition for the load-bearing font + radius tokens (regression anchors)', () => {
    // The two tokens whose silent failure caused the worst regressions.
    for (const t of ['--font-sans', '--radius-pill', '--ds-font-family']) {
      expect(defined.has(t), `${t} must be defined`).toBe(true)
    }
    // And no .css may reference the dangling alias that used to square every tag.
    const all = sources.map(s => s.css).join('\n')
    expect(all.includes('var(--radius-full)'), '--radius-full was undefined → 0px; do not reintroduce it').toBe(false)
  })

  it('--radius-lg is 12px (0.75rem) per DESIGN.md OD-P3-10 — guards the 8px card-radius regression', () => {
    // A 2026-06-20 "mockup" tweak silently overrode cards to 8px, contradicting DESIGN.md (which
    // mandates 12px for cards/containers/overlays) until the owner caught it. Lock the source value.
    const all = sources.map(s => s.css).join('\n')
    const m = all.match(/--radius-lg:\s*([^;]+);/)
    expect(m, '--radius-lg must be defined').toBeTruthy()
    expect(m![1].trim(), '--radius-lg must be 0.75rem (12px), not 0.5rem (8px)').toBe('0.75rem')
  })
})
