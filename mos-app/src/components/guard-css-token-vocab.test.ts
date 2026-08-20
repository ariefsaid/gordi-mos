/**
 * MECH-GUARD TOKEN-VOCAB — the whole component/shell/page CSS surface speaks the semantic
 * token vocabulary (structural layer; extends the kit-only kit-vocab.test.ts ratchet
 * beyond src/components/ui to ALL of src/components plus src/shell, src/pages/**.css and
 * src/styles/** (src/styles/tokens is the token DEFINITION layer and is excluded by design).
 *
 * Ported from the v4-redesign line (2026-08): the mechanism is v4's; the EXCEPTIONS ledger
 * below is REBUILT against this line's actual counts, because the two lines drifted apart
 * while the guard was absent. The ledger is the measured baseline the ratchet grinds down,
 * not an endorsement — every entry is pre-existing debt pinned at its current count.
 *
 * Owner catch: "multiple font sizes that feel untidy instead of deliberate" — size soup
 * happens one raw `font-size: 15px` at a time, below any reviewer's threshold of notice.
 * DESIGN.md §Typography is the declared ladder.
 *
 * Ratchet semantics: every raw (non-token) font-size/border-radius must appear in the
 * EXCEPTIONS ledger below with a count. New raw values FAIL. Counts may only go DOWN;
 * when a fix lands, the stale ledger entry must be pruned (the test fails on entries
 * whose actual count hit zero). Color literals have NO ledger — the scanned surface is
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

/**
 * The pinned pre-existing debt — a PAYDOWN QUEUE, not an allowlist. Entries only shrink
 * (the ratchet below fails on new debt AND on stale entries whose debt was paid); driving
 * the ledger to zero is tracked in #327.
 *
 * file → declaration → count. Measured on this line 2026-08-07:
 * 127 raw font-size + 29 raw border-radius declarations across 30 files. A value may only be
 * here because it predates the guard — deciding its fate (remap vs mint) is a design call,
 * not a mechanical one. New entries are a failure; counts only ratchet down.
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
  'src/components/dashboard/basis-chip.css': {
    'font-size: 11px': 1,
    'border-radius: 999px': 1,
  },
  'src/components/dashboard/chart-frame.css': {
    'font-size: 20px': 1,
    'font-size: 13px': 3,
  },
  'src/components/dashboard/data-table.css': {
    'font-size: 13px': 7,
    'font-size: 11px': 1,
    'font-size: 13.5px': 1,
    'font-size: 12px': 5,
    'border-radius: 4px': 1,
  },
  'src/components/dashboard/dq-badge.css': {
    'font-size: 11px': 1,
    'border-radius: 999px': 2,
  },
  'src/components/dashboard/freshness-label.css': {
    'font-size: 12px': 1,
  },
  'src/components/dashboard/kpi-tile.css': {
    'font-size: 12px': 1,
    'font-size: 10px': 1,
    'font-size: 23px': 2,
    'font-size: clamp(17px, 6.2vw, 23px)': 1,
    'font-size: 11px': 1,
    'border-radius: 999px': 1,
  },
  'src/components/dashboard/whats-coming-strip.css': {
    'font-size: 11px': 2,
    'font-size: 12.5px': 2,
    'font-size: 14px': 1,
  },
  'src/components/kitchen/kitchen-kpi-strip.css': {
    'font-size: 12.5px': 1,
    'font-size: 23px': 1,
    'font-size: 11px': 1,
    'font-size: 13px': 1,
  },
  'src/components/kitchen/qty-cell.css': {
    'font-size: 16px': 1,
    'font-size: 13px': 1,
    'font-size: 11px': 1,
  },
  'src/components/kitchen/report-missing-item.css': {
    'font-size: var(--text-size-xs)': 3,
  },
  'src/components/plan/fail-loud-badge.css': {
    'font-size: 12px': 1,
    // --ds-* is the foreign definition-layer family; a consumer var with a raw fallback.
    'border-radius: var(--ds-border-radius-pill, 999px)': 1,
  },
  'src/components/records/record-viewer.css': {
    // Two-mode kv sizing indirection with raw px fallbacks — needs its vars grounded in tokens.
    'font-size: var(--rec-kv-label-size, 12px)': 2,
    'font-size: var(--rec-kv-value-size, 13.5px)': 3,
  },
  'src/components/sales/daily-revenue-chart.css': {
    'font-size: 12px': 1,
    'border-radius: 999px': 1,
  },
  'src/components/tasks/TaskSurface.css': {
    'border-radius: 6px': 3,
  },
  'src/components/tasks/TasksWorkspace.css': {
    'border-radius: 6px': 2,
    'border-radius: 2px': 1,
  },
  'src/components/weekly/my-tasks-card.css': {
    'font-size: 11px': 2,
    'font-size: 15px': 2,
    'font-size: 14px': 1,
    'border-radius: 2px': 1,
  },
  'src/pages/budget-page.css': {
    'font-size: 11px': 1,
  },
  'src/pages/dev-views-page.css': {
    'font-size: 24px': 1,
    'font-size: 14px': 4,
    'font-size: 13px': 3,
    'font-size: 12px': 1,
  },
  'src/pages/kitchen-plan-page.css': {
    'font-size: 13px': 3,
    'font-size: 13.5px': 1,
    'font-size: 11px': 1,
    'font-size: 14px': 1,
  },
  'src/pages/kitchen-pushes-page.css': {
    'font-size: 12px': 3,
    'font-size: 11px': 1,
    'font-size: 16px': 1,
    'font-size: 14px': 1,
  },
  'src/pages/kitchen-review-page.css': {
    'font-size: 13px': 4,
    'font-size: 12px': 5,
    'font-size: 11px': 1,
    'font-size: 16px': 1,
    'font-size: 14px': 1,
    'border-radius: 999px': 1,
  },
  'src/pages/kitchen-stock-page.css': {
    'font-size: 13px': 1,
    'font-size: 12px': 1,
    'font-size: 14px': 1,
  },
  'src/pages/pricing-page.css': {
    'font-size: 11px': 1,
  },
  'src/pages/stacked-union-home.css': {
    'font-size: 18px': 1,
    'font-size: 13px': 1,
    'font-size: 11px': 1,
    'font-size: 14px': 2,
    'font-size: 16px': 1,
    'font-size: 15px': 1,
    'font-size: 17px': 1,
    'border-radius: 8px': 2,
    'border-radius: 10px': 1,
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
