import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ActivityCard } from './activity-card'
import type { TaskEventRow } from '@/lib/db/tasks.types'
import type { PersonOption } from '@/lib/db/directory'

const people: PersonOption[] = [{ id: 'p1', full_name: 'Ada Lovelace' }]

describe('ActivityCard', () => {
  it('AC-075 (component): renders a status_changed event with from→to', () => {
    const events: TaskEventRow[] = [{
      id: 'e1', org_id: 'org', task_id: 't', event_type: 'status_changed',
      from_value: 'Open', to_value: 'Blocked', actor_person_id: 'p1',
      created_at: '2026-06-15T00:00:00Z',
    }]
    render(<ActivityCard events={events} people={people} now={new Date('2026-06-15T01:00:00Z')} />)
    expect(screen.getByText(/Open → Blocked/)).toBeInTheDocument()
  })

  it('offers a real load-more button for a full history page', () => {
    const events: TaskEventRow[] = Array.from({ length: 50 }, (_, index) => ({
      id: `event-${index}`, org_id: 'org', task_id: 't', event_type: 'created',
      from_value: null, to_value: null, actor_person_id: 'p1', created_at: '2026-06-15T00:00:00Z',
    }))
    const onLoadMore = vi.fn()
    render(<ActivityCard events={events} people={people} now={new Date()} hasMore onLoadMore={onLoadMore} />)
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(onLoadMore).toHaveBeenCalledOnce()
  })

  it('renders the empty state when there are no events', () => {
    render(<ActivityCard events={[]} people={people} now={new Date()} />)
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument()
  })
})
