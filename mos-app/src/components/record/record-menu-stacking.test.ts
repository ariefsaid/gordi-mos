// The ⋯ menu is portalled to <body>. On a phone the record panel is a full-screen drawer, so a menu
// below the drawer's layer opens behind it, invisible and untappable. Pin the layer order.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = resolve(__dirname, '../..')
const indexCss = readFileSync(resolve(src, 'index.css'), 'utf8')
const menuCss = readFileSync(resolve(__dirname, 'record-page.css'), 'utf8')

const tier = (name: string) => Number(new RegExp(`--z-${name}:\\s*(\\d+)`).exec(indexCss)?.[1])

describe('record menu layer', () => {
  it('sits above the drawer layer a phone record panel lives on', () => {
    const token = /\.rp-menu\s*\{[^}]*z-index:\s*var\(--z-([a-z]+)\)/.exec(menuCss)?.[1]
    expect(token, 'the menu names a z-index token').toBeTruthy()
    expect(tier(token as string)).toBeGreaterThan(tier('drawer'))
  })

  it('stays under the toast layer', () => {
    const token = /\.rp-menu\s*\{[^}]*z-index:\s*var\(--z-([a-z]+)\)/.exec(menuCss)?.[1]
    expect(tier(token as string)).toBeLessThan(tier('toast'))
  })
})
