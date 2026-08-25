/**
 * MECH-GUARD TOKEN-VOCAB — the whole component/shell/page/auth surface speaks the semantic
 * token vocabulary (structural layer; extends the kit-only kit-vocab.test.ts ratchet
 * beyond src/components/ui to ALL of src/components plus src/shell, src/pages, src/auth and
 * src/styles/**.css (src/styles/tokens is the token DEFINITION layer and is excluded by design).
 *
 * #425: the guard also scans INLINE TSX STYLES (style={{ fontSize: … }}) in every scanned root
 * (auth included). Semantics: value-collision — an inline fontSize whose value equals a ladder
 * token's px value (parsed live from src/index.css) is a token written as a literal. touch-input
 * (16px) is excluded from the TSX police set: DESIGN.md §Typography restricts it to tapped
 * text/number inputs, which a static scan cannot verify; a raw 16 is not proof of token-dodging.
 * src/shell TSX literals are pinned in TSX_EXCEPTIONS (mid-port in another lane); counts only
 * go down. The CSS paydown ledger stays closed.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const SRC = resolve(process.cwd(), 'src')
const KIT_DIR = resolve(SRC, 'components/ui') // stricter kit-vocab.test.ts owns this dir
const TOKENS_DIR = resolve(SRC, 'styles/tokens') // token definitions, not consumers
const AUTH_DIR = resolve(SRC, 'auth')

const FONT_SIZE_TOKENS = new Set([
  'page-title', 'heading', 'subheading', 'body-lg', 'body', 'control', 'mono', 'label', 'overline', 'micro',
  // Real semantic tokens declared in index.css alongside the rest of the ramp: the ~23px/600
  // KPI numeral (DESIGN.md) and the 16px iOS zoom floor for touch inputs.
  'kpi-value', 'touch-input',
])

/** No exceptions: keep the consumer surface on semantic tokens. */
const EXCEPTIONS: Record<string, Record<string, number>> = {}


const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** value→token for every ladder font-size, parsed live from index.css. A future type-scale
 * change re-aims this guard automatically (#425). touch-input excluded per DESIGN.md (D1). */
function ladderPxIndex(): Map<string, string> {
  const css = readFileSync(resolve(SRC, 'index.css'), 'utf8')
  const out = new Map<string, string>()
  for (const m of css.matchAll(/--font-size-([a-z-]+):\s*([\d.]+)px/g)) {
    if (m[1] === 'touch-input') continue
    out.set(m[2], m[1])
  }
  return out
}
const LADDER_PX = ladderPxIndex()

function tsxFilesUnder(dir: string, skipDir?: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (skipDir && resolve(full) === skipDir) continue
      out.push(...tsxFilesUnder(full, skipDir))
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

function scannedTsx(): { rel: string; code: string }[] {
  const files = [
    ...tsxFilesUnder(AUTH_DIR),
    ...tsxFilesUnder(resolve(SRC, 'components'), KIT_DIR),
    ...tsxFilesUnder(resolve(SRC, 'shell')),
    ...tsxFilesUnder(resolve(SRC, 'pages')),
  ]
  return files.map((f) => ({
    rel: relative(process.cwd(), f),
    // Strip block comments then line comments: a commented-out `fontSize: '18px'`
    // (admin/role-editor.tsx documents one) is not a declaration. Strings containing "//"
    // lose their tails — harmless, the scan only regexes fontSize/borderRadius.
    code: readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, ''),
  }))
}

/** Raw inline fontSize/borderRadius in TSX style objects, keyed like the CSS side. */
function rawInlineDeclarations(): Map<string, Map<string, number>> {
  const found = new Map<string, Map<string, number>>()
  for (const { rel, code } of scannedTsx()) {
    const bump = (decl: string) => {
      const perFile = found.get(rel) ?? new Map<string, number>()
      perFile.set(decl, (perFile.get(decl) ?? 0) + 1)
      found.set(rel, perFile)
    }
    for (const m of code.matchAll(/fontSize:\s*(?:'([\d.]+)px'|([\d.]+))/g)) {
      const v = m[1] ?? m[2]
      if (LADDER_PX.has(v)) bump(`fontSize: ${v}`)
    }
    for (const m of code.matchAll(/borderRadius:\s*(?:'([^']+)'|([\d.]+))/g)) {
      const v = m[1] ?? m[2]
      if (!(v.includes('var(--radius') || v === '0' || v === '50%' || v === 'inherit')) {
        bump(`borderRadius: ${v}`)
      }
    }
  }
  return found
}

/** TSX inline-style ledger (#425): pinned debt in src/shell only — that tree is mid-port in
 * another lane. Counts only go down; GUARD-VOCAB-TSX-RATCHET forces pruning when paid. Every
 * root this lane owns is pinned at zero (absent) — new debt anywhere fails immediately. */
const TSX_EXCEPTIONS: Record<string, Record<string, number>> = {
  'src/shell/context-row.tsx': { 'fontSize: 13': 2 },
  'src/shell/page-head.tsx': { 'fontSize: 24': 1, 'fontSize: 14': 1 },
  'src/shell/user-chip.tsx': { 'fontSize: 11': 2 },
  'src/shell/top-bar.tsx': { 'fontSize: 11': 1 },
}

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
    // #447 review: the TSX scan covered src/auth but the CSS side skipped it — close the gap.
    ...cssFilesUnder(resolve(SRC, 'auth')),
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

  it('GUARD-VOCAB: finds the TSX surface to police (guard the guard)', () => {
    expect(scannedTsx().length).toBeGreaterThanOrEqual(140)
  })

  it('GUARD-VOCAB-TSX-LADDER: police set parsed from index.css (guard the guard)', () => {
    expect(LADDER_PX.get('20')).toBe('heading')
    expect(LADDER_PX.get('15')).toBe('body-lg')
    expect(LADDER_PX.get('12')).toBe('label')
    expect(LADDER_PX.get('11')).toBe('overline')
    expect(LADDER_PX.has('16')).toBe(false) // touch-input: mechanical-only, not policed by value
  })

  it('GUARD-VOCAB-TSX: inline fontSize/borderRadius speak the ladder (value-collision)', () => {
    const offenders: string[] = []
    for (const [rel, decls] of rawInlineDeclarations()) {
      for (const [decl, count] of decls) {
        const allowed = TSX_EXCEPTIONS[rel]?.[decl] ?? 0
        if (count > allowed) {
          offenders.push(`${rel} — ${decl} ×${count} (ledger allows ${allowed})`)
        }
      }
    }
    expect(
      offenders,
      'inline style literal collides with a ladder token — write var(--font-size-<token>) instead, or take the design decision to the ledger explicitly',
    ).toEqual([])
  })

  it('GUARD-VOCAB-TSX-RATCHET: paid TSX ledger entries must be pruned (counts only go down)', () => {
    const found = rawInlineDeclarations()
    const stale: string[] = []
    for (const [rel, decls] of Object.entries(TSX_EXCEPTIONS)) {
      for (const decl of Object.keys(decls)) {
        if ((found.get(rel)?.get(decl) ?? 0) === 0) stale.push(`${rel} — ${decl}`)
      }
    }
    expect(stale, 'debt paid — delete these ledger entries so the ratchet tightens').toEqual([])
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
