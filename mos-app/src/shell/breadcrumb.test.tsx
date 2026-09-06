import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMemo } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { BreadcrumbTitleProvider, useSetBreadcrumbTitle, useSetCollectionLeaf } from './breadcrumb-title'
import { Breadcrumb } from './breadcrumb'
import { SHIP_GATED_PATHS } from '@/lib/ship-gate'
import { useT } from '@/i18n/use-t'

function TestCollectionChrome() {
  const { search } = useLocation()
  const t = useT()
  const view = new URLSearchParams(search).get('view')
  const canonical = view === 'mine' ? 'my-work' : view ?? 'all'
  const leaf = useMemo(() => ({
    label: canonical === 'my-work' ? t('tasks.saved.mine') : canonical === 'overdue' ? t('followUps.overdue') : t('tasks.saved.followups'),
    hasNonDefaultView: canonical !== 'all',
  }), [canonical, t])
  useSetCollectionLeaf(leaf)
  return null
}

// Breadcrumb reads useBreadcrumbTitle for the dynamic task title (AC-019).
function renderBC(path: string) {
  return render(
    <I18nProvider>
      <BreadcrumbTitleProvider>
        <MemoryRouter initialEntries={[path]}>
          <TestCollectionChrome />
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
  it.each([...SHIP_GATED_PATHS, '/money/detail'])(
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

// #410: the ?view= leaf map and the create-task leaf were hardcoded English (module-level
// literals), so an Indonesian viewer read "Work · Tasks · My work" around a translated shell.
describe('breadcrumb leaves resolve the id locale (#410)', () => {
  beforeEach(() => localStorage.setItem('mos.locale', 'id'))
  afterEach(() => localStorage.removeItem('mos.locale'))

  it('?view=mine leaf renders Pekerjaan saya, not My work', () => {
    renderBC('/work/tasks?view=mine')
    expect(crumbText()).toContain('Pekerjaan saya')
    expect(crumbText()).not.toContain('My work')
  })

  it('?view=overdue leaf renders Terlambat', () => {
    renderBC('/work/tasks?view=overdue')
    expect(crumbText()).toContain('Terlambat')
    expect(crumbText()).not.toContain('Overdue')
  })

  it('?view=followups leaf renders the id AR Follow-up label', () => {
    renderBC('/work/tasks?view=followups')
    expect(crumbText()).not.toContain('AR Follow-ups') // id label is 'AR Follow-up' (no s)
  })

  it('/work/tasks/new leaf renders Buat tugas, not Create task', () => {
    renderBC('/work/tasks/new')
    expect(crumbText()).toContain('Buat tugas')
    expect(crumbText()).not.toContain('Create task')
  })
})

// ── AC-020 (#755, A-3 / FR-020): below rail-collapse the header shows the LEAF title only ──
// A phone header has no room for a trail of ancestors: "Work · Tasks ·" with a dangling
// separator names places the viewer navigated PAST (audit F-9). The leaf is never empty —
// a record page shows the record title, a collection page the collection leaf.
function setNarrow(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }),
  })
}

function TitleSetter({ title }: { title: string }) {
  useSetBreadcrumbTitle(title)
  return null
}

function renderBCNarrow(path: string, dynamicTitle?: string) {
  setNarrow(true)
  return render(
    <I18nProvider>
      <BreadcrumbTitleProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  {dynamicTitle && <TitleSetter title={dynamicTitle} />}
                  <Breadcrumb />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </BreadcrumbTitleProvider>
    </I18nProvider>,
  )
}

describe('AC-020: below rail-collapse the breadcrumb is the leaf title only (A-3)', () => {
  it('390 task page: the record title only — no Work crumb, no Tasks crumb, no · separator', () => {
    const { container } = renderBCNarrow('/work/tasks/abc-123', 'Fix the grinder')
    expect(screen.getByText('Fix the grinder')).toBeInTheDocument()
    expect(screen.queryByText('Work')).toBeNull()
    expect(screen.queryByText('Tasks')).toBeNull()
    const separators = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
      .filter((el) => el.textContent === '·')
    expect(separators).toHaveLength(0)
  })

  it('390 collection page: the collection leaf only', () => {
    const { container } = renderBCNarrow('/work/tasks')
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.queryByText('Work')).toBeNull()
    const separators = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
      .filter((el) => el.textContent === '·')
    expect(separators).toHaveLength(0)
  })

  it('the leaf is never empty: an unresolved record title falls back to the collection leaf', () => {
    renderBCNarrow('/work/tasks/abc-123')
    expect(screen.getByText('Tasks')).toBeInTheDocument()
  })

  it('the leaf carries the location when the phone surface cannot (a non-tab destination)', () => {
    // Rule 5: a Work child's leaf does NOT claim aria-current at phone width — the bottom-tab
    // Work entry owns the location. A destination with no tab (Admin) is owned by the leaf.
    renderBCNarrow('/admin/people')
    const leaf = screen.getByText('People')
    expect(leaf).toHaveAttribute('aria-current', 'page')
  })
})
