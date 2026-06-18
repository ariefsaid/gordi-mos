import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Breadcrumb from './Breadcrumb'
import { SHOW_WEEKLY_UPDATES, SHOW_DAILY_LOG } from '../config/features'

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
  // Hidden sections (config/features.ts) don't resolve to a breadcrumb section — gate them.
  const cases: Array<{ path: string; section: string }> = [
    { path: '/', section: 'My Week' },
    { path: '/tasks', section: 'Tasks' },
    ...(SHOW_WEEKLY_UPDATES ? [{ path: '/updates', section: 'Weekly Updates' }] : []),
    ...(SHOW_DAILY_LOG ? [{ path: '/ops', section: 'Daily Log' }] : []),
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

// IA-2 (PR-2): the shell breadcrumb EXTENDS to the leaf on sub-pages, so the
// redundant in-page `/`-separated crumbs could be removed. One `›` separator.
describe('IA-2: Breadcrumb extends to the leaf on sub-pages', () => {
  // /ops/* leaves only resolve when Daily Log is shown (config/features.ts).
  const leafCases: Array<{ path: string; section: string; leaf: string }> = [
    ...(SHOW_DAILY_LOG ? [
      { path: '/ops/new', section: 'Daily Log', leaf: 'Add log entry' },
      { path: '/ops/some-id/edit', section: 'Daily Log', leaf: 'Edit log entry' },
    ] : []),
    { path: '/tasks/new', section: 'Tasks', leaf: 'New task' },
  ]

  for (const { path, section, leaf } of leafCases) {
    it(`renders "Gordi MOS › ${section} › ${leaf}" at "${path}" (leaf bold, section muted)`, () => {
      const { container } = renderBreadcrumb(path)
      // Three segments + two › separators
      expect(screen.getByText('Gordi MOS')).toBeInTheDocument()
      expect(screen.getByText(section)).toBeInTheDocument()
      expect(screen.getByText(leaf)).toBeInTheDocument()
      const separators = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
        .filter(el => el.textContent === '›')
      expect(separators).toHaveLength(2)
      // The leaf (current page) is bold; the section de-emphasizes to a muted span
      const leafEl = screen.getByText(leaf)
      expect(leafEl.tagName.toLowerCase()).toBe('b')
      expect(screen.getByText(section).tagName.toLowerCase()).not.toBe('b')
    })
  }
})
