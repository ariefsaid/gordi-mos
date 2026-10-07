import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const layout = read('src/components/kitchen/cafe-capture-layout.css').replace(/\/\*[\s\S]*?\*\//g, '')
const controls = read('src/components/kitchen/cafe-capture-controls.css').replace(/\/\*[\s\S]*?\*\//g, '')
const aliases = read('src/styles/tokens/aliases.css')

describe('Café capture routes share one responsive table and control geometry', () => {
  it('uses the common table, row, and footer rules instead of a Count-owned list skin', () => {
    expect(layout).toMatch(/\.cafe-capture-table \.dt-table\s*\{/)
    expect(layout).toMatch(/\.cafe-capture-row\s*\{/)
    expect(layout).toMatch(/\.cafe-capture-footer/)
    expect(layout).not.toMatch(/\.cafe-count__list\s*\{/)
    expect(layout).not.toMatch(/\.cafe-count__row\s*\{/)
    expect(aliases).toMatch(/--cafe-capture-content-measure:\s*772px/)
  })

  it('keeps quantity width, touch height, focus and invalid states in the shared control skin', () => {
    expect(controls).toMatch(/\.cafe-capture-content \.cafe-capture-quantity-field,[\s\S]*?\.cafe-count \.cafe-capture-quantity-field\s*\{[^}]*width:\s*var\(--cafe-capture-quantity-width\)[^}]*min-height:\s*var\(--cafe-capture-control-height\)/)
    expect(controls).toMatch(/\.cafe-capture-content \.cafe-capture-quantity-field:not\(\.kls-qty\):focus-visible,[\s\S]*?\.cafe-count \.cafe-capture-quantity-field:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ring\)/)
    expect(controls).toMatch(/\.cafe-capture-content \.cafe-capture-quantity-field:not\(\.kls-qty\)\[aria-invalid="true"\],[\s\S]*?\.cafe-count \.cafe-capture-quantity-field\[aria-invalid="true"\]\s*\{[^}]*border-color:\s*var\(--destructive\)/)
    expect(controls).toMatch(/\.cafe-capture-unit\s*\{[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere[^}]*text-overflow:\s*clip/)
    expect(controls).not.toMatch(/text-overflow:\s*ellipsis/)
    expect(layout).toMatch(/\.cafe-count__quantity-control input\s*\{\s*font-variant-numeric:\s*tabular-nums;/)
  })
})
