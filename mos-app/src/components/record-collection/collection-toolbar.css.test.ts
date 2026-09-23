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

  // A popover filter trigger (Projects & Processes' "Current status", etc.) is not a
  // fixed-budget row control like Tasks' filters — it reads its value in full and wraps the
  // toolbar if it must, rather than ellipsizing it away for no reason.
  it('the base choice trigger sizes to its value instead of clipping it', () => {
    // The trigger still fills its own wrapper (`width: 100%`, unchanged — the wrapper is
    // what must not be capped) — this pins the WRAPPER's cap being lifted, not the trigger.
    expect(css).toMatch(/\.collection-toolbar__choice\s*\{[^}]*max-width:\s*none;/s)
    const valueBlock = css.split('.collection-toolbar__choice-value {')[1]?.split('}')[0] ?? ''
    expect(valueBlock).not.toMatch(/text-overflow:\s*ellipsis/)
    expect(valueBlock).not.toMatch(/overflow:\s*hidden/)
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

  it('keeps the Tasks attention trigger content-sized in the desktop row', () => {
    expect(css).toMatch(
      /@media\s*\(min-width:\s*1024px\)[\s\S]*?\.tasks-collection-toolbar \.tasks-attention-picker\s*\{[^}]*flex:\s*0 0 auto;[^}]*min-width:\s*max-content;/s,
    )
  })

  // Each box reserves its basis and never grows past it, and MAY shrink below it. The bases
  // budget the row without the clear-filters action, which appears only once a filter is
  // applied; a box that could not give way pushed the page 57px sideways at 1024. A contracted
  // box ellipsizes with its full value on the trigger, which the rule's own comment promises.
  it('keeps the filtered row readable by shortening its two longest actions, and floors the give', () => {
    // These three rules are what buy the readability back once a filter is applied and the
    // clear action joins the row. Delete any of them and the English filtered row silently
    // returns to five truncated values with every other test still green — the flex bases
    // beside them were pinned, these were not.
    const compact = css.slice(css.indexOf('@media (min-width: 1024px) and (max-width: 1440px)'))
    expect(compact, 'the clear action must shorten at compact').toMatch(
      /\.tasks-toolbar__clear-label\s*\{[^}]*display:\s*none/s,
    )
    expect(compact, 'its compact label must take over').toMatch(
      /\.tasks-toolbar__clear-compact-label\s*\{[^}]*display:\s*inline/s,
    )
    expect(compact, 'Save view must shorten for every locale, not one').toMatch(
      /(?<!html:lang\(id\) )\.tasks-collection-toolbar \.collection-toolbar__save-view-label\s*\{[^}]*display:\s*none/s,
    )
    expect(css, 'the boxes must have a floor, not zero').toMatch(
      /\.tasks-collection-toolbar \.collection-toolbar__option-field\s*\{[^}]*min-width:\s*72px/s,
    )
  })

  it('gives the Indonesian Tasks search field room for its own placeholder between 1024 and 1440', () => {
    // #899: "Cari tugas" needs ~71px of input after ~32px of box chrome and Chromium's ~13px clear-button
    // reserve; 86px clipped it to "Cari tuga", and so did 106px.
    const compact = css.slice(css.indexOf('@media (min-width: 1024px) and (max-width: 1440px)'))
    expect(compact).toMatch(
      /html:lang\(id\) \.tasks-collection-toolbar \.collection-toolbar__query\s*\{[^}]*flex-basis:\s*120px;[^}]*min-width:\s*120px/s,
    )
    expect(compact).toMatch(
      /html:lang\(id\) \.tasks-collection-toolbar \.collection-toolbar__search\s*\{[^}]*min-width:\s*120px/s,
    )
    // English keeps its own floor; the id rule must not have widened it.
    expect(css).toMatch(/(?<!html:lang\(id\) )\.collection-toolbar__search\s*\{[^}]*min-width:\s*96px/s)
  })

  it('reserves enough desktop width for the ordinary Tasks filter values', () => {
    expect(css).toMatch(
      /@media\s*\(min-width:\s*1024px\)[\s\S]*?\[data-filter-id='group'\][\s\S]*?flex:\s*0 1 136px;[\s\S]*?max-width:\s*none;/s,
    )
    expect(css).toMatch(
      /@media\s*\(min-width:\s*1024px\)[\s\S]*?\[data-filter-id='business-unit'\][\s\S]*?flex:\s*0 1 100px;[\s\S]*?max-width:\s*none;/s,
    )
    expect(css).toMatch(
      /@media\s*\(min-width:\s*1024px\)[\s\S]*?\[data-filter-id='status'\]\s*\{[^}]*flex:\s*0 1 116px;[^}]*max-width:\s*none;[^}]*\}[\s\S]*?\[data-filter-id='status'\] \.collection-toolbar__select\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/s,
    )
    expect(css).toMatch(
      /@media\s*\(min-width:\s*1024px\)[\s\S]*?\[data-filter-id='person'\][\s\S]*?flex:\s*0 1 100px;[\s\S]*?max-width:\s*none;/s,
    )
    expect(css).toMatch(
      /@media\s*\(min-width:\s*1024px\)[\s\S]*?\[data-filter-id='sort'\][\s\S]*?flex:\s*0 1 142px;[\s\S]*?max-width:\s*none;/s,
    )
  })

  it('constrains popover triggers to their toolbar wrapper across font metrics', () => {
    expect(css).toMatch(
      /\.collection-toolbar__choice-trigger\s*\{[^}]*box-sizing:\s*border-box;[^}]*width:\s*100%;/s,
    )
  })

  // One search-field anatomy across collections at compact desktop (1024–1440px): Tasks keeps
  // its search icon, matching Signals/Projects/Objectives.
  it('keeps the Tasks search icon visible at compact desktop, matching every other collection', () => {
    const compact = css.slice(css.indexOf('@media (min-width: 1024px) and (max-width: 1440px)'))
    expect(compact).not.toMatch(/\.tasks-collection-toolbar \.collection-toolbar__search > svg\s*\{[^}]*display:\s*none/s)
  })

  it('keeps compact action text visible and removes the duplicate Status label at compact desktop', () => {
    expect(css).toMatch(
      /@media\s*\(min-width:\s*1024px\)\s*and\s*\(max-width:\s*1440px\)[\s\S]*?\.collection-toolbar__action-icon\s*\{[^}]*display:\s*none;/s,
    )
    expect(css).not.toMatch(/\.collection-toolbar__action-label\s*\{[^}]*display:\s*none;/s)
  })
})
