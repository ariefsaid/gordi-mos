// AC-005 pin (#743, FR-005): the Group control's navy tint and its no-overflow guarantee live in
// the shared toolbar stylesheet. jsdom cannot compute either, so the guard reads the sheet the
// same way the other css guards do: the `--group` modifier must carry the structural-navy tokens
// (OD-P3-6), and the Picker field must ellipsis-clip so a localized value never overflows its box.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'collection-toolbar.css'), 'utf8')

describe('CollectionToolbar — group tint + value clipping (AC-005)', () => {
  it('the active group control carries the navy/6 tint + navy border + navy text', () => {
    expect(css).toMatch(
      /\.collection-toolbar__option-field--group \.collection-toolbar__picker-trigger \{[^}]*color-mix\(in srgb, var\(--brand-navy\) 6%[^}]*border-color: var\(--brand-navy\);[^}]*color: var\(--brand-navy-text\);/s,
    )
  })

  it('Picker values clip with an ellipsis instead of overflowing the box', () => {
    expect(css).toMatch(
      /\.collection-toolbar__picker-trigger > span \{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
    )
  })

  it('gives inactive view controls a quiet visible hover state', () => {
    expect(css).toMatch(
      /\.collection-toolbar__view:not\(\.collection-toolbar__view--active\):hover\s*\{[^}]*background:\s*var\(--surface-tertiary\);[^}]*color:\s*var\(--foreground\);/s,
    )
  })

  it('keeps the Tasks attention trigger content-sized in the desktop row', () => {
    expect(css).toMatch(
      /@media\s*\(min-width:\s*1024px\)[\s\S]*?\.tasks-collection-toolbar \.tasks-attention-picker\s*\{[^}]*flex:\s*0 0 auto;[^}]*min-width:\s*max-content;/s,
    )
  })

  it('reserves enough desktop width for the ordinary Tasks filter values', () => {
    expect(css).toMatch(
      /@media\s*\(min-width:\s*1024px\)[\s\S]*?\[data-filter-id='group'\][\s\S]*?flex:\s*0 0 136px;[\s\S]*?max-width:\s*none;/s,
    )
    expect(css).toMatch(
      /@media\s*\(min-width:\s*1024px\)[\s\S]*?\[data-filter-id='business-unit'\][\s\S]*?flex:\s*0 0 100px;[\s\S]*?max-width:\s*none;/s,
    )
    expect(css).toMatch(
      /@media\s*\(min-width:\s*1024px\)[\s\S]*?\[data-filter-id='status'\]\s*\{[^}]*flex:\s*0 0 108px;[^}]*max-width:\s*none;[^}]*\}[\s\S]*?\[data-filter-id='status'\] \.collection-toolbar__select\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/s,
    )
    expect(css).toMatch(
      /@media\s*\(min-width:\s*1024px\)[\s\S]*?\[data-filter-id='person'\][\s\S]*?flex:\s*0 0 100px;[\s\S]*?max-width:\s*none;/s,
    )
    expect(css).toMatch(
      /@media\s*\(min-width:\s*1024px\)[\s\S]*?\[data-filter-id='sort'\][\s\S]*?flex:\s*0 0 142px;[\s\S]*?max-width:\s*none;/s,
    )
  })

  it('constrains popover triggers to their toolbar wrapper across font metrics', () => {
    expect(css).toMatch(
      /\.collection-toolbar__choice-trigger\s*\{[^}]*box-sizing:\s*border-box;[^}]*width:\s*100%;/s,
    )
  })

  it('keeps compact action text visible and removes the duplicate Status label at compact desktop', () => {
    expect(css).toMatch(
      /@media\s*\(min-width:\s*1024px\)\s*and\s*\(max-width:\s*1440px\)[\s\S]*?\.collection-toolbar__action-icon\s*\{[^}]*display:\s*none;/s,
    )
    expect(css).not.toMatch(/\.collection-toolbar__action-label\s*\{[^}]*display:\s*none;/s)
  })
})
