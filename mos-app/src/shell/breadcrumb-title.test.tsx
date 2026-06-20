/**
 * AC-S04b: BreadcrumbTitle context + Breadcrumb dynamic title integration.
 *
 * Tests:
 * 1. Provider/hook: useSetBreadcrumbTitle sets the title; clearing on unmount reverts.
 * 2. Breadcrumb render: on /tasks/:id with a title set, shows "Tasks › <name>".
 * 3. Breadcrumb render: on /tasks/:id with NO title (loading), shows "Tasks" only.
 * 4. Breadcrumb render: navigating away from /tasks/:id reverts the crumb to "Tasks".
 * 5. Existing /tasks/new still shows "Tasks › New task" (no regression).
 */
import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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
    </BreadcrumbTitleProvider>,
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
describe('AC-S04b: Breadcrumb shows task title on /tasks/:id', () => {
  it('shows "Tasks › <name>" on /tasks/:id when title is resolved', () => {
    const { container } = renderBreadcrumbAt('/tasks/abc-123', 'Fix the login bug')
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.getByText('Fix the login bug')).toBeInTheDocument()
    const separators = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
      .filter((el) => el.textContent === '›')
    expect(separators).toHaveLength(1)
    // The task name is bold (current crumb)
    const leaf = screen.getByText('Fix the login bug')
    expect(leaf.tagName.toLowerCase()).toBe('b')
    // "Tasks" is muted (intermediate), not bold
    expect(screen.getByText('Tasks').tagName.toLowerCase()).not.toBe('b')
  })

  it('shows "Tasks" only (no separator, no leaf) on /tasks/:id when title is NOT yet set (loading)', () => {
    const { container } = renderBreadcrumbAt('/tasks/abc-123') // no title
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    const separators = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
      .filter((el) => el.textContent === '›')
    expect(separators).toHaveLength(0)
  })

  it('title leaf has a title attribute (no-bleed) per AC-S03', () => {
    renderBreadcrumbAt('/tasks/abc-123', 'Very long task title that could overflow')
    const leaf = screen.getByText('Very long task title that could overflow')
    expect(leaf).toHaveAttribute('title', 'Very long task title that could overflow')
  })
})

// ── Regression: existing static leaves unaffected ────────────────────────────
describe('AC-S04b regression: existing static breadcrumb cases intact', () => {
  it('renders "Tasks" only on /tasks (section page)', () => {
    renderBreadcrumbAt('/tasks')
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.queryByText('›')).toBeNull()
  })

  it('renders "Tasks › New task" on /tasks/new regardless of context', () => {
    const { container } = renderBreadcrumbAt('/tasks/new')
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.getByText('New task')).toBeInTheDocument()
    const separators = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
      .filter((el) => el.textContent === '›')
    expect(separators).toHaveLength(1)
  })
})
