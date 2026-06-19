// RowMenu — the hover-revealed ⋯ row-actions trigger (PR-2 AC-T02).
// Stub popover: the only action this PR is "Open" → /tasks/:id (archive lives in
// the surface). The reveal is owned by `.row-menu` CSS in TasksWorkspace.css.
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RowMenu } from './row-menu'

function renderMenu(taskId = 'task-7') {
  return render(
    <MemoryRouter>
      <RowMenu taskId={taskId} />
    </MemoryRouter>,
  )
}

describe('RowMenu — AC-T02 reveal + actions', () => {
  it('AC-T02: ⋯ button has aria-label "Row actions" + the row-menu class (reveal hook)', () => {
    renderMenu()
    const btn = screen.getByRole('button', { name: /row actions/i })
    expect(btn.className).toContain('row-menu')
    expect(btn.getAttribute('aria-haspopup')).toBe('menu')
  })

  it('AC-T02: .row-menu is visibility:hidden at rest; revealed on hover/selected/focus-within', () => {
    const cssPath = resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css')
    const css = readFileSync(cssPath, 'utf8')
    const idx = css.indexOf('.row-menu')
    expect(idx).toBeGreaterThanOrEqual(0)
    const open = css.indexOf('{', idx)
    const close = css.indexOf('}', open)
    const rest = css.slice(open + 1, close)
    expect(rest).toMatch(/visibility:\s*hidden/)
    expect(css).toContain('tr:hover .row-menu')
    expect(css).toContain('tr.row-selected .row-menu')
    expect(css).toContain('tr:focus-within .row-menu')
  })

  it('opens a menu with an "Open" item linking to /tasks/:id', () => {
    renderMenu('task-7')
    // initially no Open link
    expect(screen.queryByRole('menuitem', { name: /open/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /row actions/i }))
    const openItem = screen.getByRole('menuitem', { name: /open/i })
    expect(openItem.getAttribute('href')).toBe('/tasks/task-7')
  })
})
