// WindowSelector tests — the window control (design-plan §2.6, FR-013/014, AC-013/014).
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WindowSelector } from './window-selector'
import type { WindowSpec } from '@/lib/dashboard'

const BOUNDS = { earliest: '2026-05-03', latest: '2026-07-01' }

describe('WindowSelector — preset seg', () => {
  it('AC-013: renders 7d / 30d / 60d preset buttons in a tablist', () => {
    render(
      <WindowSelector
        value={{ kind: 'preset', days: 30 }}
        onChange={vi.fn()}
        bounds={BOUNDS}
      />,
    )
    expect(screen.getByRole('tablist', { name: /time window/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /7d/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /30d/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /60d/i })).toBeInTheDocument()
  })

  it('AC-013: marks the active preset aria-selected=true', () => {
    render(
      <WindowSelector
        value={{ kind: 'preset', days: 30 }}
        onChange={vi.fn()}
        bounds={BOUNDS}
      />,
    )
    expect(screen.getByRole('tab', { name: /30d/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /7d/i })).toHaveAttribute('aria-selected', 'false')
  })

  it('AC-013: clicking 7d emits a preset-7 spec', () => {
    const onChange = vi.fn()
    render(
      <WindowSelector
        value={{ kind: 'preset', days: 30 }}
        onChange={onChange}
        bounds={BOUNDS}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /7d/i }))
    expect(onChange).toHaveBeenCalledWith({ kind: 'preset', days: 7 })
  })

  it('AC-013: clicking 60d emits a preset-60 spec', () => {
    const onChange = vi.fn()
    render(
      <WindowSelector
        value={{ kind: 'preset', days: 30 }}
        onChange={onChange}
        bounds={BOUNDS}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /60d/i }))
    expect(onChange).toHaveBeenCalledWith({ kind: 'preset', days: 60 })
  })

  it('arrow-key navigates the presets (roving tabindex)', () => {
    const onChange = vi.fn()
    render(
      <WindowSelector
        value={{ kind: 'preset', days: 7 }}
        onChange={onChange}
        bounds={BOUNDS}
      />,
    )
    const tab7 = screen.getByRole('tab', { name: /7d/i })
    tab7.focus()
    fireEvent.keyDown(tab7, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith({ kind: 'preset', days: 30 })
  })

  it('r5 F-4: focus FOLLOWS selection — "Custom" is genuinely arrow-reachable (ArrowRight from 60d)', () => {
    const onChange = vi.fn()
    render(
      <WindowSelector
        value={{ kind: 'preset', days: 60 }}
        onChange={onChange}
        bounds={BOUNDS}
      />,
    )
    const tab60 = screen.getByRole('tab', { name: /60d/i })
    tab60.focus()
    fireEvent.keyDown(tab60, { key: 'ArrowRight' })
    // Selection emitted the seeded custom spec AND focus landed on the Custom tab —
    // never stranded on the old tabIndex=-1 button.
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'custom' }),
    )
    expect(screen.getByRole('tab', { name: /custom/i })).toHaveFocus()
  })
})

describe('WindowSelector — custom date range', () => {
  it('DO F12 (OD-91 #25): when the window is custom, the Custom tab carries the selected state (white-card style binds to aria-selected)', () => {
    render(
      <WindowSelector
        value={{ kind: 'custom', from: '2026-06-10', to: '2026-06-20' }}
        onChange={vi.fn()}
        bounds={BOUNDS}
      />,
    )
    // The Custom tab — not a preset — owns aria-selected while custom is active; the seg's
    // `[aria-selected='true']` white-card rule follows it, so the active tab reads as selected.
    expect(screen.getByRole('tab', { name: /custom/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /30d/i })).toHaveAttribute('aria-selected', 'false')
  })

  it('DO-21: hideRange suppresses the inline pair so the composition can place it on its own row', () => {
    const { container } = render(
      <WindowSelector
        value={{ kind: 'custom', from: '2026-06-10', to: '2026-06-20' }}
        onChange={vi.fn()}
        bounds={BOUNDS}
        hideRange
      />,
    )
    expect(container.querySelector('.window-selector-range')).toBeNull()
    // The seg itself is untouched — only the pair moves.
    expect(screen.getByRole('tab', { name: /custom/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('renders a Custom button', () => {
    render(
      <WindowSelector
        value={{ kind: 'preset', days: 30 }}
        onChange={vi.fn()}
        bounds={BOUNDS}
      />,
    )
    expect(screen.getByRole('tab', { name: /custom/i })).toBeInTheDocument()
  })

  it('AC-014: selecting Custom emits a custom spec seeded from the bounds', () => {
    const onChange = vi.fn()
    render(
      <WindowSelector
        value={{ kind: 'preset', days: 30 }}
        onChange={onChange}
        bounds={BOUNDS}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /custom/i }))
    const spec = onChange.mock.calls[0][0] as WindowSpec
    expect(spec.kind).toBe('custom')
    if (spec.kind === 'custom') {
      expect(spec.from).toBeTruthy()
      expect(spec.to).toBe(BOUNDS.latest)
    }
  })

  it('AC-014: when Custom is active, two bounded date inputs render', () => {
    render(
      <WindowSelector
        value={{ kind: 'custom', from: '2026-06-10', to: '2026-06-20' }}
        onChange={vi.fn()}
        bounds={BOUNDS}
      />,
    )
    const fromInput = screen.getByLabelText(/from/i) as HTMLInputElement
    const toInput = screen.getByLabelText(/to/i) as HTMLInputElement
    expect(fromInput).toBeInTheDocument()
    expect(toInput).toBeInTheDocument()
    // Bounded to the available snapshot window (AC-014 — disabled outside).
    expect(fromInput.min).toBe(BOUNDS.earliest)
    expect(fromInput.max).toBe(BOUNDS.latest)
    expect(toInput.min).toBe(BOUNDS.earliest)
    expect(toInput.max).toBe(BOUNDS.latest)
  })

  it('AC-014: changing the from date emits a custom spec', () => {
    const onChange = vi.fn()
    render(
      <WindowSelector
        value={{ kind: 'custom', from: '2026-06-10', to: '2026-06-20' }}
        onChange={onChange}
        bounds={BOUNDS}
      />,
    )
    fireEvent.change(screen.getByLabelText(/from/i), { target: { value: '2026-06-05' } })
    const spec = onChange.mock.calls[0][0] as WindowSpec
    expect(spec.kind).toBe('custom')
    if (spec.kind === 'custom') expect(spec.from).toBe('2026-06-05')
  })

  it('AC-014: changing the to date emits a custom spec', () => {
    const onChange = vi.fn()
    render(
      <WindowSelector
        value={{ kind: 'custom', from: '2026-06-10', to: '2026-06-20' }}
        onChange={onChange}
        bounds={BOUNDS}
      />,
    )
    fireEvent.change(screen.getByLabelText(/to/i), { target: { value: '2026-06-25' } })
    const spec = onChange.mock.calls[0][0] as WindowSpec
    expect(spec.kind).toBe('custom')
    if (spec.kind === 'custom') expect(spec.to).toBe('2026-06-25')
  })

  it('AC-014: handles null bounds gracefully (no crash)', () => {
    render(
      <WindowSelector
        value={{ kind: 'preset', days: 30 }}
        onChange={vi.fn()}
        bounds={null}
      />,
    )
    expect(screen.getByRole('tab', { name: /30d/i })).toBeInTheDocument()
  })
})
