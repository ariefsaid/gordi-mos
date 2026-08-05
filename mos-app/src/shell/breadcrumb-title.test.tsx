/**
 * AC-S04b: BreadcrumbTitle context + Breadcrumb dynamic title integration.
 *
 * Tests:
 * 1. Provider/hook: useSetBreadcrumbTitle sets the title; clearing on unmount reverts.
 * 2. Breadcrumb render: on /tasks/:id with a title set, shows "Tasks › <name>".
 * 3. Breadcrumb render: on /tasks/:id with NO title (loading), shows "Tasks" only.
 * 4. Breadcrumb render: navigating away from /tasks/:id reverts the crumb to "Tasks".
 * 5. Existing /tasks/new still shows "Tasks › Create task" (no regression).
 */
import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { BreadcrumbTitleProvider, useBreadcrumbTitle, useSetBreadcrumbTitle } from './breadcrumb-title'
import { Breadcrumb } from './breadcrumb'

// ── Helper: renders Breadcrumb inside the provider + a given route ────────────
function renderBreadcrumbAt(
  path: string,
  dynamicTitle?: string,
) {
  // A leaf component that calls useSetBreadcrumbTitle if a title is provided
  function TitleSetter({ title }: { title: string }) {
    useSetBreadcrumbTitle(title)
    return null
  }

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

// ── Context unit tests ────────────────────────────────────────────────────────
describe('AC-S04b: BreadcrumbTitleProvider + hooks', () => {
  it('useBreadcrumbTitle returns null when no title is set', () => {
    let captured: string | null = 'initial'
    function Reader() {
      captured = useBreadcrumbTitle()
      return null
    }
    render(
      <BreadcrumbTitleProvider>
        <Reader />
      </BreadcrumbTitleProvider>,
    )
    expect(captured).toBeNull()
  })

  it('useSetBreadcrumbTitle sets the title visible via useBreadcrumbTitle', () => {
    let captured: string | null = null
    function Writer() {
      useSetBreadcrumbTitle('My Task Title')
      return null
    }
    function Reader() {
      captured = useBreadcrumbTitle()
      return null
    }
    render(
      <BreadcrumbTitleProvider>
        <Writer />
        <Reader />
      </BreadcrumbTitleProvider>,
    )
    expect(captured).toBe('My Task Title')
  })

  it('useSetBreadcrumbTitle clears the title on unmount', () => {
    let captured: string | null = 'placeholder'
    function Writer() {
      useSetBreadcrumbTitle('Will be cleared')
      return null
    }
    function Reader() {
      captured = useBreadcrumbTitle()
      return null
    }
    const { rerender } = render(
      <BreadcrumbTitleProvider>
        <Writer />
        <Reader />
      </BreadcrumbTitleProvider>,
    )
    expect(captured).toBe('Will be cleared')

    // Unmount Writer — title should clear
    act(() => {
      rerender(
        <BreadcrumbTitleProvider>
          <Reader />
        </BreadcrumbTitleProvider>,
      )
    })
    expect(captured).toBeNull()
  })
})

// ── Breadcrumb render integration ─────────────────────────────────────────────
// Note (FR-S03, plan §1.5/§4.1 regroup): the SECTION crumb for /tasks* routes is now
// the "Work" destination label (not the bare "Tasks" section) — see breadcrumb.test.tsx
// for the full FR-S03 coverage. This file focuses on the dynamic-title integration.
describe('AC-S04b: Breadcrumb shows task title on /work/tasks/:id', () => {
  it('shows "Work · <name>" on /work/tasks/:id when title is resolved', () => {
    const { container } = renderBreadcrumbAt('/work/tasks/abc-123', 'Fix the login bug')
    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(screen.getByText('Fix the login bug')).toBeInTheDocument()
    const separators = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
      .filter((el) => el.textContent === '·')
    expect(separators).toHaveLength(2)
    // The task name is bold (current crumb)
    const leaf = screen.getByText('Fix the login bug')
    expect(leaf.tagName.toLowerCase()).toBe('b')
    // "Work" is muted (intermediate), not bold
    expect(screen.getByText('Work').tagName.toLowerCase()).not.toBe('b')
  })

  it('shows "Work · Tasks" on /work/tasks/:id when title is NOT yet set (loading) — falls back to the destination\'s own section label, never blank', () => {
    const { container } = renderBreadcrumbAt('/work/tasks/abc-123') // no title
    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    const separators = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
      .filter((el) => el.textContent === '·')
    expect(separators).toHaveLength(1)
  })

  it('title leaf has a title attribute (no-bleed) per AC-S03', () => {
    renderBreadcrumbAt('/work/tasks/abc-123', 'Very long task title that could overflow')
    const leaf = screen.getByText('Very long task title that could overflow')
    expect(leaf).toHaveAttribute('title', 'Very long task title that could overflow')
  })
})

// ── Regression: existing static leaves unaffected (beyond the FR-S03 relabel) ─
describe('AC-S04b regression: existing static breadcrumb cases intact', () => {
  it('renders "Work · Tasks" on /work/tasks (section page, FR-S03 regroup)', () => {
    const { container } = renderBreadcrumbAt('/work/tasks')
    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    const separators = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
      .filter((el) => el.textContent === '·')
    expect(separators).toHaveLength(1)
  })

  it('renders "Work · Tasks · Create task" on /work/tasks/new regardless of context', () => {
    const { container } = renderBreadcrumbAt('/work/tasks/new')
    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(screen.getByText('Create task')).toBeInTheDocument()
    const separators = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
      .filter((el) => el.textContent === '·')
    expect(separators).toHaveLength(2)
  })
})
