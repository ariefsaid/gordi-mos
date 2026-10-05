import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'collection-toolbar.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
describe('CollectionToolbar — readable controls inside the page frame (AC-005)', () => {
  it('the active group control carries the navy/6 tint + navy border + navy text', () => {
    expect(css).toMatch(
      /\.collection-toolbar__option-field--group \.collection-toolbar__picker-trigger \{[^}]*color-mix\(in srgb, var\(--brand-navy\) 6%[^}]*border-color: var\(--brand-navy\);[^}]*color: var\(--brand-navy-text\);/s,
    )
  })

  it('Picker values wrap inside the control instead of hiding ordinary selected text', () => {
    expect(css).toMatch(/\.collection-toolbar__picker-trigger > span \{[^}]*min-width:\s*0;[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s)
    const rule = css.split('.collection-toolbar__picker-trigger > span {')[1]?.split('}')[0]
    expect(rule).not.toContain('ellipsis')
  })

  it('the base choice trigger sizes to its value instead of clipping it', () => {
    expect(css).toMatch(/\.collection-toolbar__choice\s*\{[^}]*max-width:\s*100%;/s)
    const valueBlock = css.split('.collection-toolbar__choice-value {')[1]?.split('}')[0] ?? ''
    expect(valueBlock).not.toMatch(/text-overflow:\s*ellipsis/)
    expect(valueBlock).not.toMatch(/overflow:\s*hidden/)
  })

  it('compound choice wrappers stay bounded to the available frame', () => {
    expect(css).toMatch(/\.collection-toolbar__select\.collection-toolbar__choice\s*\{[^}]*max-width:\s*100%;/s)
  })

  it('gives inactive view controls a quiet visible hover state', () => {
    expect(css).toMatch(
      /\.collection-toolbar__view:not\(\.collection-toolbar__view--active\):hover\s*\{[^}]*background:\s*var\(--surface-tertiary\);[^}]*color:\s*var\(--foreground\);/s,
    )
  })

  it('keeps every desktop saved-view chip on the 32px control step', () => {
    expect(css).toMatch(
      /\.collection-toolbar__view\s*\{[^}]*min-height:\s*32px;/s,
    )
    expect(css).toMatch(
      /\.collection-toolbar__saved-error \.btn\s*\{[^}]*min-height:\s*32px;/s,
    )
  })

  it('lets desktop controls retain their content width and wrap within the collection', () => {
    expect(css).toMatch(/\.collection-toolbar__option-field \{[^}]*flex:\s*0 1 auto;[^}]*max-width:\s*100%;/s)
    expect(css).toMatch(/\.collection-toolbar__select \.picker__trigger \{[^}]*width:\s*auto;[^}]*max-width:\s*100%;/s)
  })

  it('keeps filter actions named while the options row wraps to available space', () => {
    expect(css).toMatch(/\.collection-toolbar__options \{[^}]*flex-wrap:\s*wrap;[^}]*gap:\s*8px;/s)
    expect(css).not.toMatch(/\.tasks-toolbar__clear-label\s*\{[^}]*display:\s*none/)
    expect(css).not.toMatch(/\.collection-toolbar__save-view-label\s*\{[^}]*display:\s*none/)
  })

  it('gives the Indonesian search field its readable floor while the toolbar can wrap', () => {
    expect(css).toMatch(/html:lang\(id\) \.collection-toolbar__search \{[^}]*min-width:\s*220px/s)
    expect(css).toMatch(/\.collection-toolbar__primary \{[^}]*flex-wrap:\s*wrap/s)
  })

  it('removes per-filter fixed desktop budgets that truncate ordinary values', () => {
    for (const id of ['group', 'business-unit', 'status', 'person', 'sort']) {
      expect(css).not.toMatch(new RegExp(`\\[data-filter-id='${id}'\\][^{}]*\\{[^}]*width:\\s*\\d+px`))
    }
    expect(css).toMatch(/\.collection-toolbar__select \{[^}]*max-width:\s*100%;/s)
  })

  it('constrains popover triggers to their toolbar wrapper across font metrics', () => {
    expect(css).toMatch(
      /\.collection-toolbar__choice-trigger\s*\{[^}]*box-sizing:\s*border-box;[^}]*width:\s*100%;/s,
    )
  })

  it('keeps the Tasks search icon visible at compact desktop, matching every other collection', () => {
    expect(css).not.toMatch(/\.tasks-collection-toolbar \.collection-toolbar__search > svg\s*\{[^}]*display:\s*none/s)
  })

  it('keeps complete action labels visible at every desktop width', () => {
    expect(css).not.toMatch(/\.collection-toolbar__action-label\s*\{[^}]*display:\s*none;/s)
    expect(css).not.toMatch(/\.collection-toolbar__save-view-label\s*\{[^}]*display:\s*none;/s)
  })
})

describe('CollectionToolbar — Indonesian search field (issue 1109)', () => {
  it('reserves room for the translated placeholder beside the icon, padding and borders', () => {
    const minWidth = /html:lang\(id\) \.collection-toolbar__search \{\s*min-width:\s*(\d+)px/.exec(css)
    expect(Number(minWidth?.[1])).toBeGreaterThanOrEqual(220)
  })

  it('applies the floor only from 768px up, so the phone row keeps the filter trigger clear', () => {
    expect(css).toMatch(/@media \(min-width: 768px\) \{\s*html:lang\(id\) \.collection-toolbar__search \{\s*min-width:\s*220px/)
  })
})
