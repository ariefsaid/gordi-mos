// Cohesion program — OVERLAY-CHROME half (docs/reviews/cohesion-debt-2026-07-19.md).
// Locking tests for the deduplicated overlay/dialog chrome: one z-index tier scale,
// one scrim token + `.scrim` utility, one CloseIcon, duration tokens, focus-visible
// normalization. Mirrors the source-scan/CSS-lock pattern of consistency.regression.test.tsx
// (RI-* invariants). AC-ids as CHROME-* so `grep -r CHROME-XXX` finds the proof.
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

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

// ════════════════════════════════════════════════════════════════════════════
// CHROME-Z: ONE documented z-index tier scale (cohesion-debt item #3). The ad-hoc
// ladder (20/31/40/50/90/100/9999) collapses onto CSS-var tiers; the tier ordering
// GUARANTEES a modal/confirm always paints above any drawer it can be launched from
// (the real bug: an admin confirm at z-50 opened *behind* a drawer at z-90).
// ════════════════════════════════════════════════════════════════════════════
describe('CHROME-Z: z-index tier scale', () => {
  const index = stripComments(readSrc('index.css'))

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
    const css = stripComments(readSrc('styles/drawer.css'))
    expect(css).toMatch(/\.drawer-modal-root\s*\{[^}]*z-index:\s*var\(--z-drawer\)/)
    expect(css).not.toMatch(/\.drawer-modal-root\s*\{[^}]*z-index:\s*90\b/)
  })

  it('CHROME-Z: the command menu root uses --z-modal', () => {
    const css = stripComments(readSrc('components/command/command-menu.css'))
    expect(css).toMatch(/\.cm-root\s*\{[^}]*z-index:\s*var\(--z-modal\)/)
  })

  it('CHROME-Z: admin confirm/create/role dialogs use the modal tier, not a bare z-50', () => {
    for (const f of ['components/admin/confirm-dialog.tsx', 'components/admin/create-person-dialog.tsx', 'components/admin/role-editor.tsx']) {
      const body = readSrc(f)
      expect(body, `${f} must not ship the bare Tailwind z-50 overlay`).not.toMatch(/className="fixed inset-0 z-50/)
      expect(body, `${f} must reference the --z-modal tier`).toMatch(/var\(--z-modal\)/)
    }
  })

  it('CHROME-Z: the 9999 admin-portal outlier is capped onto the tier scale', () => {
    const body = readSrc('components/admin/user-table.tsx')
    expect(body, 'the 9999 portal z-index must be capped onto a tier var').not.toMatch(/zIndex:\s*9999/)
    expect(body).toMatch(/var\(--z-popover\)/)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// CHROME-SCRIM: ONE scrim token + ONE `.scrim` utility (cohesion-debt item #1).
// Four scrims (--surface-overlay 72%, --scrim 32%, foreground 45%, Tailwind 40%)
// reconcile onto a single deliberate modal dim that reads as a real dim.
// ════════════════════════════════════════════════════════════════════════════
describe('CHROME-SCRIM: one scrim token + utility', () => {
  const index = stripComments(readSrc('index.css'))

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

  it('CHROME-SCRIM: the ⌘K scrim uses the shared token, not the one-off --surface-overlay', () => {
    const css = stripComments(readSrc('components/command/command-menu.css'))
    const m = css.match(/\.cm-scrim\s*\{([^}]*)\}/)
    expect(m).toBeTruthy()
    expect(m![1]).toMatch(/background:\s*var\(--scrim\)/)
    expect(m![1]).not.toMatch(/--surface-overlay/)
  })

  it('CHROME-SCRIM: no overlay hand-rolls a foreground-45% scrim (all on the token)', () => {
    for (const f of ['components/tasks/TaskSurface.css', 'components/tasks/occurrence-assign-dialog.css']) {
      const css = stripComments(readSrc(f))
      expect(css, `${f} must not hard-roll a foreground-45% scrim`).not.toMatch(/foreground\)\s*45%/)
    }
  })

  it('CHROME-SCRIM: no non-test overlay uses the Tailwind bg-foreground/40 scrim', () => {
    for (const f of ['shell/mobile-drawer.tsx', 'components/assistant/AssistantPanel.tsx']) {
      expect(readSrc(f), `${f} must use the .scrim utility, not bg-foreground/40`).not.toMatch(/bg-foreground\/40/)
    }
  })
})

// ════════════════════════════════════════════════════════════════════════════
// CHROME-CLOSE: ONE CloseIcon (cohesion-debt item #2). Four close glyphs (raw ×,
// raw ✕, 16px SVG, 18px SVG) collapse onto a single CloseIcon in shell/icons.tsx,
// consumed via an accessible-name'd button. The delete-× in the checklist ▲▼×
// micro-cluster is NOT a dismiss and stays a raw glyph (documented exception).
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
      // a locally-declared CloseIcon component, or either inline close-X glyph form
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
      'components/tasks/task-drawer-header.tsx',
      'components/tasks/task-surface.tsx',
      'components/assistant/AssistantPanel.tsx',
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
    // signal-composer-host + role-editor were raw-text glyphs; now icon buttons.
    expect(readSrc('shell/signal-composer-host.tsx')).not.toMatch(/>×<\/button>/)
    expect(readSrc('components/admin/role-editor.tsx')).not.toMatch(/✕/)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// CHROME-DUR: transition-duration tokens (cohesion-debt item #5). Duration tokens
// existed but NOTHING used them; hard-coded 120/150/160/180ms sprawled (a drawer's
// scrim 150 vs its own sheet 180). Collapse onto a 3-tier app scale (--dur-fast /
// --dur-med / --dur-slow); the 160 oddball folds onto 150.
// ════════════════════════════════════════════════════════════════════════════
describe('CHROME-DUR: transition-duration tokens', () => {
  const index = stripComments(readSrc('index.css'))

  it('CHROME-DUR: index.css defines a --dur-* scale in ms', () => {
    for (const t of ['dur-fast', 'dur-med', 'dur-slow']) {
      expect(index, `--${t} must be defined in ms`).toMatch(new RegExp(`--${t}:\\s*[0-9]+ms`))
    }
  })

  it('CHROME-DUR: no non-test .css hard-codes a 120/150/160/180ms duration', () => {
    const offenders: string[] = []
    for (const f of listSource(SRC, ['.css'])) {
      const rel = srcRel(f)
      // index.css is the ONE definition home for the --dur-* scale (the ms literals live there).
      if (rel === 'index.css') continue
      const css = stripComments(readFileSync(f, 'utf8'))
      const m = css.match(/\b(?:120|150|160|180)ms\b/)
      if (m) offenders.push(`${rel} — ${m[0]}`)
    }
    expect(offenders, 'these durations must reference var(--dur-*)').toEqual([])
  })

  it('CHROME-DUR: the AssistantPanel slide uses the token, not a raw 180ms', () => {
    const body = readSrc('components/assistant/AssistantPanel.tsx')
    expect(body).not.toMatch(/transform 180ms/)
    expect(body).toMatch(/var\(--dur-slow\)/)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// CHROME-FOCUS: focus-visible normalization (cohesion-debt item #6). The global
// rule is +2px outline in --accent; 7 components overrode to a NEGATIVE -2px and
// one (inbox-row) SWAPPED the token to --primary. Normalize to +2 where there's
// cell room; keep -2 (inset) ONLY on documented dense row/cell affordances where an
// outward ring clips at the container edge or collides with the adjacent row; never
// swap the focus token off --accent/--ring (the One Blue).
// ════════════════════════════════════════════════════════════════════════════
describe('CHROME-FOCUS: focus-visible normalization', () => {
  // Dense row/cell affordances that legitimately keep an inset (-2px) ring.
  const DENSE_INSET_ALLOWLIST = new Set([
    '.task-row-link',
    '.th-sort-btn',
    '.signal-row',
    '.inbox-row__button',
    '.mobile-task-options-trigger',
  ])

  function focusRules(): { file: string; selector: string; body: string }[] {
    const out: { file: string; selector: string; body: string }[] = []
    for (const f of listSource(SRC, ['.css'])) {
      const css = stripComments(readFileSync(f, 'utf8'))
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
    const css = stripComments(readSrc('components/inbox/inbox.css'))
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
      'components/tasks/TaskSurface.css': '.rf-tab',
      'components/tasks/TasksWorkspace.css': '.task-card-link',
    }
    for (const [file, sel] of Object.entries(roomy)) {
      const css = stripComments(readSrc(file))
      const m = css.match(new RegExp(`\\${sel}:focus-visible\\s*\\{([^}]*)\\}`))
      expect(m, `${sel} focus rule in ${file}`).toBeTruthy()
      expect(m![1], `${sel} must not keep an inset ring`).not.toMatch(/outline-offset:\s*-2px/)
    }
  })
})
