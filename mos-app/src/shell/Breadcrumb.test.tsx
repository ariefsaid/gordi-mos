import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Breadcrumb from './Breadcrumb'

function renderBreadcrumb(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<Breadcrumb />} />
      </Routes>
    </MemoryRouter>,
  )
}

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

// AC-004: breadcrumb shows "Gordi MOS › <Section>" with the section bold/emphasized
describe('AC-004: Breadcrumb per route', () => {
  const cases: Array<{ path: string; section: string }> = [
    { path: '/', section: 'My Week' },
    { path: '/tasks', section: 'Tasks' },
    { path: '/updates', section: 'Weekly Updates' },
    { path: '/ops', section: 'Daily Log' },
  ]

  cases.forEach(({ path, section }) => {
    it(`renders "Gordi MOS › ${section}" at path "${path}"`, () => {
      renderBreadcrumb(path)
      // Muted "Gordi MOS" segment
      expect(screen.getByText('Gordi MOS')).toBeInTheDocument()
      // Emphasized section segment: rendered as <b> with font-semibold
      const sectionEl = screen.getByText(section)
      expect(sectionEl.tagName.toLowerCase()).toBe('b')
    })
  })
})
