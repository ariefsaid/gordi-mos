import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Breadcrumb } from './breadcrumb'
import { SHOW_WEEKLY_UPDATES, SHOW_DAILY_LOG } from '@/config/features'

function renderBreadcrumb(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<Breadcrumb />} />
      </Routes>
    </MemoryRouter>,
  )
}

// AC-S04: breadcrumb drops the leading "Gordi MOS" brand crumb (ADR-0013 D1 — brand lives in top bar)
describe('AC-S04: Breadcrumb drops the leading brand crumb', () => {
  it('AC-S04: at /tasks, shows "Tasks" and no "Gordi MOS"', () => {
    renderBreadcrumb('/tasks')
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.queryByText('Gordi MOS')).toBeNull()
  })

  it('AC-S04: at /tasks/new, text content is "Tasks › New task" (no brand prefix)', () => {
    const { container } = renderBreadcrumb('/tasks/new')
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.getByText('New task')).toBeInTheDocument()
    expect(screen.queryByText('Gordi MOS')).toBeNull()
    // Exactly one › separator between Tasks and New task
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

// AC-004 (updated for ADR-0013 D1 / AC-S04): breadcrumb shows "<Section>" only — no brand prefix.
// The "Gordi MOS" brand crumb was dropped; it now lives in the TopBar brand column.
describe('AC-004: Breadcrumb per route (brand-crumb dropped per AC-S04)', () => {
  const cases: Array<{ path: string; section: string }> = [
    { path: '/', section: 'My Week' },
    { path: '/tasks', section: 'Tasks' },
    ...(SHOW_WEEKLY_UPDATES ? [{ path: '/updates', section: 'Weekly Updates' }] : []),
    ...(SHOW_DAILY_LOG ? [{ path: '/ops', section: 'Daily Log' }] : []),
  ]

  cases.forEach(({ path, section }) => {
    it(`renders "${section}" (bold) with no "Gordi MOS" prefix at path "${path}"`, () => {
      renderBreadcrumb(path)
      // No brand prefix — brand lives in TopBar
      expect(screen.queryByText('Gordi MOS')).toBeNull()
      // Section is the current page — rendered as <b>
      const sectionEl = screen.getByText(section)
      expect(sectionEl.tagName.toLowerCase()).toBe('b')
    })
  })
})

// IA-2 (updated for AC-S04): breadcrumb EXTENDS to the leaf on sub-pages.
// No brand prefix — format is "Section › Leaf" (one separator, two segments).
describe('IA-2: Breadcrumb extends to the leaf on sub-pages (no brand prefix)', () => {
  const leafCases: Array<{ path: string; section: string; leaf: string }> = [
    ...(SHOW_DAILY_LOG ? [
      { path: '/ops/new', section: 'Daily Log', leaf: 'Add log entry' },
      { path: '/ops/some-id/edit', section: 'Daily Log', leaf: 'Edit log entry' },
    ] : []),
    { path: '/tasks/new', section: 'Tasks', leaf: 'New task' },
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
