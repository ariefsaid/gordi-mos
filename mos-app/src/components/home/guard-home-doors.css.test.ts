import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Home doors CSS + doc contracts (ticket #757) ────────────────────────────────────────────
// jsdom computes no layout, so the doors' contracts are pinned at the authored-declaration layer
// (the same seam as guard-home-day-header.css.test.ts): the phone 44px floor must reach both doors
// through the rule that WINS the cascade, and the Objectives-door amendment sits in DESIGN.md
// verbatim — it is owner law (A-7, quoted verbatim by ticket #757).

function stripped(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

const CAFE_CSS = stripped('src/components/home/home-cafe-door.css')
const CAFE_TSX = readFileSync(resolve(process.cwd(), 'src/components/home/home-cafe-door.tsx'), 'utf8')
const OBJECTIVES_CSS = stripped('src/components/home/home-objectives-door.css')
const HOME_CSS = [
  stripped('src/pages/home-page.css'),
  ...readdirSync(resolve(process.cwd(), 'src/components/home'))
    .filter((file) => file.endsWith('.css'))
    .map((file) => stripped(`src/components/home/${file}`)),
].join('\n')

describe('the Café door meets the phone contract through the winning rule', () => {
  // The floor for a `.btn-outline` row is Button.css's `@media (max-width: 767.98px) .btn
  // { min-height: 44px }` — the rule that wins the cascade for the class the door reuses.
  // The door's own stylesheet must therefore never set a competing height.
  it('the door reuses .btn/.btn-outline (so the shared 44px floor applies) and sets no height of its own', () => {
    expect(CAFE_TSX).toMatch(/className="btn btn-outline home-cafe-door"/)
    expect(CAFE_CSS).not.toMatch(/(?:^|[;{])\s*height\s*:/)
    expect(CAFE_CSS).not.toMatch(/(?:^|[;{])\s*max-height\s*:/)
  })
})

describe('Home row hovers use the muted surface', () => {
  it('no Home hover rule paints the accent token as its background', () => {
    for (const rule of HOME_CSS.match(/[^{}]*:hover[^{}]*\{[^{}]*\}/g) ?? []) {
      expect(rule).not.toMatch(/background\s*:[^;]*var\(--accent\b/)
    }
  })
})

describe('the Objectives door rows carry figures in the tabular scope', () => {
  // DESIGN.md Tabular-Numbers Rule: every count is tabular. The x/y figures ride the shared
  // `.tabular` utility (index.css owns it — The One-Global-Utility Rule), applied by the
  // component; the stylesheet only styles what the utility does not.
  it('the count tail adds no second numeric scope of its own', () => {
    expect(OBJECTIVES_CSS).not.toMatch(/font-variant-numeric/)
    expect(OBJECTIVES_CSS).not.toMatch(/font-feature-settings/)
  })
})

describe('AC-075 — DESIGN.md carries the Objectives-door amendment verbatim', () => {
  // Doc-grep: the amendment is owner law (ticket #757 quotes it verbatim). Grep the body so a
  // rewording — the thing the verbatim rule exists to prevent — fails here, not silently.
  const DESIGN = readFileSync(resolve(process.cwd(), '../DESIGN.md'), 'utf8')

  it('the "Objectives door" sub-heading sits under Home arrangements with the amendment text', () => {
    const section = DESIGN.slice(DESIGN.indexOf('### Home arrangements'))
    expect(section).toMatch(
      /#### Objectives door\nA door renders data rows — `Objective · x\/y done →` with the drill on each row; with no rows it renders the `quiet` empty state\. A door never renders explanatory prose\./,
    )
  })
})
