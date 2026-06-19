import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActivityCard } from './ActivityCard'
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

  it('renders the empty state when there are no events', () => {
    render(<ActivityCard events={[]} people={people} now={new Date()} />)
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument()
  })
})
