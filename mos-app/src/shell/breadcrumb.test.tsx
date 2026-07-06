import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { Breadcrumb } from './breadcrumb'

function renderBreadcrumb(path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<Breadcrumb />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

// AC-S04: breadcrumb drops the leading "Gordi MOS" brand crumb (ADR-0013 D1 — brand lives in top bar)
describe('AC-S04: Breadcrumb drops the leading brand crumb', () => {
  it('AC-S04: at /tasks, shows "Work › Tasks" and no "Gordi MOS"', () => {
    renderBreadcrumb('/tasks')
    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.queryByText('Gordi MOS')).toBeNull()
  })

  it('AC-S04: at /tasks/new, text content is "Work › New task" (no brand prefix)', () => {
    const { container } = renderBreadcrumb('/tasks/new')
    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(screen.getByText('New task')).toBeInTheDocument()
    expect(screen.queryByText('Gordi MOS')).toBeNull()
    // Exactly one › separator between Work and New task
    const separators = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
      .filter((el) => el.textContent === '›')
    expect(separators).toHaveLength(1)
  })
})

// FIX-4: 404 breadcrumb — no orphan separator, no aria-current on unknown route
describe('FIX-4: Breadcrumb at unknown path — no orphan separator', () => {
  it('does NOT render the › separator when no section exists (unknown path)', () => {
    const { container } = renderBreadcrumb('/unknown-route-xyz')
    // The separator span should not be present when there's no section
    const separators = container.querySelectorAll('[aria-hidden="true"]')
    // Either no separator span at all, or zero rendered chars matching ›
    const orphanSep = Array.from(separators).find((el) => el.textContent === '›')
    expect(orphanSep).toBeUndefined()
  })

  it('does NOT have aria-current on any nav item when at an unknown path (NotFound has no section)', () => {
    // Breadcrumb renders "Gordi MOS" with no active section — no nav item should claim aria-current
    const { container } = renderBreadcrumb('/some-unknown-path')
    const currentEls = container.querySelectorAll('[aria-current]')
    expect(currentEls.length).toBe(0)
  })
})

// AC-004 (updated for ADR-0013 D1 / AC-S04, FR-S03): breadcrumb shows "<Section>" only for a
// single-link destination (Home), and "<Destination> › <Leaf>" for a multi/regrouped route.
describe('AC-004: Breadcrumb per route (brand-crumb dropped per AC-S04)', () => {
  it('renders "Home" (bold, no leaf) at "/" — the single-link Home destination', () => {
    renderBreadcrumb('/')
    expect(screen.queryByText('Gordi MOS')).toBeNull()
    const sectionEl = screen.getByText('Home')
    expect(sectionEl.tagName.toLowerCase()).toBe('b')
  })

  it('renders "Work › Tasks" at "/tasks" (FR-S03: destination label as section, own label as leaf)', () => {
    renderBreadcrumb('/tasks')
    expect(screen.queryByText('Gordi MOS')).toBeNull()
    expect(screen.getByText('Work').tagName.toLowerCase()).not.toBe('b')
    expect(screen.getByText('Tasks').tagName.toLowerCase()).toBe('b')
  })
})

// FR-S03 (spec home-v1): every /kitchen/* route reads "Operate › <own label>".
describe('FR-S03: Kitchen routes read "Operate › <Log|Plan|Stock|Review|Pushes>"', () => {
  const kitchenCases = [
    { path: '/kitchen/log', leaf: 'Log' },
    { path: '/kitchen/plan', leaf: 'Plan' },
    { path: '/kitchen/stock', leaf: 'Stock' },
    { path: '/kitchen/review', leaf: 'Review' },
    { path: '/kitchen/pushes', leaf: 'Pushes' },
  ]

  kitchenCases.forEach(({ path, leaf }) => {
    it(`renders "Operate › ${leaf}" at "${path}"`, () => {
      const { container } = renderBreadcrumb(path)
      expect(screen.getByText('Operate')).toBeInTheDocument()
      const leafEl = screen.getByText(leaf)
      expect(leafEl.tagName.toLowerCase()).toBe('b')
      const separators = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
        .filter((el) => el.textContent === '›')
      expect(separators).toHaveLength(1)
    })
  })
})

// FR-424 (nav-five-destinations): the relocated Work manage routes + the Plan Sales link + the
// Operate Daily Log all resolve through their owning destination — "Work › Objectives",
// "Work › Projects & Processes", "Plan › Sales", "Operate › Daily Log".
describe('AC-408: breadcrumb resolves manage/Plan/Operate routes through their destination (FR-424)', () => {
  const cases = [
    { path: '/work/objectives', section: 'Work', leaf: 'Objectives' },
    { path: '/work/projects-processes', section: 'Work', leaf: 'Projects & Processes' },
    { path: '/sales', section: 'Plan', leaf: 'Sales' },
    { path: '/ops', section: 'Operate', leaf: 'Daily Log' },
  ]

  for (const { path, section, leaf } of cases) {
    it(`renders "${section} › ${leaf}" at "${path}"`, () => {
      const { container } = renderBreadcrumb(path)
      expect(screen.getByText(section)).toBeInTheDocument()
      const leafEl = screen.getByText(leaf)
      expect(leafEl.tagName.toLowerCase()).toBe('b')
      const separators = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
        .filter((el) => el.textContent === '›')
      expect(separators).toHaveLength(1)
    })
  }
})

// Routes NOT owned by a destination (Admin, cascade catalog, Sales — drill-only or
// role-gated manage surfaces) keep resolving via sectionForPath's own label, unaffected.
describe('Routes outside DESTINATIONS resolve via their own section label (unaffected)', () => {
  it('renders "People" (bold, no destination prefix) at /admin/people', () => {
    renderBreadcrumb('/admin/people')
    expect(screen.getByText('People').tagName.toLowerCase()).toBe('b')
  })
})

// IA-2 (updated for AC-S04/FR-S03): breadcrumb EXTENDS to the leaf on sub-pages.
// No brand prefix — format is "Destination › Leaf" (one separator, two segments).
describe('IA-2: Breadcrumb extends to the leaf on sub-pages (no brand prefix)', () => {
  const leafCases: Array<{ path: string; section: string; leaf: string }> = [
    { path: '/tasks/new', section: 'Work', leaf: 'New task' },
  ]

  for (const { path, section, leaf } of leafCases) {
    it(`renders "${section} › ${leaf}" at "${path}" (leaf bold, section muted, no brand prefix)`, () => {
      const { container } = renderBreadcrumb(path)
      // No brand prefix (AC-S04 deliberate UX change — brand lives in TopBar)
      expect(screen.queryByText('Gordi MOS')).toBeNull()
      // Two segments + one › separator
      expect(screen.getByText(section)).toBeInTheDocument()
      expect(screen.getByText(leaf)).toBeInTheDocument()
      const separators = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
        .filter((el) => el.textContent === '›')
      expect(separators).toHaveLength(1)
      // Leaf is bold (current page); section is muted
      const leafEl = screen.getByText(leaf)
      expect(leafEl.tagName.toLowerCase()).toBe('b')
      expect(screen.getByText(section).tagName.toLowerCase()).not.toBe('b')
    })
  }
})
