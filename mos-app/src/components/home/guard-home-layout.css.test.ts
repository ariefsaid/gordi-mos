import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// AC-932 / FR-930 — the work/feed layout, tile grid, tile, row grammar, feed and region tabs are
// shared primitives. This guard counts base definitions across every stylesheet under src/, not
// only home-layouts.css, because a second layout-specific copy could land in another file.
const SRC = join(__dirname, '..', '..')

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return cssFiles(path)
    return path.endsWith('.css') ? [path] : []
  })
}

const CORPUS = cssFiles(SRC).map((file) => ({
  file: relative(SRC, file),
  css: readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
}))

function baseDefinitions(selector: string): string[] {
  const pattern = new RegExp(`^\\${selector}\\s*\\{`, 'gm')
  return CORPUS.flatMap(({ file, css }) => (css.match(pattern) ?? []).map(() => file))
}

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
      it(`AC-932: ${primitive} — ${selector} has one base definition`, () => {
        const where = baseDefinitions(selector)
        expect(where, `${selector} is declared in: ${where.join(', ') || '(nowhere)'}`).toHaveLength(1)
      })
    }
  }

  it('AC-932: no arrangement owns a layout-specific stylesheet', () => {
    const perLayout = ['home-focused.css', 'home-overview.css', 'home-list.css']
      .filter((name) => existsSync(join(__dirname, name)))
    expect(perLayout).toEqual([])
  })

  it('AC-932: grid tracks use minmax(0, …) so content cannot widen them', () => {
    const css = readFileSync(join(__dirname, 'home-layouts.css'), 'utf8')
    const tracks = css.match(/grid-template-columns:[^;]+;/g) ?? []
    expect(tracks.filter((track) => /\b1fr\b/.test(track) && !track.includes('minmax(0')).length).toBe(0)
  })
})
