import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { SignalRow } from '@/lib/db/signals.types'
import { SignalCard } from './signal-card'

function baseSignal(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: 'signal-1', author_id: 'person-cahya', owning_team_id: 'team-hq',
    occurred_at: '2026-07-16T02:00:00Z', body: 'The freezer alarm went off',
    attention: 'Needs attention', category: null, source: 'human',
    retracted_at: null, retract_reason: null, edited_at: null,
    created_at: '2026-07-16T02:00:00Z',
    ...overrides,
  }
}

function renderCard(props: Partial<React.ComponentProps<typeof SignalCard>> = {}) {
  return render(
    <I18nProvider>
      <SignalCard
        signal={baseSignal()}
        authorName="Cahya Cafe"
        teamName="HQ Operations"
        {...props}
      />
    </I18nProvider>,
  )
}

describe('SignalCard — posted-card grammar (AC-424)', () => {
  it('shows "Add category" for an uncategorised Signal, which opens the 8-family picker', async () => {
    renderCard()
    const addCategory = screen.getByRole('button', { name: /add category/i })
    expect(addCategory).toBeInTheDocument()

    await userEvent.click(addCategory)
    const picker = screen.getByRole('listbox', { name: /categor/i })
    const options = within(picker).getAllByRole('option')
    expect(options).toHaveLength(8)
    expect(within(picker).getByRole('option', { name: 'Supply/vendor' })).toBeInTheDocument()
    expect(within(picker).getByRole('option', { name: 'Other' })).toBeInTheDocument()
  })

  it('calls onCategorize with the chosen family and closes the picker', async () => {
    const onCategorize = vi.fn()
    renderCard({ onCategorize })
    await userEvent.click(screen.getByRole('button', { name: /add category/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Quality' }))

    expect(onCategorize).toHaveBeenCalledWith('Quality')
    expect(screen.queryByRole('listbox', { name: /categor/i })).not.toBeInTheDocument()
  })

  it('shows the assigned category (not "Add category") once categorised', () => {
    renderCard({ signal: baseSignal({ category: 'Equipment/facility' }) })
    expect(screen.getByText('Equipment/facility')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add category/i })).not.toBeInTheDocument()
  })

  it('renders Create Task on the card (not requiring a composer)', async () => {
    const onCreateTask = vi.fn()
    renderCard({ onCreateTask })
    const createTaskButton = screen.getByRole('button', { name: /create task/i })
    await userEvent.click(createTaskButton)
    expect(onCreateTask).toHaveBeenCalledTimes(1)
  })
})

describe('SignalCard — phone stacking contract (≤480px: message above a compact metadata line)', () => {
  // jsdom can't evaluate the ≤480px media query (computed order is design-reviewer-verified),
  // but the CSS stack depends on this DOM contract: the message body and the author/time
  // metadata line are distinct, direct-sibling blocks of the card, and the full message is
  // present in the DOM (never truncated at the source).
  it('renders the message body and metadata line as sibling blocks, with the full message text', () => {
    const longBody =
      'The espresso machine group head is leaking and the morning queue is backing up fast — we need maintenance before the lunch rush or we lose covers'
    const { container } = renderCard({ signal: baseSignal({ body: longBody }) })

    const card = container.querySelector('.signal-card') as HTMLElement
    const head = card.querySelector('.signal-head') as HTMLElement
    const body = card.querySelector('.signal-body') as HTMLElement
    expect(head.parentElement).toBe(card)
    expect(body.parentElement).toBe(card)
    // The full message is in the DOM (the phone layout stacks it above the metadata line,
    // rather than letting the author/time row squeeze or truncate it).
    expect(body.textContent).toContain(longBody)
  })
})

describe('SignalCard — retraction tombstone (AC-425)', () => {
  it('renders only the tombstone + reason, no body/actions, for a retracted Signal', () => {
    renderCard({
      signal: baseSignal({ retracted_at: '2026-07-16T05:00:00Z', retract_reason: 'Duplicate report' }),
      onCreateTask: vi.fn(),
    })

    expect(screen.getByText(/retracted/i)).toBeInTheDocument()
    expect(screen.getByText('Duplicate report')).toBeInTheDocument()
    expect(screen.queryByText('The freezer alarm went off')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create task/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add category/i })).not.toBeInTheDocument()
  })
})
