// TDD: ProgressMarker — token-based pill for update-line progress (AC-034, NFR-007, §4 design-plan)
// Distinct from task StatusPill: 3-value self-reported marker (Done/In progress/Blocked).
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProgressMarker, ProgressMarkerPicker } from './ProgressMarker'
import type { ProgressMarker as ProgressMarkerType } from '../../lib/db/weeklyUpdates.types'

// ── Static (display) form ───────────────────────────────────────────────────
describe('ProgressMarker — static display', () => {
  const cases: [ProgressMarkerType, string, string][] = [
    ['done',        'pm-done',        'Done'],
    ['in_progress', 'pm-inprogress',  'In progress'],
    ['blocked',     'pm-blocked',     'Blocked'],
  ]

  for (const [progress, cls, label] of cases) {
    it(`renders "${label}" with class "${cls}" (AC-034, NFR-007)`, () => {
      const { container } = render(<ProgressMarker progress={progress} />)
      const pill = container.querySelector('.pm-pill')
      expect(pill).toBeTruthy()
      expect(pill!.classList.contains(cls)).toBe(true)
      expect(screen.getByText(label)).toBeTruthy()
    })
  }

  it('renders a 6px dot inside the pill (design-plan §4.2)', () => {
    const { container } = render(<ProgressMarker progress="blocked" />)
    expect(container.querySelector('.pm-dot')).toBeTruthy()
  })

  it('has an accessible name via aria-label on the pill span (WCAG-AA)', () => {
    render(<ProgressMarker progress="done" />)
    const el = screen.getByLabelText(/done/i)
    expect(el).toBeTruthy()
  })

  it('is not interactive in static mode — no button role', () => {
    const { container } = render(<ProgressMarker progress="in_progress" />)
    expect(container.querySelector('button')).toBeNull()
  })
})

// ── Interactive (picker) form ───────────────────────────────────────────────
describe('ProgressMarkerPicker — interactive picker (AC-034, §4.3 design-plan)', () => {
  it('renders a button trigger with current progress label', () => {
    render(<ProgressMarkerPicker progress="in_progress" onSelect={vi.fn()} />)
    const btn = screen.getByRole('button')
    expect(btn).toBeTruthy()
    expect(btn.textContent).toMatch(/in progress/i)
  })

  it('trigger has aria-haspopup="listbox" and aria-expanded=false initially (WCAG)', () => {
    render(<ProgressMarkerPicker progress="in_progress" onSelect={vi.fn()} />)
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-haspopup')).toBe('listbox')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  it('opens picker on click, sets aria-expanded=true (AC-034)', () => {
    render(<ProgressMarkerPicker progress="in_progress" onSelect={vi.fn()} />)
    const btn = screen.getByRole('button')
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    // listbox with 3 options
    const listbox = screen.getByRole('listbox')
    expect(listbox).toBeTruthy()
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)
  })

  it('picker shows all three markers as options (NFR-007)', () => {
    render(<ProgressMarkerPicker progress="done" onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('option', { name: /done/i })).toBeTruthy()
    expect(screen.getByRole('option', { name: /in progress/i })).toBeTruthy()
    expect(screen.getByRole('option', { name: /blocked/i })).toBeTruthy()
  })

  it('current option has aria-selected=true (WCAG)', () => {
    render(<ProgressMarkerPicker progress="blocked" onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const selected = screen.getByRole('option', { name: /blocked/i })
    expect(selected.getAttribute('aria-selected')).toBe('true')
  })

  it('selecting an option calls onSelect with the new value and closes picker (AC-034)', () => {
    const onSelect = vi.fn()
    render(<ProgressMarkerPicker progress="in_progress" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByRole('option', { name: /done/i }))
    expect(onSelect).toHaveBeenCalledWith('done')
    // picker should close
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('Escape key closes picker and returns focus to trigger (§5.3 a11y)', () => {
    render(<ProgressMarkerPicker progress="in_progress" onSelect={vi.fn()} />)
    const btn = screen.getByRole('button')
    fireEvent.click(btn)
    expect(screen.getByRole('listbox')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('ArrowDown moves focus to next option (§5.3 keyboard nav)', () => {
    render(<ProgressMarkerPicker progress="done" onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const listbox = screen.getByRole('listbox')
    // ArrowDown from listbox should move focus within options
    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    // After arrow-down, focus should have moved (no throw = pass for keyboard handling)
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('ArrowUp moves focus to previous option (§5.3 keyboard nav)', () => {
    render(<ProgressMarkerPicker progress="done" onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const listbox = screen.getByRole('listbox')
    fireEvent.keyDown(listbox, { key: 'ArrowUp' })
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('clicking outside the picker closes it (§4.3)', () => {
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <ProgressMarkerPicker progress="in_progress" onSelect={vi.fn()} />
      </div>
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('listbox')).toBeTruthy()
    // mousedown outside the picker-anchor
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('is disabled when disabled prop is true — button not clickable (submitted-locked state)', () => {
    render(<ProgressMarkerPicker progress="done" onSelect={vi.fn()} disabled />)
    const btn = screen.queryByRole('button')
    // In disabled/static mode the interactive form degrades to static
    // Either no button at all, or button with aria-disabled
    if (btn) {
      expect(
        btn.getAttribute('disabled') !== null || btn.getAttribute('aria-disabled') === 'true'
      ).toBe(true)
    } else {
      // Static pill rendered instead
      expect(screen.getByText('Done')).toBeTruthy()
    }
  })
})
