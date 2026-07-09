import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmptyState } from './state-kit'

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
})
