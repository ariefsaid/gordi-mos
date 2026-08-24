import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { BreadcrumbTitleProvider } from './breadcrumb-title'
import { Breadcrumb } from './breadcrumb'

// Breadcrumb reads useBreadcrumbTitle for the dynamic task title (AC-019).
function renderBC(path: string) {
  return render(
    <I18nProvider>
      <BreadcrumbTitleProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="*" element={<nav aria-label="Breadcrumb"><Breadcrumb /></nav>} />
          </Routes>
        </MemoryRouter>
      </BreadcrumbTitleProvider>
    </I18nProvider>,
  )
}

// Helper: the breadcrumb's full text content (labels joined by · separators).
// Normalize the · separator spacing (it's rendered with CSS margins, so textContent
// has no surrounding spaces) to match the §9 visual "Work · Tasks".
function crumbText() {
  const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
  return (nav.textContent?.replace(/\s+/g, ' ').replace(/\s*·\s*/g, ' · ').trim() ?? '')
}

beforeEach(() => {
  vi.clearAllMocks()
})

// AC-018: · separator, last segment bold, no brand prefix (§9 table).
describe('AC-018: Breadcrumb — · separator, new destinations (§9 table)', () => {
  it('/ → "Home"', () => {
    renderBC('/')
    expect(crumbText()).toBe('Home')
  })

  it('/work/tasks → "Work · Tasks"', () => {
    renderBC('/work/tasks')
    expect(crumbText()).toBe('Work · Tasks')
  })

  it('/work/tasks?view=mine → "Work · Tasks · My work"', () => {
    renderBC('/work/tasks?view=mine')
    expect(crumbText()).toBe('Work · Tasks · My work')
  })

  it('/work/signals → "Work · Signals"', () => {
    renderBC('/work/signals')
    expect(crumbText()).toBe('Work · Signals')
  })

  // #444 — a ship-gated path resolves to NOTHING, the same answer an unknown path gets, and for
  // the same reason: nothing routes there. `/work/projects`, `/work/objectives`, `/work/events`,
  // `/money` and `/money/detail` each read "Work · …" / "Money · …" here until the gate closed
  // them. Printing a crumb for a surface the router forwards away from would name a page the
  // viewer is not on. Delete a path from SHIP_GATED_PATHS and its crumb comes back with no edit
  // to breadcrumb.tsx.
  it.each(['/work/projects', '/work/objectives', '/work/events', '/money', '/money/detail'])(
    'the ship-gated %s renders no crumb at all',
    (path) => {
      renderBC(path)
      expect(crumbText()).toBe('')
    },
  )

  it('/inbox → "Inbox"', () => {
    renderBC('/inbox')
    expect(crumbText()).toBe('Inbox')
  })

  it('/cafe/log → "Café"', () => {
    renderBC('/cafe/log')
    expect(crumbText()).toBe('Café')
  })

  it('/cafe/review → "Café · Review"', () => {
    renderBC('/cafe/review')
    expect(crumbText()).toBe('Café · Review')
  })

  it('/admin/people → "Admin Settings · People"', () => {
    renderBC('/admin/people')
    expect(crumbText()).toBe('Admin Settings · People')
  })

  it('/profile → "Personal Profile"', () => {
    renderBC('/profile')
    expect(crumbText()).toBe('Personal Profile')
  })

  it('uses the · separator (not ›)', () => {
    const { container } = renderBC('/work/tasks')
    expect(container.textContent).toContain('·')
    expect(container.textContent).not.toContain('›')
  })

  it('last segment is bold (<b>)', () => {
    renderBC('/work/tasks')
    const bold = screen.getByText('Tasks')
    expect(bold.tagName).toBe('B')
  })

  it('no brand prefix — does not start with "Gordi"', () => {
    renderBC('/work/tasks')
    expect(crumbText().startsWith('Gordi')).toBe(false)
  })

  it('renders nothing for an unknown/404 route (empty breadcrumb)', () => {
    renderBC('/unknown-xyz')
    // Breadcrumb returns null for an unknown route — the nav wrapper is empty.
    expect(crumbText()).toBe('')
  })
})
