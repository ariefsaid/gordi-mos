/**
 * GUARD — the Overview bento leaves no ragged hole.
 *
 * Rendered defect (1440px, measured): row 1 filled (needs-you 535px + failed-checks 257px = the
 * 812px grid), then `mentions` sat alone at 257px with 555px of dead space to its right and
 * `my-work` wrapped to a row of its own. The owner has rejected exactly this once already
 * ("the boxes dont align … feels untidy nor professional").
 *
 * jsdom has no grid layout engine, so the catchable layer is the arithmetic that PRODUCES the
 * layout: the authored column count, the authored span per weight, and the region order the
 * Overview actually renders. This simulates the grid's own line-packing over those three real
 * inputs and asserts every row lands exactly on the column count — at every desktop band. It fails
 * on the shipped weights, and on any future re-weighting that reintroduces a hole.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildHomeRegions } from './home-regions'
import { HOME_TILE_WEIGHT } from './home-tile-weight'

const css = readFileSync(join(__dirname, 'home-layouts.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** The region order Overview renders, taken from the region model itself (never hand-copied). */
const REGION_IDS = buildHomeRegions({
  overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
}).map((r) => r.id)

/** `[start, end)` source ranges for the base cascade and each responsive block.
 *
 *  The responsive at-rule is `@container` (the branches are measured against the Home frame's own
 *  width, not the window — FR-932 / DESIGN.md § Layout → The Container-Query Rule). `@media` is
 *  still matched so this guard keeps reading a file that reintroduces one: what it models is the
 *  last-wins CASCADE over the authored bands, which is identical either way. */
const RESPONSIVE_AT_RULE = /@(?:media|container)[^{]*\{/g

function bands(): { label: string; text: string }[] {
  const out: { label: string; text: string }[] = []
  const firstBranch = css.search(/@(?:media|container)/)
  out.push({ label: 'base (wide)', text: firstBranch < 0 ? css : css.slice(0, firstBranch) })
  for (const m of css.matchAll(RESPONSIVE_AT_RULE)) {
    const open = css.indexOf('{', m.index)
    let depth = 0
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1
      if (css[i] === '}') {
        depth -= 1
        if (depth === 0) {
          out.push({ label: m[0].replace(/\s*\{$/, '').trim(), text: css.slice(open + 1, i) })
          break
        }
      }
    }
  }
  return out
}

/** Last-wins cascade read of `.home-bento`'s column count across the bands up to and including `i`. */
function columnsThrough(all: { text: string }[], i: number): number {
  let cols = 0
  for (let b = 0; b <= i; b += 1) {
    for (const m of all[b].text.matchAll(/\.home-bento\s*\{([^}]*)\}/g)) {
      const track = /grid-template-columns:\s*([^;]+);/.exec(m[1])?.[1]
      if (!track) continue
      const repeat = /repeat\(\s*(\d+)/.exec(track)
      cols = repeat ? Number(repeat[1]) : track.trim().split(/\s+(?![^(]*\))/).length
    }
  }
  return cols
}

/** Last-wins cascade read of each weight's `span N` across the bands up to and including `i`. */
function spansThrough(all: { text: string }[], i: number): Record<string, number> {
  const spans: Record<string, number> = {}
  for (let b = 0; b <= i; b += 1) {
    for (const m of all[b].text.matchAll(
      /\.home-tile\[data-weight="([\w-]+)"\]\s*\{([^}]*)\}/g,
    )) {
      const span = /grid-column:\s*span\s+(\d+)/.exec(m[2])?.[1]
      if (span) spans[m[1]] = Number(span)
    }
  }
  return spans
}

describe('GUARD: every Overview bento row fills the grid exactly (no ragged hole)', () => {
  const all = bands()

  it('reads a real column count and a real span for every weight the Overview uses', () => {
    // Sanity: a parse that silently found nothing would make every assertion below vacuous.
    expect(REGION_IDS.length).toBeGreaterThan(0)
    expect(columnsThrough(all, 0)).toBeGreaterThan(1)
    for (const id of REGION_IDS) {
      expect(HOME_TILE_WEIGHT[id], `no weight declared for region ${id}`).toBeDefined()
      expect(spansThrough(all, 0)[HOME_TILE_WEIGHT[id]], `no span authored for weight ${HOME_TILE_WEIGHT[id]}`)
        .toBeGreaterThan(0)
    }
  })

  for (const [i, band] of all.entries()) {
    const cols = columnsThrough(all, i)
    // The single-column phone band stacks by definition — nothing to pack.
    if (cols <= 1) continue
    it(`${band.label}: rows pack to exactly ${cols} columns`, () => {
      const spans = spansThrough(all, i)
      const rows: number[][] = []
      let row: number[] = []
      let used = 0
      for (const id of REGION_IDS) {
        const span = spans[HOME_TILE_WEIGHT[id]]
        if (used + span > cols) { rows.push(row); row = []; used = 0 }
        row.push(span)
        used += span
      }
      if (row.length) rows.push(row)
      const sums = rows.map((r) => r.reduce((a, b) => a + b, 0))
      expect(sums, `ragged rows in ${band.label}: ${JSON.stringify(rows)}`).toEqual(rows.map(() => cols))
    })
  }

  it('OD-V4-7: needs-you keeps the lead — first, and no tile outranks it', () => {
    expect(REGION_IDS[0]).toBe('needs-you')
    const spans = spansThrough(all, 0)
    const leadSpan = spans[HOME_TILE_WEIGHT['needs-you']]
    for (const id of REGION_IDS) {
      expect(spans[HOME_TILE_WEIGHT[id]], `${id} outranks the lead tile`).toBeLessThanOrEqual(leadSpan)
    }
  })
})
