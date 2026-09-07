import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { messages } from '@/i18n/messages'

/**
 * GUARD issue 449 — the intra-branch qualifier is a subordinate RUNG, not an inline tail.
 *
 * The intra-branch movement tab carries the same-branch cross-activity qualifier
 * (OD-WAY-43: a transfer can move between two activities of one branch, so the
 * destination is a stream, not a branch). It used to be set inline, on the tab
 * label's own baseline, which made that one tab measure label + qualifier —
 * roughly twice its siblings — and read as one run-on string. The content was
 * right; the typesetting was not.
 *
 * jsdom computes no layout, so the stacking itself cannot be asserted from a
 * render. These assertions hold the three properties that produce it, and fail
 * if the inline treatment comes back.
 */
const css = readFileSync(join(__dirname, 'movement-seg.css'), 'utf8')

/** The `.kms-tab` rule body — the tab box itself, not its state selectors. */
function tabRule(): string {
  const at = css.indexOf('.kms-tab {')
  if (at === -1) throw new Error('movement-seg.css no longer declares `.kms-tab` — re-anchor this guard.')
  return css.slice(at, css.indexOf('}', at))
}

/** The `.kms-qual` rule body — the qualifier's own resting treatment. */
function qualRule(): string {
  const at = css.indexOf('.kms-qual {')
  if (at === -1) throw new Error('movement-seg.css no longer declares `.kms-qual` — re-anchor this guard.')
  return css.slice(at, css.indexOf('}', at))
}

/** The `.kms` (track) rule body — where the scroll-in-own-box rule lives (A7). */
function trackRule(): string {
  const at = css.indexOf('.kms {')
  if (at === -1) throw new Error('movement-seg.css no longer declares `.kms` — re-anchor this guard.')
  return css.slice(at, css.indexOf('}', at))
}

describe('GUARD issue 449: the movement tab sets its qualifier on its own rung', () => {
  it('the tab stacks its contents, so the qualifier cannot share the label’s baseline', () => {
    const tab = tabRule()
    expect(tab).toMatch(/display:\s*inline-flex/)
    expect(tab).toMatch(/flex-direction:\s*column/)
  })

  it('the qualifier carries no inline offset — an inline tail’s signature', () => {
    expect(qualRule()).not.toMatch(/margin-left/)
  })

  it('the qualifier is one step DOWN the type ramp from the label it qualifies', () => {
    // Subordinate, not a second name: the tab runs at --font-size-mono, the rung below it
    // at --font-size-label. Token-only (DESIGN.md) — a raw px here would be the drift.
    expect(tabRule()).toMatch(/font-size:\s*var\(--font-size-mono\)/)
    expect(qualRule()).toMatch(/font-size:\s*var\(--font-size-label\)/)
  })
})

describe('GUARD issue 449: the same-branch case stays unambiguous at phone width', () => {
  it('the phone form of the qualifier says what it qualifies, in both locales', () => {
    // On its own line a bare separator ("· Kitchen") reads as an orphan, so both
    // locales carry their own preposition.
    for (const locale of ['en', 'id'] as const) {
      const short = messages[locale]['kitchen.actionType.intraBranch.short']
      expect(short).toContain('${activity}')
      expect(short.replace('${activity}', '').trim()).not.toBe('·')
    }
  })
})

/**
 * GUARD #782 (AC-025) — the strip scrolls in its own box, and the page itself never gains
 * a horizontal scroll on account of a wider-than-390 movement strip. Above five options
 * the strip is wrong and the derivation is fixed, not the layout (DESIGN.md § Tabs /
 * Segmented Controls, A7).
 */
describe('GUARD #782: derived scope strip scrolls in its own box, never the page', () => {
  it('the track overflows horizontally inside itself (overflow-x: auto)', () => {
    expect(trackRule()).toMatch(/overflow-x:\s*auto/)
  })

  it('the track constrains its width so it never pushes the page wider', () => {
    expect(trackRule()).toMatch(/max-width:\s*100%/)
    expect(trackRule()).toMatch(/box-sizing:\s*border-box/)
  })
})
