// KpiTile stylesheet pin — review finding on #443. The overlay pattern load-bears on
// .kpi-tile-help sitting ABOVE the stretched .kpi-tile-hit button: jsdom does no
// hit-testing, so deleting the z-index would pass every unit test while the overlay
// silently swallowed every help tap on interactive tiles. The CSS file is the oracle.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'kpi-tile.css'), 'utf8')

describe('kpi-tile.css — the help-above-overlay pin', () => {
  it('the help button stacks above the stretched hit overlay', () => {
    const helpRule = css.match(/\.kpi-tile-help\s*\{[^}]*\}/)?.[0] ?? ''
    expect(helpRule).toMatch(/position:\s*relative/)
    expect(helpRule).toMatch(/z-index:\s*[1-9]/)
  })
})
