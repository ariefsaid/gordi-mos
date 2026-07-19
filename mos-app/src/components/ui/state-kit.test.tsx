import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EmptyState, LoadingShell } from './state-kit'

// Cohesion-debt 2026-07-19, item #3: LoadingShell is THE loading grammar —
// role=status + aria-busy + the shared SkeletonRows, one localized label. It
// replaces the 5 copy-pasted kitchen LoadingState fns, kpi-tile's role=group
// Pill-skeleton, my-week's "Loading…" text, and the role-less admin loader.
describe('LoadingShell', () => {
  it('is a busy status region wrapping skeleton rows', () => {
    const { container } = render(<LoadingShell count={4} />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveAttribute('aria-label', 'Loading') // t('common.loading') en default
    expect(container.querySelectorAll('.skeleton-row')).toHaveLength(4)
  })

  it('never renders the literal word "Loading…" as visible text', () => {
    render(<LoadingShell count={2} />)
    expect(screen.queryByText('Loading…')).toBeNull()
  })

  it('accepts a label override for the status announcement', () => {
    render(<LoadingShell count={1} label="Trailing 7-day revenue" />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Trailing 7-day revenue')
  })
})

describe('EmptyState', () => {
  it('renders the quiet archetype with no action row', () => {
    render(
      <EmptyState
        variant="quiet"
        title="You're all caught up"
        copy="Anything that needs your attention will appear here."
      />,
    )

    const emptyState = screen.getByTestId('empty-state')
    expect(emptyState).toHaveAttribute('data-empty-variant', 'quiet')
    expect(emptyState).toHaveAttribute('role', 'region')
    expect(screen.getByText("You're all caught up")).toBeInTheDocument()
    expect(screen.queryByText('Refresh')).not.toBeInTheDocument()
    expect(emptyState.querySelector('.empty-actions')).toBeNull()
  })

  it('renders the next-step archetype with one clear action', () => {
    render(
      <EmptyState variant="next-step" title="No log entries yet today." copy="Add the first one.">
        <button type="button">+ Add log entry</button>
      </EmptyState>,
    )

    const emptyState = screen.getByTestId('empty-state')
    expect(emptyState).toHaveAttribute('data-empty-variant', 'next-step')
    expect(emptyState.querySelectorAll('.empty-state-icon, .empty-title, .empty-copy, .empty-actions')).toHaveLength(4)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('renders the awaiting archetype with a muted retry note and one action', () => {
    render(
      <EmptyState
        variant="awaiting"
        title="No pushes yet"
        copy="The ESB outbox is empty right now."
        note="Pull again to check for new push activity."
      >
        <button type="button">Refresh</button>
      </EmptyState>,
    )

    const emptyState = screen.getByTestId('empty-state')
    expect(emptyState).toHaveAttribute('data-empty-variant', 'awaiting')
    expect(emptyState.querySelector('.empty-note')).not.toBeNull()
    expect(screen.getByText(/pull again to check for new push activity/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /refresh/i })).toHaveLength(1)
  })

  // Cohesion-debt 2026-07-19, item #2: the Assistant's bespoke empty state (its own
  // local EmptyState with pickable suggestions) folds into THE kit via a suggestions
  // slot, so the app has one empty-state grammar instead of the kit + 3 locals.
  it('renders a pickable suggestions slot and fires onSelect on click', () => {
    const onSelect = vi.fn()
    render(
      <EmptyState
        variant="next-step"
        title="How can I help?"
        copy="Ask about your week."
        suggestions={[
          { label: "What's on my plate?", onSelect },
          { label: 'Summarize my week', onSelect: vi.fn() },
        ]}
      />,
    )
    const picks = screen.getAllByRole('button')
    expect(picks).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: "What's on my plate?" }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  // Cohesion-debt 2026-07-19, item #2: when the empty state sits INSIDE an already-
  // labelled landmark (the Assistant drawer's complementary/dialog), it must not add a
  // redundant nested region landmark — `nested` drops the role but keeps the visuals.
  it('omits the region landmark role when nested', () => {
    render(<EmptyState nested variant="next-step" title="How can I help?" />)
    const empty = screen.getByTestId('empty-state')
    expect(empty).not.toHaveAttribute('role')
    expect(empty).not.toHaveAttribute('aria-labelledby')
  })
})
