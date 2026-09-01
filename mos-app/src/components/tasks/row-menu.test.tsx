// RowMenu — the hover-revealed ⋯ row-actions trigger (PR-2 AC-T02).
// Stub popover: the only action this PR is "Open full page" → /tasks/:id (archive lives in
// the surface). The reveal is owned by `.row-menu` CSS in TasksWorkspace.css.
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RowMenu } from './row-menu'

function renderMenu(taskId = 'task-7', recordSearch = '') {
  return render(
    <MemoryRouter>
      <RowMenu taskId={taskId} recordSearch={recordSearch} />
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

  it('opens a menu with an "Open full page" item linking to /tasks/:id?view=overdue', () => {
    renderMenu('task-7', '?view=overdue')
    // initially no Open full page link
    expect(screen.queryByRole('menuitem', { name: /open full page/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /row actions/i }))
    const openItem = screen.getByRole('menuitem', { name: 'Open full page' })
    expect(openItem.getAttribute('href')).toBe('/work/tasks/task-7?view=overdue')
  })
})

// Convention audit 2026-07-18: RowMenu joins the shared popover contract.
function renderRowMenu() {
  return render(
    <MemoryRouter>
      <RowMenu taskId="t-1" recordSearch="?view=overdue" />
    </MemoryRouter>,
  )
}

describe('RowMenu — dismissal (useMenuPopover)', () => {
  it('Escape closes the menu', async () => {
    const user = userEvent.setup()
    renderRowMenu()
    await user.click(screen.getByRole('button', { name: /row actions/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('outside mousedown closes the menu', async () => {
    const user = userEvent.setup()
    renderRowMenu()
    await user.click(screen.getByRole('button', { name: /row actions/i }))
    fireEvent.mouseDown(document.body)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })
})
