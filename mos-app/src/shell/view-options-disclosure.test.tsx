// ViewOptionsDisclosure tests — the ONE capture-first "View options" disclosure primitive
// (Rule 11 component reuse). Home's order toggle and the Tasks filter stack both mount it,
// so the trigger/panel behavior + a11y wiring lives in one place. Each host passes its own
// skin classes, so computed styles are preserved (design-reviewer-verified).
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
