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

// AC-004: breadcrumb shows "Gordi MOS › <Section>" with the section bold/emphasized
describe('AC-004: Breadcrumb per route', () => {
  const cases: Array<{ path: string; section: string }> = [
    { path: '/', section: 'My Week' },
    { path: '/tasks', section: 'Tasks' },
    { path: '/updates', section: 'Updates' },
    { path: '/ops', section: 'Ops' },
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
