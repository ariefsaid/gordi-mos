/**
 * GUARD (#585, extended #623) — Inbox's interactive states never resolve to the solid action
 * colour as a fill paired with plain `--foreground` text.
 *
 * `--accent` (styles/tokens/aliases.css) is deliberately bound to `--ds-color-blue`, the SOLID
 * action blue used for avatars and the focus ring (index.css: "`--accent` is intentionally left
 * as aliases.css defines it ... hand-CSS uses it for avatars/focus"). DESIGN.md's own grammar for
 * `accent` — "the hover wash on interactive neutral surfaces (rail items, ghost buttons, row
 * hover, control hover)" — is a DIFFERENT, quieter idea that this alias no longer carries. Every
 * row/filter-chip/row-action hover in inbox.css that painted `var(--accent)` flooded the whole
 * row solid blue, dropping title contrast to 3.0:1 and body contrast to 1.2:1 (both well under
 * WCAG AA). The fix is per the token contract, not per pixel: hover backgrounds use the wash
 * token (`--surface-tertiary`, aliases.css: "hover fills" — the same token command-menu.css
 * already uses for its own list-row hover), `--accent` stays reserved for focus rings/avatars.
 *
 * #623 found the SAME failure mode on a different pseudo-state: the selected
 * (`[aria-pressed='true']`) filter chip painted `background: var(--accent); color:
 * var(--foreground)` — near-black text on solid blue, 2.90:1. So this guard now scans every
 * `:hover` OR `[aria-pressed=...]` rule, not just `:hover`.
 *
 * This guard reads the raw CSS text (no cascade/DOM engine needed) and fails on ANY such rule in
 * inbox.css whose `background`/`background-color` CONTAINS `var(--accent)` while its `color`
 * resolves to `var(--foreground)` — a substring check, not just an exact match, so a future edit
 * can't slip it in via a shorthand or multi-value background under a new class name either.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(__dirname, 'inbox.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Every `<selector list>:hover { ... }` block's raw declaration body, keyed by its selector. */
function hoverRules(source: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = []
  for (const m of source.matchAll(/([^{}]*:hover[^{}]*)\{([^}]*)\}/g)) {
    out.push({ selector: m[1].trim(), body: m[2] })
  }
  return out
}

/** Every `<selector list>[aria-pressed=...] { ... }` block's raw declaration body. */
function ariaPressedRules(source: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = []
  for (const m of source.matchAll(/([^{}]*\[aria-pressed=[^{}]*)\{([^}]*)\}/g)) {
    out.push({ selector: m[1].trim(), body: m[2] })
  }
  return out
}

describe('GUARD: inbox.css hover backgrounds never paint the solid action colour', () => {
  const hovers = hoverRules(css)

  it('finds at least one :hover rule with a background (a parse that found nothing would make the rest vacuous)', () => {
    const withBackground = hovers.filter((h) => /background\s*:/.test(h.body))
    expect(withBackground.length).toBeGreaterThan(0)
  })

  for (const { selector, body } of hovers) {
    const bg = /background(?:-color)?\s*:\s*([^;]+);/.exec(body)?.[1]?.trim()
    if (!bg) continue
    it(`${selector} background ("${bg}") does not contain the solid action colour`, () => {
      expect(
        bg.includes('var(--accent)'),
        `${selector} must not use var(--accent) as a hover wash (even mixed into a shorthand/multi-value background) — use var(--surface-tertiary)`,
      ).toBe(false)
    })
  }

  it('the row, filter-chip, and row-action hovers resolve to the wash token, not the action colour', () => {
    const named = ['.inbox-row__button:hover', '.inbox-triage__filter:hover', '.inbox-row__handle:hover']
    for (const selector of named) {
      const rule = hovers.find((h) => h.selector === selector)
      expect(rule, `expected a :hover rule for ${selector}`).toBeTruthy()
      const bg = /background(?:-color)?\s*:\s*([^;]+);/.exec(rule!.body)?.[1]?.trim()
      expect(bg, `${selector} must set a background`).toBe('var(--surface-tertiary)')
    }
  })

  // #623: the selected-chip failure mode isn't a :hover rule, so the guard above wouldn't have
  // caught it. No `[aria-pressed=...]` rule may pair a `var(--accent)` background with plain
  // `var(--foreground)` text — that combination is the near-black-on-solid-blue 2.90:1 failure.
  const pressed = ariaPressedRules(css)

  it('finds at least one [aria-pressed] rule (a parse that found nothing would make the rest vacuous)', () => {
    expect(pressed.length).toBeGreaterThan(0)
  })

  for (const { selector, body } of pressed) {
    const bg = /background(?:-color)?\s*:\s*([^;]+);/.exec(body)?.[1]?.trim()
    const color = /(?<!background-)color\s*:\s*([^;]+);/.exec(body)?.[1]?.trim()
    if (!bg) continue
    it(`${selector} does not pair a var(--accent) background with var(--foreground) text`, () => {
      const isAccentFill = bg.includes('var(--accent)')
      const isPlainForeground = color === 'var(--foreground)'
      expect(
        isAccentFill && isPlainForeground,
        `${selector} pairs "${bg}" with "${color}" — the selected chip must use the selected-chip ` +
          `token pair (var(--background) + var(--foreground), matching .collection-toolbar__view--active), ` +
          `never the solid accent fill with plain foreground text`,
      ).toBe(false)
    })
  }

  it('the selected filter chip resolves to the selected-chip token pair, not the accent fill', () => {
    const rule = pressed.find((h) => h.selector === ".inbox-triage__filter[aria-pressed='true']")
    expect(rule, 'expected an [aria-pressed] rule for .inbox-triage__filter').toBeTruthy()
    const bg = /background(?:-color)?\s*:\s*([^;]+);/.exec(rule!.body)?.[1]?.trim()
    const color = /(?<!background-)color\s*:\s*([^;]+);/.exec(rule!.body)?.[1]?.trim()
    expect(bg).toBe('var(--background)')
    expect(color).toBe('var(--foreground)')
  })
})
