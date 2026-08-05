/**
 * MECH-GUARD — at most ONE solid/filled primary button per toolbar surface (structural layer).
 *
 * Owner catch: "Save view" rendered as a SOLID primary inside the toolbar, competing with the
 * page's one real primary CTA ("+ New task") — two filled blue buttons on one surface.
 * Skill rule mechanized: impeccable distill "Clear hierarchy: ONE primary action, few secondary
 * actions, everything else tertiary or hidden" (.claude/skills/impeccable/reference/distill.md);
 * impeccable critique "one primary element … everything else muted".
 *
 * Structure asserted (jsdom, class counts — the rendered-pixel version lives in
 * e2e/guards.geometry.spec.ts GUARD-PRIMARY): across every disclosure state of the one shared
 * CollectionToolbar grammar, the toolbar itself contributes ZERO resting `.btn-primary`
 * elements; only the transient save-confirm row may show one, and never more than one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { CollectionToolbar } from './collection-toolbar'

// #192 (Tasks) scope note: v4's version of this file ALSO enumerates the guard onto
// `pages/kitchen-review-page.tsx` (census DEFECT-2 — the Café Review queue previously rendered a
// solid-blue Approve on EVERY row). That enumeration is dropped here: kitchen-review-page.tsx on
// `dev` still has the old all-primary rendering (v4's fix is a 264-line rewrite of that page, not
// a one-line class change), and fixing it is Café/Kitchen surface work — #196, not this PR
// (docs/specs/v4-port.spec.md "Staging and merge shape" — surface-by-surface, one PR per surface).
// Flagged on wayfinder map #150 for #196 to pick up; not filed as a public GitHub issue (the defect
// describes exactly where the app over-emphasizes a bulk-destructive-adjacent action, which is the
// kind of detail CLAUDE.md's public-repo banner asks to keep out of the tracker until fixed).
// The toolbar-scoped coverage below (Tasks' own CollectionToolbar) is unaffected and stays.

function stubDesktopMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('768'), // desktop; the in-toolbar "View & filters" trigger renders
      media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
}

function renderToolbar() {
  return render(
    <I18nProvider>
      <CollectionToolbar
        presentation={{
          label: 'View', value: 'table',
          options: [{ value: 'table', label: 'Table' }, { value: 'card', label: 'Card' }],
          onChange: () => {},
        }}
        views={{
          label: 'Saved views', value: 'all',
          options: [{ value: 'all', label: 'All work' }, { value: 'my-work', label: 'My work' }],
          onChange: () => {},
        }}
        search={{ label: 'Search', placeholder: 'Search…', value: '', onChange: () => {} }}
        filters={[{
          id: 'status', label: 'Status', value: '',
          options: [{ value: '', label: 'Any' }, { value: 'Open', label: 'Open' }],
          onChange: () => {},
        }]}
        savedViews={{
          label: 'Saved views', selectedId: null, operation: 'idle',
          items: [{ id: 'v1', name: 'Riri weekly' }],
          onApply: () => {}, onSave: vi.fn(async () => {}),
        }}
      />
    </I18nProvider>,
  )
}

const solidPrimaries = () => document.querySelectorAll('.btn-primary')

beforeEach(() => {
  stubDesktopMatchMedia()
})

describe('GUARD-PRIMARY: the collection toolbar never grows a resting solid-primary button', () => {
  it('GUARD-PRIMARY: collapsed toolbar renders ZERO .btn-primary', () => {
    renderToolbar()
    expect(solidPrimaries()).toHaveLength(0)
  })

  it('GUARD-PRIMARY: the disclosed "View & filters" row renders ZERO .btn-primary — "Save view" stays ghost (the incident)', () => {
    renderToolbar()
    fireEvent.click(screen.getByRole('button', { name: /view & filters/i }))
    expect(solidPrimaries()).toHaveLength(0)
    // The exact regression: the Save-view TRIGGER must not be the solid primary variant.
    const saveTrigger = screen.getByRole('button', { name: /save view/i })
    expect(saveTrigger.className).not.toContain('btn-primary')
  })

  it('GUARD-PRIMARY: even the transient save-confirm row shows AT MOST one .btn-primary', () => {
    renderToolbar()
    fireEvent.click(screen.getByRole('button', { name: /view & filters/i }))
    fireEvent.click(screen.getByRole('button', { name: /save view/i }))
    expect(solidPrimaries().length).toBeLessThanOrEqual(1)
  })
})
