import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { RaciCard } from './raci-card'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { PersonOption } from '@/lib/db/directory'

const people: PersonOption[] = [
  { id: 'p1', full_name: 'Ada Lovelace' },
  { id: 'p2', full_name: 'Alan Turing' },
  { id: 'p3', full_name: 'Grace Hopper' },
]

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-1', org_id: 'org', title: 'T', business_unit_id: 'bu-1',
    status: 'Open', responsible_person_id: 'p1', accountable_person_id: 'p1',
    consulted_person_ids: [], informed_person_ids: [],
    description: null, due_date: null, objective_id: null, work_line_id: null,
    last_activity_at: '2026-06-11T00:00:00Z',
    archived_at: null, created_by: 'p1',
    created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
    ...overrides,
  }
}

describe('RaciCard', () => {
  it('renders the four role fields with R/A person names', () => {
    render(
      <RaciCard task={makeTask()} people={people} canEdit={false} viewerId="x"
        onRaciChange={() => {}} onRaChange={() => {}} />,
    )
    expect(screen.getByRole('region', { name: /raci/i })).toBeInTheDocument()
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0)
  })

  it('AC-072 (component): editor can open the Consulted picker', () => {
    render(
      <RaciCard task={makeTask()} people={people} canEdit viewerId="p1"
        onRaciChange={() => {}} onRaChange={() => {}} />,
    )
    const consulted = screen.getByTestId('raci-consulted')
    fireEvent.click(within(consulted).getByRole('button', { name: /add consulted person/i }))
    expect(screen.getByRole('listbox', { name: /select person/i })).toBeInTheDocument()
  })

  it('AC-072 (component): selecting a Consulted person fires onRaciChange', () => {
    const onRaciChange = vi.fn()
    render(
      <RaciCard task={makeTask()} people={people} canEdit viewerId="p1"
        onRaciChange={onRaciChange} onRaChange={() => {}} />,
    )
    const consulted = screen.getByTestId('raci-consulted')
    fireEvent.click(within(consulted).getByRole('button', { name: /add consulted person/i }))
    fireEvent.click(screen.getByRole('option', { name: /alan turing/i }))
    expect(onRaciChange).toHaveBeenCalledWith({ consulted_person_ids: ['p2'] })
  })

  it('non-editor sees no add buttons', () => {
    render(
      <RaciCard task={makeTask()} people={people} canEdit={false} viewerId="x"
        onRaciChange={() => {}} onRaChange={() => {}} />,
    )
    expect(screen.queryByRole('button', { name: /add/i })).toBeNull()
  })
})
