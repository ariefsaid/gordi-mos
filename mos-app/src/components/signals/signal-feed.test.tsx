import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { SignalRow } from '@/lib/db/signals.types'
import { SignalFeed } from './signal-feed'

function row(id: string, attention: SignalRow['attention'], occurredAt: string, body: string): SignalRow {
  return {
    id, author_id: 'person-cahya', owning_team_id: 'team-hq', occurred_at: occurredAt, body,
    attention, category: null, source: 'human', retracted_at: null, retract_reason: null,
    edited_at: null, created_at: occurredAt,
  }
}

function renderFeed(props: Partial<React.ComponentProps<typeof SignalFeed>> = {}) {
  return render(
    <I18nProvider>
      <SignalFeed
        signals={[]}
        authorNamesById={{ 'person-cahya': 'Cahya Cafe' }}
        teamNamesById={{ 'team-hq': 'HQ Operations' }}
        {...props}
      />
    </I18nProvider>,
  )
}

describe('SignalFeed — Home ambient feed (AC-426)', () => {
  it('renders the "Share a Signal" composer-entry row above the cards', () => {
    const onShareClick = vi.fn()
    renderFeed({ onShareClick })
    expect(screen.getByRole('button', { name: /share a signal/i })).toBeInTheDocument()
  })

  it('calls onShareClick when the composer-entry row is pressed', async () => {
    const onShareClick = vi.fn()
    renderFeed({ onShareClick })
    await userEvent.click(screen.getByRole('button', { name: /share a signal/i }))
    expect(onShareClick).toHaveBeenCalledTimes(1)
  })

  it('renders cards newest-first with Urgent/Needs-attention floated above FYI within recency', () => {
    const signals = [
      row('fyi-new', 'FYI', '2026-07-16T10:00:00Z', 'FYI newer'),
      row('urgent-old', 'Urgent', '2026-07-16T02:00:00Z', 'Urgent older'),
      row('needs-mid', 'Needs attention', '2026-07-16T06:00:00Z', 'Needs mid'),
    ]
    renderFeed({ signals })

    const bodies = screen.getAllByText(/newer|older|mid/i).map((el) => el.textContent)
    expect(bodies).toEqual(['Urgent older', 'Needs mid', 'FYI newer'])
  })

  it('shows the "No Signals yet" empty-state when there are none', () => {
    renderFeed({ signals: [] })
    expect(screen.getByText(/No Signals yet\. Share the first one above\./i)).toBeInTheDocument()
  })

  it('does not show the empty-state when signals exist', () => {
    renderFeed({ signals: [row('s1', 'FYI', '2026-07-16T02:00:00Z', 'Something happened')] })
    expect(screen.queryByText(/No Signals yet/i)).not.toBeInTheDocument()
  })

  it('wires per-card onCategorize/onCreateTask/onOpen to the correct Signal id, and resolves unknown-author/team fallbacks', async () => {
    const onCategorize = vi.fn()
    const onCreateTask = vi.fn()
    const onOpen = vi.fn()
    renderFeed({
      signals: [row('s1', 'FYI', '2026-07-16T02:00:00Z', 'Something happened')],
      authorNamesById: {}, // forces the unknownAuthor fallback
      teamNamesById: {}, // forces the '' fallback
      onCategorize, onCreateTask, onOpen,
    })

    await userEvent.click(screen.getByRole('button', { name: /add category/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Process' }))
    expect(onCategorize).toHaveBeenCalledWith('s1', 'Process')

    await userEvent.click(screen.getByRole('button', { name: /create task/i }))
    expect(onCreateTask).toHaveBeenCalledWith('s1')

    await userEvent.click(screen.getByRole('button', { name: 'Something happened' }))
    expect(onOpen).toHaveBeenCalledWith('s1')

    expect(screen.getByText('Someone')).toBeInTheDocument() // unknown-author fallback
  })
})
