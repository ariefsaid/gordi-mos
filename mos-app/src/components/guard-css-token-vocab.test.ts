/**
 * MECH-GUARD TOKEN-VOCAB — the whole component/shell/page CSS surface speaks the semantic
 * token vocabulary (structural layer; extends the kit-only kit-vocab.test.ts ratchet
 * beyond src/components/ui to ALL of src/components plus src/shell, src/pages/**.css and
 * src/styles/** (src/styles/tokens is the token DEFINITION layer and is excluded by design).
 *
 * The vocabulary guard scans the consumer surface directly. The paydown ledger is intentionally
 * empty: any raw declaration is now a failure rather than a pinned exception.
 *
 * Owner catch: "multiple font sizes that feel untidy instead of deliberate" — size soup
 * happens one raw `font-size: 15px` at a time, below any reviewer's threshold of notice.
 * DESIGN.md §Typography is the declared ladder.
 *
 * Ratchet semantics: every raw (non-token) font-size/border-radius fails immediately.
 * Color literals have NO ledger — the scanned surface is
 * hex/rgb/hsl-clean today and must stay that way.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const SRC = resolve(process.cwd(), 'src')
const KIT_DIR = resolve(SRC, 'components/ui') // stricter kit-vocab.test.ts owns this dir
const TOKENS_DIR = resolve(SRC, 'styles/tokens') // token definitions, not consumers

const FONT_SIZE_TOKENS = new Set([
  'page-title', 'heading', 'subheading', 'body-lg', 'body', 'control', 'mono', 'label', 'overline', 'micro',
  // Real semantic tokens declared in index.css alongside the rest of the ramp: the ~23px/600
  // KPI numeral (DESIGN.md) and the 16px iOS zoom floor for touch inputs.
  'kpi-value', 'touch-input',
])

/** No exceptions: keep the consumer surface on semantic tokens. */
const EXCEPTIONS: Record<string, Record<string, number>> = {}


const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

function cssFilesUnder(dir: string, skipDir?: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (skipDir && resolve(full) === skipDir) continue
      out.push(...cssFilesUnder(full, skipDir))
    } else if (entry.endsWith('.css')) {
      out.push(full)
    }
  }
  return out
}

function scannedFiles(): { rel: string; css: string }[] {
  const files = [
    ...cssFilesUnder(resolve(SRC, 'components'), KIT_DIR),
    ...cssFilesUnder(resolve(SRC, 'shell')),
    ...cssFilesUnder(resolve(SRC, 'pages')),
    ...cssFilesUnder(resolve(SRC, 'styles'), TOKENS_DIR),
  ]
  return files.map((f) => ({
    rel: relative(process.cwd(), f),
    css: stripComments(readFileSync(f, 'utf8')),
  }))
}

const isTokenFontSize = (v: string): boolean => {
  if (v === 'inherit') return true
  // These component aliases are grounded in semantic tokens at their definition site.
  if (v === 'var(--rec-kv-label-size)' || v === 'var(--rec-kv-value-size)') return true
  const tok = v.match(/^var\(--font-size-([a-z-]+)\)$/)
  if (tok) return FONT_SIZE_TOKENS.has(tok[1])
  // clamp(min, preferred, max) — a fit-to-width formula (min/preferred stay literal by design)
  // is still token-governed if its size argument (the max) is a recognised font-size token.
  const clamp = v.match(/^clamp\(([\s\S]+)\)$/)
  if (clamp) {
    const args = clamp[1].split(',').map((a) => a.trim())
    return isTokenFontSize(args[args.length - 1])
  }
  return false
}
const isTokenRadius = (v: string) =>
  v.includes('var(--radius') ||
  v.split(/\s+/).every((p) => p === '0' || p === '50%' || p === 'inherit')

/** All raw (non-token) font-size/border-radius declarations per file. */
function rawDeclarations(): Map<string, Map<string, number>> {
  const found = new Map<string, Map<string, number>>()
  for (const { rel, css } of scannedFiles()) {
    const bump = (decl: string) => {
      const perFile = found.get(rel) ?? new Map<string, number>()
      perFile.set(decl, (perFile.get(decl) ?? 0) + 1)
      found.set(rel, perFile)
    }
    for (const m of css.matchAll(/font-size:\s*([^;]+);/g)) {
      const v = m[1].trim()
      if (!isTokenFontSize(v)) bump(`font-size: ${v}`)
    }
    for (const m of css.matchAll(/border-radius:\s*([^;]+);/g)) {
      const v = m[1].trim()
      if (!isTokenRadius(v)) bump(`border-radius: ${v}`)
    }
  }
  return found
}

describe('GUARD-VOCAB: all component + shell + page CSS speaks the token vocabulary (ratchet)', () => {
  const files = scannedFiles()

  it('GUARD-VOCAB: finds the CSS surface to police (guard the guard)', () => {
    expect(files.length).toBeGreaterThanOrEqual(60)
  })

  it('GUARD-VOCAB-NEW: no raw font-size/border-radius beyond the pinned ledger (new debt is a failure)', () => {
    const offenders: string[] = []
    for (const [rel, decls] of rawDeclarations()) {
      for (const [decl, count] of decls) {
        const allowed = EXCEPTIONS[rel]?.[decl] ?? 0
        if (count > allowed) {
          offenders.push(`${rel} — ${decl} ×${count} (ledger allows ${allowed})`)
        }
      }
    }
    expect(
      offenders,
      'raw value not covered by the ledger — use a var(--font-size-*)/var(--radius-*) token, or take the design decision to the ledger explicitly',
    ).toEqual([])
  })

  it('GUARD-VOCAB-RATCHET: ledger entries whose debt was paid must be pruned (counts only go down)', () => {
    const found = rawDeclarations()
    const stale: string[] = []
    for (const [rel, decls] of Object.entries(EXCEPTIONS)) {
      for (const decl of Object.keys(decls)) {
        if ((found.get(rel)?.get(decl) ?? 0) === 0) stale.push(`${rel} — ${decl}`)
      }
    }
    expect(stale, 'debt paid — delete these ledger entries so the ratchet tightens').toEqual([])
  })

  it('GUARD-VOCAB-EMPTY: the paydown ledger is closed', () => {
    expect(Object.keys(EXCEPTIONS)).toEqual([])
  })

  it('GUARD-VOCAB-COLOR: zero raw hex/rgb()/hsl() color literals — no ledger, no exceptions', () => {
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
