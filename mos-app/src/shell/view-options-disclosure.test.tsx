// ViewOptionsDisclosure tests — the ONE capture-first "View options" disclosure primitive
// (Rule 11 component reuse). Home's order toggle and the Tasks filter stack both mount it,
// so the trigger/panel behavior + a11y wiring lives in one place. Each host passes its own
// skin classes, so computed styles are preserved (design-reviewer-verified).
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewOptionsDisclosure } from './view-options-disclosure'

function renderDisclosure(props: Partial<React.ComponentProps<typeof ViewOptionsDisclosure>> = {}) {
  return render(
    <ViewOptionsDisclosure
      open={props.open ?? false}
      onToggle={props.onToggle ?? vi.fn()}
      label="View options"
      panelId="panel-1"
      summary="Attention first"
      {...props}
    >
      <div data-testid="panel-content">the collapsible options</div>
    </ViewOptionsDisclosure>,
  )
}

describe('ViewOptionsDisclosure', () => {
  it('renders a trigger with the label and wires aria-expanded/aria-controls to the panel', () => {
    renderDisclosure({ open: false })
    const trigger = screen.getByRole('button', { name: /view options/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-controls', 'panel-1')
  })

  it('keeps the panel content collapsed (out of the DOM) when closed', () => {
    renderDisclosure({ open: false })
    expect(screen.queryByTestId('panel-content')).toBeNull()
  })

  it('reveals the panel (with the wired id) when open', () => {
    renderDisclosure({ open: true })
    const trigger = screen.getByRole('button', { name: /view options/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const content = screen.getByTestId('panel-content')
    expect(content).toBeInTheDocument()
    expect(content.closest('#panel-1')).not.toBeNull()
  })

  it('calls onToggle when the trigger is clicked', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    renderDisclosure({ open: false, onToggle })
    await user.click(screen.getByRole('button', { name: /view options/i }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('renders the summary as a decorative (aria-hidden) hint, not part of the accessible name', () => {
    renderDisclosure({ open: false, summary: 'Attention first', summaryClassName: 'sum' })
    const summary = screen.getByText('Attention first')
    expect(summary).toHaveAttribute('aria-hidden', 'true')
    expect(summary).toHaveClass('sum')
    // The accessible name is the label alone (the summary is aria-hidden).
    expect(screen.getByRole('button', { name: 'View options' })).toBeInTheDocument()
  })

  it('applies each host skin class (container/trigger/chevron/panel) so CSS is preserved', () => {
    const { container } = renderDisclosure({
      open: true,
      className: 'host-wrap',
      triggerClassName: 'host-trigger',
      chevronClassName: 'host-chev',
      panelClassName: 'host-panel',
    })
    expect(container.querySelector('.host-wrap')).not.toBeNull()
    expect(screen.getByRole('button', { name: /view options/i })).toHaveClass('host-trigger')
    // Chevron carries the base + open modifier when expanded.
    expect(container.querySelector('.host-chev.host-chev--open')).not.toBeNull()
    expect(container.querySelector('#panel-1.host-panel')).not.toBeNull()
  })
})

// I3 (issue #379): Escape closes the disclosure and leaves focus on the trigger — the trigger is
// the disclosure's focus home. Covers BOTH phone doors (Tasks workspace, Signals archive).
describe('ViewOptionsDisclosure — I3 Escape (issue #379)', () => {
  it('Escape on the open trigger closes via onClose and keeps focus on the trigger', () => {
    const onClose = vi.fn()
    const onToggle = vi.fn()
    renderDisclosure({ open: true, onToggle, onClose })
    const trigger = screen.getByRole('button', { name: /view options/i })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(onToggle).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })

  it('Escape inside the open panel closes via onClose and returns focus to the trigger', () => {
    const onClose = vi.fn()
    render(
      <ViewOptionsDisclosure open onToggle={vi.fn()} onClose={onClose} label="View options" panelId="p">
        <button type="button">a filter control</button>
      </ViewOptionsDisclosure>,
    )
    const inner = screen.getByRole('button', { name: /a filter control/i })
    inner.focus()
    fireEvent.keyDown(inner, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'View options' })).toHaveFocus()
  })

  it('Escape on a CLOSED trigger is a no-op (never reopens)', () => {
    const onToggle = vi.fn()
    renderDisclosure({ open: false, onToggle })
    fireEvent.keyDown(screen.getByRole('button', { name: /view options/i }), { key: 'Escape' })
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('without onClose, Escape falls back to onToggle (open → closed)', () => {
    const onToggle = vi.fn()
    renderDisclosure({ open: true, onToggle })
    fireEvent.keyDown(screen.getByRole('button', { name: /view options/i }), { key: 'Escape' })
    expect(onToggle).toHaveBeenCalledOnce()
  })
})
