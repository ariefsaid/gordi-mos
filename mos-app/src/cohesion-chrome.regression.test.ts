// Cohesion program — OVERLAY-CHROME half, ported from the v4-redesign line and adapted to
// this line's actual token/file state. Locking tests for the deduplicated overlay/dialog
// chrome: one z-index tier scale, one scrim token + `.scrim` utility, one CloseIcon,
// duration tokens, focus-visible normalization, one modal owner. Mirrors the
// source-scan/CSS-lock pattern of consistency.regression.test.tsx. AC-ids as CHROME-* so
// `grep -r CHROME-XXX` finds the proof.
//
// COUPLING IS THE POINT: these assertions pin exact class names, file paths, import
// spellings and the canonical SVG close path on purpose — they are conformance guards
// locking ONE canonical implementation of the shared chrome. A refactor that changes the
// canon must update this guard deliberately in the same change, never drift past it.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

const SRC = resolve(process.cwd(), 'src')

function readSrc(rel: string): string {
  return readFileSync(resolve(SRC, rel), 'utf8')
}

/** Recursively list non-test source files under `dir` matching any of `exts`. */
function listSource(dir: string, exts: string[], acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) listSource(full, exts, acc)
    else if (exts.some((e) => full.endsWith(e)) && !/\.test\.(ts|tsx)$/.test(full)) acc.push(full)
  }
  return acc
}

function srcRel(path: string): string {
  return path.slice(SRC.length + 1).replaceAll('\\', '/')
}

const stripCss = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
/** Block comments, then line comments (not inside a string/URL) — for .tsx scans. */
const stripTsx = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
    .join('\n')

// ════════════════════════════════════════════════════════════════════════════
// CHROME-Z: ONE documented z-index tier scale. The tier ordering GUARANTEES a
// modal/confirm always paints above any drawer it can be launched from.
// ════════════════════════════════════════════════════════════════════════════
describe('CHROME-Z: z-index tier scale', () => {
  const index = stripCss(readSrc('index.css'))

  function tier(name: string): number {
    const m = index.match(new RegExp(`--${name}:\\s*([0-9]+)`))
    expect(m, `--${name} must be defined in index.css`).toBeTruthy()
    return Number(m![1])
  }

  it('CHROME-Z: defines the five overlay tiers as CSS vars', () => {
    for (const t of ['z-sticky', 'z-popover', 'z-drawer', 'z-modal', 'z-toast']) {
      expect(index).toMatch(new RegExp(`--${t}:\\s*[0-9]+`))
    }
  })

  it('CHROME-Z: tiers ascend sticky < popover < drawer < modal < toast', () => {
    const sticky = tier('z-sticky')
    const popover = tier('z-popover')
    const drawer = tier('z-drawer')
    const modal = tier('z-modal')
    const toast = tier('z-toast')
    expect(sticky).toBeLessThan(popover)
    expect(popover).toBeLessThan(drawer)
    expect(drawer).toBeLessThan(modal)
    expect(modal).toBeLessThan(toast)
  })

  it('CHROME-Z: a modal/confirm outranks a drawer (fixes confirm-behind-drawer)', () => {
    expect(tier('z-modal')).toBeGreaterThan(tier('z-drawer'))
  })

  it('CHROME-Z: the drawer root uses --z-drawer (not a hard-coded 90)', () => {
    const css = stripCss(readSrc('styles/drawer.css'))
    expect(css).toMatch(/\.drawer-modal-root\s*\{[^}]*z-index:\s*var\(--z-drawer\)/)
    expect(css).not.toMatch(/\.drawer-modal-root\s*\{[^}]*z-index:\s*90\b/)
  })

  it('CHROME-Z: the shared modal root uses --z-modal', () => {
    const css = stripCss(readSrc('components/ui/modal-shell.css'))
    expect(css).toMatch(/\.modal-shell__scrim\s*\{[^}]*z-index:\s*var\(--z-modal\)/)
  })

  it('CHROME-Z: admin confirm/create/role dialogs use the modal tier, not a bare z-50', () => {
    for (const f of [
      'components/ui/confirm-dialog.tsx',
      'components/admin/create-person-dialog.tsx',
      'components/admin/role-editor.tsx',
      'pages/admin-users-page.tsx',
    ]) {
      const body = readSrc(f)
      expect(body, `${f} must not ship the bare Tailwind z-50 overlay`).not.toMatch(/className="fixed inset-0 z-50/)
      expect(body, `${f} must compose the shared modal tier`).toMatch(/<ModalShell/)
    }
  })

  it('CHROME-Z: no non-test .tsx hard-codes a numeric zIndex (all inline z-indexes speak var(--z-*))', () => {
    const offenders: string[] = []
    for (const f of listSource(SRC, ['.tsx'])) {
      const rel = srcRel(f)
      const body = stripTsx(readFileSync(f, 'utf8'))
      const m = body.match(/zIndex:\s*[0-9]+/)
      if (m) offenders.push(`${rel} — ${m[0]}`)
    }
    expect(offenders, 'inline zIndex must reference a tier var, e.g. zIndex: "var(--z-popover)"').toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════════════
// CHROME-SCRIM: ONE scrim token + ONE `.scrim` utility — a single deliberate
// modal dim that reads as a real dim.
// ════════════════════════════════════════════════════════════════════════════
describe('CHROME-SCRIM: one scrim token + utility', () => {
  const index = stripCss(readSrc('index.css'))

  it('CHROME-SCRIM: --scrim is defined once as a real navy dim (reconciled to 45%)', () => {
    const defs = [...index.matchAll(/--scrim:\s*([^;]+);/g)]
    expect(defs.length, 'exactly one --scrim definition').toBe(1)
    const val = defs[0][1]
    expect(val, '--scrim reads as a real dim on brand-navy').toMatch(/brand-navy/)
    expect(val, '--scrim reconciled to a 45% dim').toMatch(/45%/)
  })

  it('CHROME-SCRIM: a `.scrim` utility exists and paints the token', () => {
    const m = index.match(/\.scrim\s*\{([^}]*)\}/)
    expect(m, '.scrim utility must be defined in index.css').toBeTruthy()
    expect(m![1]).toMatch(/background:\s*var\(--scrim\)/)
  })

  it('CHROME-SCRIM: the shared modal scrim uses the shared token, not a one-off overlay', () => {
    const css = stripCss(readSrc('components/ui/modal-shell.css'))
    const m = css.match(/\.modal-shell__scrim\s*\{([^}]*)\}/)
    expect(m).toBeTruthy()
    expect(m![1]).toMatch(/background:\s*var\(--scrim\)/)
    expect(m![1]).not.toMatch(/--surface-overlay/)
  })

  it('CHROME-SCRIM: no overlay hand-rolls a foreground-45% scrim (all on the token)', () => {
    for (const f of ['components/tasks/TaskSurface.css', 'components/tasks/occurrence-assign-dialog.css']) {
      const css = stripCss(readSrc(f))
      expect(css, `${f} must not hand-roll a foreground-45% scrim`).not.toMatch(/foreground\)\s*45%/)
    }
  })

  it('CHROME-SCRIM: no non-test .tsx uses the Tailwind bg-foreground/40 scrim', () => {
    const offenders: string[] = []
    for (const f of listSource(SRC, ['.tsx'])) {
      const rel = srcRel(f)
      if (/bg-foreground\/40/.test(readFileSync(f, 'utf8'))) offenders.push(rel)
    }
    expect(offenders, 'use the .scrim utility, not bg-foreground/40').toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════════════
// CHROME-CLOSE: ONE CloseIcon in shell/icons.tsx, consumed via an
// accessible-name'd button. The delete-× in the checklist ▲▼× micro-cluster is
// NOT a dismiss and stays a raw glyph (documented exception).
// ════════════════════════════════════════════════════════════════════════════
describe('CHROME-CLOSE: one CloseIcon', () => {
  it('CHROME-CLOSE: shell/icons.tsx exports a CloseIcon with the canonical close path', () => {
    const icons = readSrc('shell/icons.tsx')
    expect(icons).toMatch(/export function CloseIcon/)
    expect(icons, 'canonical X path').toMatch(/M18 6 6 18M6 6l12 12/)
  })

  it('CHROME-CLOSE: no non-test .tsx (besides shell/icons.tsx) declares a local CloseIcon or inline close-X SVG', () => {
    const offenders: string[] = []
    for (const f of listSource(SRC, ['.tsx'])) {
      const rel = srcRel(f)
      if (rel === 'shell/icons.tsx') continue
      const body = readFileSync(f, 'utf8')
      if (/function CloseIcon\b/.test(body)) offenders.push(`${rel} (local CloseIcon)`)
      else if (/M18 6 6 18M6 6l12 12/.test(body)) offenders.push(`${rel} (inline close-X path)`)
      else if (/<line x1="18" y1="6" x2="6" y2="18"/.test(body)) offenders.push(`${rel} (inline close-X lines)`)
    }
    expect(offenders).toEqual([])
  })

  it('CHROME-CLOSE: the migrated close buttons render the shared CloseIcon', () => {
    for (const f of [
      'shell/signal-composer-host.tsx',
      'shell/mobile-drawer.tsx',
      'shell/record-panel-host.tsx',
      'components/tasks/task-surface.tsx',
      'components/tasks/task-drawer.tsx',
      'components/admin/role-editor.tsx',
    ]) {
      const body = readSrc(f)
      // imports the shared CloseIcon from the shell/icons module (absolute or shell-relative)
      expect(body, `${f} imports the shared CloseIcon from shell/icons`).toMatch(
        /import\s*\{[^}]*\bCloseIcon\b[^}]*\}\s*from\s*'(?:@\/shell\/icons|\.\/icons)'/,
      )
    }
  })

  it('CHROME-CLOSE: the migrated standalone dismiss buttons no longer render a raw ×/✕ glyph', () => {
    // Comments stripped: role-editor DOCUMENTS its header ✕ in prose, which is not a glyph.
    expect(stripTsx(readSrc('shell/signal-composer-host.tsx'))).not.toMatch(/>×<\/button>/)
    expect(stripTsx(readSrc('components/admin/role-editor.tsx'))).not.toMatch(/✕/)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// CHROME-DUR: transition-duration tokens. Hard-coded 120/150/160/180ms must
// reference the 3-tier --dur-* scale. Pre-existing raw uses are pinned in a
// ratchet ledger — new ones fail, counts only go down.
// ════════════════════════════════════════════════════════════════════════════
describe('CHROME-DUR: transition-duration tokens', () => {
  const index = stripCss(readSrc('index.css'))

  // Pinned pre-existing debt (measured 2026-08-07): five files still spell 120ms raw
  // instead of var(--dur-fast). Ratchet: a new raw duration anywhere fails; paying one
  // of these off must prune its entry.
  const DUR_EXCEPTIONS: Record<string, number> = {
    'components/tasks/TaskSurface.css': 1,
    'components/dashboard/data-table.css': 2,
    'components/dashboard/kpi-tile.css': 1,
    'components/kitchen/qty-cell.css': 2,
  }

  it('CHROME-DUR: index.css defines a --dur-* scale in ms', () => {
    for (const t of ['dur-fast', 'dur-med', 'dur-slow']) {
      expect(index, `--${t} must be defined in ms`).toMatch(new RegExp(`--${t}:\\s*[0-9]+ms`))
    }
  })

  it('CHROME-DUR: no non-test .css hard-codes a 120/150/160/180ms duration beyond the pinned ledger', () => {
    const offenders: string[] = []
    const stale: string[] = []
    const seen = new Map<string, number>()
    for (const f of listSource(SRC, ['.css'])) {
      const rel = srcRel(f)
      // index.css is the ONE definition home for the --dur-* scale (the ms literals live there).
      if (rel === 'index.css') continue
      const css = stripCss(readFileSync(f, 'utf8'))
      const count = [...css.matchAll(/\b(?:120|150|160|180)ms\b/g)].length
      if (count > 0) seen.set(rel, count)
      if (count > (DUR_EXCEPTIONS[rel] ?? 0)) {
        offenders.push(`${rel} — ×${count} (ledger allows ${DUR_EXCEPTIONS[rel] ?? 0})`)
      }
    }
    for (const [rel, allowed] of Object.entries(DUR_EXCEPTIONS)) {
      if (allowed > 0 && (seen.get(rel) ?? 0) === 0) stale.push(rel)
    }
    expect(offenders, 'these durations must reference var(--dur-*)').toEqual([])
    expect(stale, 'debt paid — delete these DUR_EXCEPTIONS entries so the ratchet tightens').toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════════════
// CHROME-FOCUS: focus-visible normalization. The global rule is +2px outline in
// --accent; keep -2 (inset) ONLY on documented dense row/cell affordances where
// an outward ring clips at the container edge; never swap the focus token off
// --accent/--ring (the One Blue).
// ════════════════════════════════════════════════════════════════════════════
describe('CHROME-FOCUS: focus-visible normalization', () => {
  // Dense row/cell affordances that legitimately keep an inset (-2px) ring.
  const DENSE_INSET_ALLOWLIST = new Set([
    '.task-row-link',
    '.th-sort-btn',
    '.mobile-task-options-trigger',
    '.inbox-row__button',
    // Shared Tasks/Signals sort affordance (collection-grammar.css) — same dense header
    // cell as .th-sort-btn; an outward ring clips at the header row edge.
    '.dt-sort-button',
  ])

  function focusRules(): { file: string; selector: string; body: string }[] {
    const out: { file: string; selector: string; body: string }[] = []
    for (const f of listSource(SRC, ['.css'])) {
      const css = stripCss(readFileSync(f, 'utf8'))
      for (const m of css.matchAll(/([.#][\w-]+)\s*:focus-visible\s*\{([^}]*)\}/g)) {
        out.push({ file: srcRel(f), selector: m[1], body: m[2] })
      }
    }
    return out
  }

  it('CHROME-FOCUS: no focus-visible rule swaps the token to --primary', () => {
    const offenders = focusRules()
      .filter((r) => /outline:[^;]*var\(--primary\)/.test(r.body))
      .map((r) => `${r.file} ${r.selector}`)
    expect(offenders, 'focus ring must stay --accent/--ring, never --primary').toEqual([])
  })

  it('CHROME-FOCUS: inbox-row focus ring is on --accent, not --primary', () => {
    const css = stripCss(readSrc('components/inbox/inbox.css'))
    const m = css.match(/\.inbox-row__button:focus-visible\s*\{([^}]*)\}/)
    expect(m).toBeTruthy()
    expect(m![1]).not.toMatch(/--primary/)
    expect(m![1]).toMatch(/var\(--accent\)/)
  })

  it('CHROME-FOCUS: an inset (-2px) ring only appears on documented dense row/cell selectors', () => {
    const offenders = focusRules()
      .filter((r) => /outline-offset:\s*-2px/.test(r.body))
      .filter((r) => !DENSE_INSET_ALLOWLIST.has(r.selector))
      .map((r) => `${r.file} ${r.selector}`)
    expect(offenders, 'these should normalize to +2 (they have cell room)').toEqual([])
  })

  it('CHROME-FOCUS: the roomy controls are normalized to +2 (no inset override left)', () => {
    const roomy: Record<string, string> = {
      'components/tasks/TasksWorkspace.css': '.task-card-link',
    }
    for (const [file, sel] of Object.entries(roomy)) {
      const css = stripCss(readSrc(file))
      const m = css.match(new RegExp(`\\${sel}:focus-visible\\s*\\{([^}]*)\\}`))
      expect(m, `${sel} focus rule in ${file}`).toBeTruthy()
      expect(m![1], `${sel} must not keep an inset ring`).not.toMatch(/outline-offset:\s*-2px/)
    }
  })
})

// ════════════════════════════════════════════════════════════════════════════
// CHROME-MODAL: one interaction owner for centered command/capture/confirm/form dialogs.
// ════════════════════════════════════════════════════════════════════════════
describe('CHROME-MODAL: modal consolidation', () => {
  it('CHROME-MODAL: ModalShell owns the only shared scrim, modal tier, focus, and Escape contract', () => {
    const body = readSrc('components/ui/modal-shell.tsx')
    const css = readSrc('components/ui/modal-shell.css')
    expect(body).toMatch(/export function ModalShell/)
    expect(body).toMatch(/className="modal-shell__scrim scrim"/)
    expect(body).toMatch(/document\.addEventListener\('keydown'/)
    expect(css).toMatch(/z-index:\s*var\(--z-modal\)/)
  })

  it('CHROME-MODAL: every centered overlay composes ModalShell and keeps no second keyboard listener', () => {
    const consumers = [
      'components/ui/confirm-dialog.tsx',
      'components/tasks/occurrence-assign-dialog.tsx',
      'components/admin/create-person-dialog.tsx',
      'components/admin/role-editor.tsx',
      'pages/admin-users-page.tsx',
      'components/command/command-menu.tsx',
      'shell/signal-composer-host.tsx',
    ]
    for (const file of consumers) {
      const body = readSrc(file)
      expect(body, `${file} must compose the shared shell`).toMatch(/<ModalShell/)
      expect(body, `${file} must not own a second document keydown listener`).not.toMatch(
        /document\.addEventListener\(['"]keydown/,
      )
    }
    expect(
      readSrc('components/admin/password-reveal.tsx'),
      'modal content must not retain its own Tab/focus document listener',
    ).not.toMatch(/document\.addEventListener\(['"]keydown/)
  })

  it('CHROME-MODAL: the admin ConfirmDialog module re-exports the shared primitive (no second copy)', () => {
    const body = readSrc('components/admin/confirm-dialog.tsx')
    expect(body).toMatch(/export \{ ConfirmDialog \} from '@\/components\/ui\/confirm-dialog'/)
    // the full component impl no longer lives here
    expect(body).not.toMatch(/function ConfirmDialog/)
  })

  it('CHROME-MODAL: ConfirmArchive composes the shared ConfirmDialog, not a bespoke overlay', () => {
    const body = readSrc('components/tasks/confirm-archive.tsx')
    expect(body).toMatch(/from '@\/components\/ui\/confirm-dialog'/)
    expect(body, 'no hand-rolled overlay markup').not.toMatch(/confirm-overlay|confirm-box/)
  })

  it('CHROME-MODAL: the bespoke .confirm-* overlay CSS is deleted from TaskSurface.css', () => {
    const css = stripCss(readSrc('components/tasks/TaskSurface.css'))
    expect(css).not.toMatch(/\.confirm-overlay\s*\{/)
    expect(css).not.toMatch(/\.confirm-box\s*\{/)
  })
})
