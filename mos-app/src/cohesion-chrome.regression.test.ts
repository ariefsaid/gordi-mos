// Cohesion program — OVERLAY-CHROME half (docs/reviews/cohesion-debt-2026-07-19.md).
// Locking tests for the deduplicated overlay/dialog chrome: one z-index tier scale,
// one scrim token + `.scrim` utility, one CloseIcon, duration tokens, focus-visible
// normalization. Mirrors the source-scan/CSS-lock pattern of consistency.regression.test.tsx
// (RI-* invariants). AC-ids as CHROME-* so `grep -r CHROME-XXX` finds the proof.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = resolve(process.cwd(), 'src')

function readSrc(rel: string): string {
  return readFileSync(resolve(SRC, rel), 'utf8')
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
