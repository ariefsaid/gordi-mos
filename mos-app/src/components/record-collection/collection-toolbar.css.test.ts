// AC-005 pin (#743, FR-005): the Group control's navy tint and its no-overflow guarantee live in
// the shared toolbar stylesheet. jsdom cannot compute either, so the guard reads the sheet the
// same way the other css guards do: the `--group` modifier must carry the structural-navy tokens
// (OD-P3-6), and the select field must ellipsis-clip so "Kelompok: Tidak" never overflows its box.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'collection-toolbar.css'), 'utf8')

describe('CollectionToolbar — group tint + value clipping (AC-005)', () => {
  it('the active group control carries the navy/6 tint + navy border + navy text', () => {
    expect(css).toMatch(
      /\.collection-toolbar__option-field--group \.mk-select__box \{[^}]*color-mix\(in srgb, var\(--brand-navy\) 6%[^}]*border-color: var\(--brand-navy\);[^}]*color: var\(--brand-navy-text\);/s,
    )
  })

  it('select values clip with an ellipsis instead of overflowing the box', () => {
    expect(css).toMatch(/\.collection-toolbar__select \.mk-select__field \{ text-overflow: ellipsis; \}/)
  })
})
