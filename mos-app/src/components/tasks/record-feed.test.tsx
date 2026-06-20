import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { TaskListRow, ChecklistItemRow, TaskEventRow } from '@/lib/db/tasks.types'
import type { PersonOption } from '@/lib/db/directory'
import { RecordFeed } from './record-feed'

const VIEWER_ID = 'viewer-person-id'

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-abc', org_id: 'org', title: 'Fix the coffee machine',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID,
    consulted_person_ids: [], informed_person_ids: [],
    description: 'The espresso machine on floor 2 is broken.',
    due_date: '2026-06-20', last_activity_at: '2026-06-11T08:00:00Z',
    archived_at: null, created_by: VIEWER_ID,
    created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
    ...overrides,
  }
}

const people: PersonOption[] = [{ id: VIEWER_ID, full_name: 'Cahya Cafe' }]
const now = new Date('2026-06-12T08:00:00Z')

const noop = () => {}

function renderFeed(props: Partial<Parameters<typeof RecordFeed>[0]> = {}) {
  const task = makeTask()
  const checklist: ChecklistItemRow[] = [{
    id: 'item-0', org_id: 'org', task_id: 'task-abc', label: 'Inspect coil',
    is_done: false, position: 0, created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
  }]
  const events: TaskEventRow[] = [{
    id: 'evt-1', org_id: 'org', task_id: 'task-abc', actor_person_id: VIEWER_ID,
    event_type: 'created', from_value: null, to_value: null, created_at: '2026-06-11T00:00:00Z',
  }]
  return render(
    <RecordFeed
      task={task}
      checklist={checklist}
      events={events}
      people={people}
      now={now}
      editable
      viewerId={VIEWER_ID}
      activeTab="activity"
      onSelectTab={noop}
      onAddChecklist={noop}
      onToggleChecklist={noop}
      onReorderChecklist={noop}
      onDeleteChecklist={noop}
      {...props}
    />,
  )
}

describe('RecordFeed (AC-R03)', () => {
  it('AC-R03: tab strip is a tablist with one selected tab marked by the primary underline', () => {
    renderFeed({ activeTab: 'activity' })
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    const selected = tabs.filter(t => t.getAttribute('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    // active tab carries the underline class (2px border-primary, never color-alone)
    expect(selected[0]).toHaveClass('on')
    // labels are Activity / Checklist / Notes
    const labels = tabs.map(t => t.textContent)
    expect(labels.some(l => /activity/i.test(l ?? ''))).toBe(true)
    expect(labels.some(l => /checklist/i.test(l ?? ''))).toBe(true)
    expect(labels.some(l => /notes/i.test(l ?? ''))).toBe(true)
  })

  it('AC-R03: arrow-key moves the active tab (roving)', () => {
    const onSelectTab = vi.fn()
    renderFeed({ activeTab: 'activity', onSelectTab })
    const activity = screen.getByRole('tab', { name: /activity/i })
    fireEvent.keyDown(activity, { key: 'ArrowRight' })
    expect(onSelectTab).toHaveBeenCalled()
  })

  it('AC-R03: Activity tab renders the activity feed', () => {
    renderFeed({ activeTab: 'activity' })
    expect(screen.getByRole('region', { name: /activity/i })).toBeInTheDocument()
  })

  it('AC-R03: Notes tab maps to the description pane (no new entity)', () => {
    renderFeed({ activeTab: 'notes' })
    expect(screen.getByRole('region', { name: /notes/i })).toBeInTheDocument()
    expect(screen.getByText(/the espresso machine on floor 2 is broken/i)).toBeInTheDocument()
  })

  it('AC-R03: Notes tab shows an empty substate when there is no description', () => {
    renderFeed({ activeTab: 'notes', task: makeTask({ description: null }) })
    expect(screen.getByText(/no notes/i)).toBeInTheDocument()
  })

  it('AC-R03: Checklist tab renders the checklist', () => {
    renderFeed({ activeTab: 'checklist' })
    expect(screen.getByText('Inspect coil')).toBeInTheDocument()
  })

  it('AC-R03: the feed never carries a weekly-update write/ack affordance', () => {
    renderFeed({ activeTab: 'activity' })
    expect(screen.queryByRole('button', { name: /write update|submit update|acknowledge/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /write update|submit update|acknowledge/i })).toBeNull()
  })
})
