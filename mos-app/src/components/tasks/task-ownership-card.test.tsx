import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { PersonOption } from '@/lib/db/directory'
import { TaskOwnershipCard } from './task-ownership-card'

const PIC = 'pic'
const SUPERVISOR = 'supervisor'

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-1', org_id: 'org', title: 'Open cafe', business_unit_id: 'team-1', status: 'Open',
    responsible_person_id: PIC, accountable_person_id: SUPERVISOR,
    consulted_person_ids: ['other'], informed_person_ids: ['another'], description: null,
    due_date: null, objective_id: null, work_line_id: null, last_activity_at: '2026-07-15T00:00:00Z',
    archived_at: null, created_by: PIC, created_at: '2026-07-15T00:00:00Z', updated_at: '2026-07-15T00:00:00Z',
    ...overrides,
  }
}

const people: PersonOption[] = [
  { id: PIC, full_name: 'Cahya Cafe' },
  { id: SUPERVISOR, full_name: 'Arief Said' },
  { id: 'new-pic', full_name: 'Rina Lestari' },
]

describe('TaskOwnershipCard — OD-62', () => {
  it('renders Team, PIC, and Supervisor without governance-role pills', () => {
    render(
      <TaskOwnershipCard
        task={makeTask()}
        teamName="Café Operations"
        people={people}
        canEdit
        onPicChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('region', { name: 'Task ownership' })).toBeInTheDocument()
    expect(screen.getByText('Team')).toBeInTheDocument()
    expect(screen.getByText('Café Operations')).toBeInTheDocument()
    expect(screen.getByText('PIC')).toBeInTheDocument()
    expect(screen.getByText('Supervisor')).toBeInTheDocument()
    expect(screen.queryByText(/RACI|Responsible|Accountable|Consulted|Informed/)).toBeNull()
  })

  it('offers Reassign PIC and sends the selected person to the callback', () => {
    const onPicChange = vi.fn()
    render(
      <TaskOwnershipCard
        task={makeTask()}
        teamName="Café Operations"
        people={people}
        canEdit
        onPicChange={onPicChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reassign PIC' }))
    fireEvent.click(screen.getByRole('option', { name: 'Rina Lestari' }))
    expect(onPicChange).toHaveBeenCalledWith('new-pic')
  })

  it('does not expose a reassignment control when read-only', () => {
    render(
      <TaskOwnershipCard
        task={makeTask()}
        teamName="Café Operations"
        people={people}
        canEdit={false}
        onPicChange={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Reassign PIC' })).toBeNull()
    expect(screen.getByLabelText('PIC: Cahya Cafe')).toBeInTheDocument()
  })
})
