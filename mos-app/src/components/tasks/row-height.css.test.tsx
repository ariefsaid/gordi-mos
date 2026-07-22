import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TaskRow } from './task-row'
import type { TaskListRow } from '@/lib/db/tasks.types'

function makeTask(): TaskListRow {
  return {
    id: 'task-density', org_id: 'org', title: 'Keep the table tidy',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: 'person-1', accountable_person_id: 'person-1',
    consulted_person_ids: [], informed_person_ids: [], description: null,
    due_date: null, objective_id: null, work_line_id: null,
    last_activity_at: '2026-06-01T10:00:00Z', archived_at: null,
    created_by: 'person-1', created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  }
}

describe('Tasks / Signals collection row grammar', () => {
  it('keeps the Task identity cell as one title plus metadata unit', () => {
    render(
      <MemoryRouter>
        <table className="collection-grammar-table">
          <tbody>
            <TaskRow
              task={makeTask()}
              now={new Date('2026-06-16')}
              condensed={false}
              isSelected={false}
              isCursor={false}
              leafIndex={0}
              ownerName="Rina Lestari"
              businessUnitName="Café Operations"
              onOpen={() => {}}
              checked={false}
              onCheck={() => {}}
            />
          </tbody>
        </table>
      </MemoryRouter>,
    )

    const identity = document.querySelector('.collection-grammar-title-cell')
    expect(identity).toBeInTheDocument()
    expect(identity?.querySelector('.collection-grammar-title')).toHaveTextContent('Keep the table tidy')
    expect(identity?.querySelector('.collection-grammar-meta')).toHaveTextContent('Café Operations')
  })
})
