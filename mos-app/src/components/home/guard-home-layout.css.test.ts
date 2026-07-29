import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const css = readFileSync(join(__dirname, 'home-layouts.css'), 'utf8')

// ── AC-932 / FR-930 ────────────────────────────────────────────────────────────────────────────
// "the work/feed layout, the tile grid, the tile, the ROW GRAMMAR, the FEED and the region tabs
// each have exactly ONE definition, and NO LAYOUT OPTION REDEFINES THEM."
//
// The prior guard checked four selectors in ONE file. That cannot see the defect the AC is about:
// a second definition of a primitive lands in ANOTHER stylesheet (the layout that wanted its own
// tile), and reading only home-layouts.css declares it absent. It also left out two whole entries
// of the spec's primitive list — the row grammar (`.stream-row*` / `.stream-band*`) and the feed
// (`.signal-feed*`), both of which live in different files precisely because they are shared.
//
// So the corpus is every stylesheet under src/, and a primitive is "defined once" ACROSS all of it.
const SRC = join(__dirname, '..', '..')
function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) return cssFiles(p)
    return p.endsWith('.css') ? [p] : []
  })
}
// Comments stripped first: a retirement note or a design rationale quoting a selector is prose,
// not a second definition (`styles/segmented-track.css` documents the co-tenant OD-V4-10 retired).
const CORPUS = cssFiles(SRC).map((file) => ({
  file: relative(SRC, file),
  css: readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
}))

/** Where a selector's BASE rule (`.x {`, unindented — not `.x:hover`, not a nested override inside
 *  an `@container`/`@media` block, which are indented) is declared, across the whole corpus. */
function baseDefinitions(selector: string): string[] {
  const re = new RegExp(`^\\${selector}\\s*\\{`, 'gm')
  return CORPUS.flatMap(({ file, css: text }) => (text.match(re) ?? []).map(() => file))
}

// The spec's primitive set, entry by entry (home-layout-preference.spec.md FR-930).
const PRIMITIVES: Record<string, string[]> = {
  'the work/feed layout': ['.home-frame', '.home-layout'],
  'the tile grid': ['.home-bento'],
  'the tile': ['.home-tile', '.home-tile-head', '.home-tile-name', '.home-tile-count'],
  'the row grammar': [
    '.stream-group', '.stream-band', '.stream-band-head', '.stream-band-label',
    '.stream-band-list', '.stream-band-link', '.stream-band-more',
    '.stream-row-link', '.stream-row-body', '.stream-row-title', '.stream-row-meta',
    '.stream-row-pic-name', '.stream-row-tail',
  ],
  'the feed': ['.signal-feed-section', '.signal-feed-head', '.signal-feed-label', '.signal-feed'],
  'the region tabs': ['.home-tabs', '.home-tab', '.home-tab-count'],
}

describe('AC-932: Home layout primitives are defined once', () => {
  for (const [primitive, selectors] of Object.entries(PRIMITIVES)) {
    for (const selector of selectors) {
      it(`AC-932: ${primitive} — ${selector} has exactly one base definition in the whole stylesheet corpus`, () => {
        const where = baseDefinitions(selector)
        expect(where, `${selector} is declared in: ${where.join(', ') || '(nowhere)'}`).toHaveLength(1)
      })
    }
  }

  // The other half of the AC — "no layout OPTION redefines them". The three arrangements are
  // compositions of the shared set (FR-930); a stylesheet named after one of them is the shape a
  // second implementation takes, and it is what the AC forbids by construction.
  it('AC-932: no arrangement owns a stylesheet of its own', () => {
    const perLayout = ['home-focused.css', 'home-overview.css', 'home-list.css']
      .filter((name) => existsSync(join(__dirname, name)))
    expect(perLayout, 'Focused/Overview/List compose the shared primitives; none may re-author them')
      .toEqual([])
  })

  // NFR-923: a grid child defaults to min-content width. Omitting minmax(0, …) is what lets long
  // titles push a grid past its container — the exact defect found in the mockups.
  it('every grid track uses minmax(0, …)', () => {
    const tracks = css.match(/grid-template-columns:[^;]+;/g) ?? []
    const bad = tracks.filter((t) => /\b1fr\b/.test(t) && !t.includes('minmax(0'))
    expect(bad).toEqual([])
  })
})

// ── The Overview lead tile carries a tonal lift ────────────────────────────────────────────────
// `needs-you` leads by being first, top-left and wide — but `my-work` is ALSO wide, so weight alone
// does not mark the lead. A one-step tonal lift on the region does. Keyed to the REGION, never to
// the weight (both wide tiles would take it). Previously declined on the claim that it collides
// with `.stream-row-link:hover`; that was wrong — hover uses `--secondary` (→ `--surface-secondary`)
// and this is `--surface-tertiary`, a different step of the same ramp (measured in the browser:
// secondary = color(display-p3 0.984 0.976 0.957), tertiary = color(display-p3 0.969 0.957 0.933)).
describe('OD-V4-7 constraint 1: the lead region is marked, and not by weight alone', () => {
  it('the tonal lift is keyed to the needs-you REGION, not to the wide weight', () => {
    expect(css).toMatch(/\.home-tile\[data-region="needs-you"\]\s*\{[^}]*background:\s*var\(--surface-tertiary\)/)
    expect(css, 'a weight-keyed lift would also raise my-work')
      .not.toMatch(/\.home-tile\[data-weight="wide"\]\s*\{[^}]*background:/)
  })

  it('it does not reuse the row-hover fill, which would make the tile read as hovered', () => {
    const rule = /\.home-tile\[data-region="needs-you"\]\s*\{([^}]*)\}/.exec(css)![1]
    expect(rule).not.toMatch(/var\(--secondary\)/)
  })
})

// ── The tile's own name is not the quietest thing in the tile ──────────────────────────────────
// `.home-tile-name` sat at the 12px label rung inside 15px row titles, so the region's identity
// read below the rows it heads.
//
// It is now the SAME rung and weight as `.stream-row-title` — an exact tie, and deliberately so.
// Its sibling guard (guard-home-head-rank.css.test.ts) argues that a tie IS the defect, but that
// is a different pair: there, size is the only channel between an `h1` and a group header, and
// Home's `h1` is only one rung up (`subheading`/18px), so raising the tile name to break the tie
// with its rows would tie or invert it against the page title instead. The tile name separates
// the way the List band label does — the DISPLAY face against the rows' body face, plus its own
// head row — so this guard asserts THAT, and pins the tie as intentional rather than titling
// itself a ranking it does not check. (Was titled "the tile name outranks the rows beneath it".)
describe('the tile name reads as the tile header, not as one more row', () => {
  it('.home-tile-name takes the body-lg rung, not the label rung it used to sit at', () => {
    const rule = /\.home-tile-name\s*\{([^}]*)\}/.exec(css)![1]
    expect(rule).toMatch(/font-size:\s*var\(--font-size-body-lg\)/)
  })

  it('it separates from the rows by FACE and weight, since it deliberately ties them on size', () => {
    const rule = /\.home-tile-name\s*\{([^}]*)\}/.exec(css)![1]
    const rowCss = readFileSync(join(__dirname, 'home-stream.css'), 'utf8')
    const rowRule = /\.stream-row-title\s*\{([^}]*)\}/.exec(rowCss)![1]
    // The tie is real — pinned, so a future size change to either side lands here first.
    expect(rowRule).toMatch(/font-size:\s*var\(--font-size-body-lg\)/)
    // …and the channel that actually does the separating is present on one side and not the other.
    expect(rule, 'the tile name is the display face').toMatch(/font-family:\s*var\(--font-display\)/)
    expect(rowRule, 'the row title is the body face — that contrast is the separation')
      .not.toMatch(/font-family:/)
    expect(rule).toMatch(/font-weight:\s*600/)
  })
})
