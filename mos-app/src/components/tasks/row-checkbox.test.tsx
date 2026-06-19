// RowCheckbox — the hover-revealed row selector (PR-2 AC-T02/T07).
// Presentational scaffolding: toggles a local selected set only; no bulk action ships.
// Keyboard-reachable (role=checkbox + tabIndex 0), exposes aria-checked incl. "mixed".
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RowCheckbox } from './row-checkbox'

function cssRuleBody(selector: string): string {
  const cssPath = resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css')
  const css = readFileSync(cssPath, 'utf8')
  const idx = css.indexOf(selector)
  expect(idx, `expected to find ${selector} in TasksWorkspace.css`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('RowCheckbox — AC-T07 aria-checked + keyboard', () => {
  it('AC-T07: exposes aria-checked="mixed" when indeterminate', () => {
    render(<RowCheckbox checked={false} indeterminate onChange={() => {}} label="Select task" />)
    const cb = screen.getByRole('checkbox', { name: 'Select task' })
    expect(cb.getAttribute('aria-checked')).toBe('mixed')
  })

  it('AC-T07: exposes aria-checked reflecting the checked prop when not indeterminate', () => {
    const { rerender } = render(<RowCheckbox checked={false} onChange={() => {}} label="Select task" />)
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('false')
    rerender(<RowCheckbox checked={true} onChange={() => {}} label="Select task" />)
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('true')
  })

  it('AC-T07: toggles via keyboard — Enter and Space both fire onChange', () => {
    const onChange = vi.fn()
    render(<RowCheckbox checked={false} onChange={onChange} label="Select task" />)
    const cb = screen.getByRole('checkbox', { name: 'Select task' })
    cb.focus()
    fireEvent.keyDown(cb, { key: 'Enter' })
    fireEvent.keyDown(cb, { key: ' ' })
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('AC-T07: is keyboard-focusable (tabIndex 0) with an accessible name', () => {
    render(<RowCheckbox checked={false} onChange={() => {}} label="Select Build forecast model" />)
    const cb = screen.getByRole('checkbox', { name: 'Select Build forecast model' })
    expect(cb.getAttribute('tabindex')).toBe('0')
    expect(cb.tagName).toBe('BUTTON')
  })
})

describe('RowCheckbox — AC-T02 reveal-on-hover CSS hook', () => {
  it('AC-T02: renders the row-checkbox class (the reveal CSS targets it)', () => {
    const { container } = render(<RowCheckbox checked={false} onChange={() => {}} label="Select task" />)
    expect(container.querySelector('button.row-checkbox')).toBeTruthy()
  })

  it('AC-T02: .row-checkbox is visibility:hidden at rest; revealed on hover/selected/focus-within', () => {
    const rest = cssRuleBody('.row-checkbox')
    expect(rest).toMatch(/visibility:\s*hidden/)
    // reveal selectors exist for hover, selected, and focus-within (keyboard path).
    // The rule may group them comma-separated, so assert each selector substring
    // appears and that the grouped reveal rule carries visibility:visible.
    const css = readFileSync(resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css'), 'utf8')
    expect(css).toContain('tr:hover .row-checkbox')
    expect(css).toContain('tr.row-selected .row-checkbox')
    expect(css).toContain('tr:focus-within .row-checkbox')
    // the reveal declaration itself
    expect(css).toMatch(/\.row-checkbox\s*,?\s*\{[^}]*visibility:\s*visible|tr:[a-z-]+\s+\.row-checkbox[^{]*\{[^}]*visibility:\s*visible/)
  })
})
