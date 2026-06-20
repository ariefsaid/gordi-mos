import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { PersonOption } from '@/lib/db/directory'
import { RecordDetailsPanel } from './record-details-panel'

const VIEWER_ID = 'viewer-person-id'

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-abc', org_id: 'org', title: 'Fix the coffee machine',
    business_unit_id: 'bu-1', status: 'In Progress',
    responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID,
    consulted_person_ids: [], informed_person_ids: [],
    description: 'broken', due_date: '2026-06-20',
    last_activity_at: '2026-06-11T08:00:00Z',
    archived_at: null, created_by: VIEWER_ID,
    created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
    ...overrides,
  }
}

const people: PersonOption[] = [{ id: VIEWER_ID, full_name: 'Cahya Cafe' }]
const noop = () => {}

function renderPanel(props: Partial<Parameters<typeof RecordDetailsPanel>[0]> = {}) {
  return render(
    <RecordDetailsPanel
      task={makeTask()}
      buName="Cafe Operations"
      people={people}
      editable
      viewerId={VIEWER_ID}
      checklistCount={[2, 5]}
      onStatusChange={noop}
      onRaChange={noop}
      onRaciChange={noop}
      {...props}
    />,
  )
}

describe('RecordDetailsPanel (AC-R02/R04)', () => {
  it('AC-R02: renders an identity row — task name + BU sub-line', () => {
    renderPanel()
    expect(screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' })).toBeInTheDocument()
    // sub-line: "BU · code"
    expect(screen.getByText(/cafe operations ·/i)).toBeInTheDocument()
  })

  it('AC-R02: identity heading truncates and carries a title attribute (no-bleed)', () => {
    renderPanel()
    const heading = screen.getByRole('heading', { level: 1, name: 'Fix the coffee machine' })
    expect(heading).toHaveAttribute('title', 'Fix the coffee machine')
  })

  it('AC-R02: shows Status (editable → StatusTrigger), Ownership/RACI, Dates, Checklist count', () => {
    renderPanel()
    // Status (above the fold) — editor sees the change-status trigger
    expect(screen.getByRole('button', { name: /change status/i })).toBeInTheDocument()
    // Ownership (RACI)
    expect(screen.getByRole('region', { name: /raci/i })).toBeInTheDocument()
    // Dates
    expect(screen.getByText(/due/i)).toBeInTheDocument()
    // Checklist count
    expect(screen.getByText(/2 of 5/i)).toBeInTheDocument()
  })

  it('AC-R02: wraps as a labelled region', () => {
    renderPanel()
    expect(screen.getByRole('region', { name: /task details/i })).toBeInTheDocument()
  })

  it('AC-R04: a non-editor viewer sees a read-only StatusPill (no change affordance)', () => {
    renderPanel({ editable: false })
    expect(screen.queryByRole('button', { name: /change status/i })).toBeNull()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
  })

  it('compact variant keeps RACI + Details but defers identity/status to the drawer header', () => {
    renderPanel({ compact: true })
    // RACI + Details stay
    expect(screen.getByRole('region', { name: /raci/i })).toBeInTheDocument()
    expect(screen.getByText(/2 of 5/i)).toBeInTheDocument()
    // identity heading + status trigger are owned by the drawer header — not duplicated
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.queryByRole('button', { name: /change status/i })).toBeNull()
    expect(document.querySelector('.record-details-compact')).toBeTruthy()
  })
})
