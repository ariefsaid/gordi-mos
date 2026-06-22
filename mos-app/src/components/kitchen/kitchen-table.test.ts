// B1 (OD-K-5 redesign plan §2.2): the shared dense-table grammar. The sibling
// Plan/Pesanan/Stock/Review table CSS files import `kitchen-table.css` for the
// `.kt-*` grammar (sticky overline thead · 50px dense rows · tabular nums ·
// negative tint · quiet hover wash). This test pins the CONTRACT those siblings
// rely on: the class names exist + every var() resolves to a defined token (the
// RI-4 / C1 guards already glob the file; this asserts the grammar is present).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CSS = readFileSync(
  resolve(process.cwd(), 'src', 'components', 'kitchen', 'kitchen-table.css'),
  'utf8',
)

describe('B1: kitchen-table.css — shared dense-table grammar contract', () => {
  it('defines the .kt-table base + sticky-overline thead grammar', () => {
    expect(CSS).toMatch(/\.kt-table\s*\{/)
    expect(CSS).toMatch(/\.kt-table\s+thead\s+th\s*\{/)
    expect(CSS).toMatch(/position:\s*sticky/i) // sticky overline thead
    expect(CSS).toMatch(/top:\s*0/i)
  })

  it('defines the right-aligned numeric helpers (.kt-th-num + .kt-num)', () => {
    expect(CSS).toMatch(/\.kt-th-num\s*\{/)
    expect(CSS).toMatch(/\.kt-num\s*\{/)
    expect(CSS).toMatch(/tabular-nums/)
    expect(CSS).toMatch(/\.kt-table\s+thead\s+\.kt-th-num\s*\{[^}]*text-align:\s*right/i)
  })

  it('defines the dish name + category sub-label helpers (.kt-name + .kt-cat)', () => {
    expect(CSS).toMatch(/\.kt-name\s*\{[^}]*display:\s*block/i)
    expect(CSS).toMatch(/\.kt-cat\s*\{[^}]*display:\s*block/i)
  })

  it('defines the empty-filter row + negative-number tint (.kt-empty + .kt-neg)', () => {
    expect(CSS).toMatch(/\.kt-empty\s*\{/)
    expect(CSS).toMatch(/\.kt-neg\s*\{/)
  })

  it('uses the quiet hover wash token (--surface-secondary), NOT the blue --accent', () => {
    // Directive: --accent IS the action blue in this app; quiet row hover uses
    // --surface-secondary (the grey wash). The existing qty-cell.css follows this.
    const hoverBlock = CSS.match(/\.kt-table\s+tbody\s+tr:hover[^{]*\{[^}]*\}/s)
    expect(hoverBlock, 'a tbody tr:hover rule must exist').not.toBeNull()
    expect(hoverBlock![0]).toContain('var(--surface-secondary)')
    expect(hoverBlock![0]).not.toContain('var(--accent)')
  })
})
