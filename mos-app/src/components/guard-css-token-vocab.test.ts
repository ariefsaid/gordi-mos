/**
 * MECH-GUARD TOKEN-VOCAB — the whole component/shell/page CSS surface speaks the semantic
 * token vocabulary (structural layer; extends the kit-only kit-vocab.test.ts ratchet
 * beyond src/components/ui to ALL of src/components plus src/shell, plus — census DO-9/DO-10
 * guard C3 widening (SYS-5) — src/pages/**.css and src/styles/** (src/styles/tokens is the
 * token DEFINITION layer, foreign --ds-* family, and is excluded by design).
 *
 * Owner catch: "multiple font sizes that feel untidy instead of deliberate" — size soup
 * happens one raw `font-size: 15px` at a time, below any reviewer's threshold of notice.
 * Skill rule mechanized: ui-ux-pro-max ux-guidelines "Font Size Scale — Do: use a
 * consistent modular scale; Don't: random font sizes" (.claude/skills/ui-ux-pro-max,
 * ux-guidelines.csv, Typography); DESIGN.md §Typography is the declared ladder.
 *
 * Ratchet semantics: every raw (non-token) font-size/border-radius must appear in the
 * EXCEPTIONS ledger below with a count. New raw values FAIL. Counts may only go DOWN;
 * when a fix lands, the stale ledger entry must be pruned (the test fails on entries
 * whose actual count hit zero). Color literals have NO ledger — the scanned surface is
 * hex/rgb/hsl-clean today and must stay that way.
 *
 * The ledger entries themselves are the guard-6 "non-trivial" list: values with no
 * byte-identical token (16px, 23px, 12.5px …) that need a DESIGN decision — remap
 * (15px graduated: minted as --font-size-body-lg, OD-REDESIGN-91 #6/B4)
 * or mint a token — not a mechanical swap. They are pinned, not endorsed.
 * NOTE src/components/signals/signal-table-presentation.css: its former 11px sizes are
 * tokenized; its owner-approved side-stripe exception (see that file's comments) is a
 * border treatment and is deliberately untouched by this guard.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const SRC = resolve(process.cwd(), 'src')
const KIT_DIR = resolve(SRC, 'components/ui') // stricter kit-vocab.test.ts owns this dir
const TOKENS_DIR = resolve(SRC, 'styles/tokens') // token definitions (--ds-* source), not consumers

const FONT_SIZE_TOKENS = new Set([
  'page-title', 'heading', 'subheading', 'body-lg', 'body', 'control', 'mono', 'label', 'overline', 'micro',
  // 2026-07-29: `kpi-value` (23px) and `touch-input` (16px) are declared in index.css alongside the
  // rest of the ramp, but were missing from this set — so every consumer that spoke the vocabulary
  // CORRECTLY was reported as raw-value debt. The guard was failing the code for obeying it. Both
  // are real semantic tokens with a documented role (DESIGN.md "KPI values reuse ~23px/600"; the
  // 16px iOS zoom floor for touch inputs), so they belong here, not in EXCEPTIONS.
  'kpi-value', 'touch-input',
])

/**
 * The pinned pre-existing debt (guard-6 non-trivial list). file → declaration → count.
 * A value may only be here because it has NO byte-identical semantic token — deciding its
 * fate (remap vs mint) is a design-architect call, not a mechanical one.
 */
const EXCEPTIONS: Record<string, Record<string, number>> = {
  'src/components/collection-grammar.css': {
    'border-radius: 2px': 1,
  },
  'src/components/command/command-menu.css': {
    // Foreign token family — the command menu speaks --text-size-*, not --font-size-*.
    'font-size: var(--text-size-sm)': 2,
    'font-size: var(--text-size-xxs)': 1,
    'font-size: var(--text-size-xs)': 4,
  },
  'src/components/kitchen/qty-cell.css': {
    'font-size: 16px': 1,
  },
  'src/components/records/record-viewer.css': {
    // Two-mode kv sizing indirection with raw px fallbacks — needs its vars grounded in tokens.
    'font-size: var(--rec-kv-label-size, 12px)': 2,
    'font-size: var(--rec-kv-value-size, 13.5px)': 3,
  },
  // signal-record.css raw font-sizes (12.5px ×2, 14.5px ×1) were paid off by the OD-REDESIGN-90
  // anatomy rewrite — every region now speaks var(--font-size-*). Ledger entry pruned (ratchet).
  // The former 15px family (46 uses across this surface) was paid off wholesale by the
  // OD-REDESIGN-91 #6/B4 mint of --font-size-body-lg — the ratchet's biggest single payoff.
  'src/components/tasks/TaskSurface.css': {
    'border-radius: 6px': 3,
  },
  'src/components/tasks/TasksWorkspace.css': {
    'border-radius: 6px': 2,
    'border-radius: 2px': 1,
  },
}

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

describe('GUARD-VOCAB: all component + shell CSS speaks the token vocabulary (ratchet)', () => {
  const files = scannedFiles()

  it('GUARD-VOCAB: finds the CSS surface to police (guard the guard)', () => {
    expect(files.length).toBeGreaterThanOrEqual(45)
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
