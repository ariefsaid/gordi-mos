import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { PersonOption } from '@/lib/db/directory'
import type { TaskEventRow } from '@/lib/db/tasks.types'
import { TaskActivity } from './task-activity'

// TaskActivity is the Task record's Activity (audit) region — the event log + comment thread,
// stacked and quiet as the LAST content-first region (OD-REDESIGN-90 §2.2 item 5). These tests
// port the empty-collapse behaviors (owner-eyes item 5) and the guards from the retired RecordFeed:
// no orphan empty lines, no weekly-update affordance, and the description is never re-rendered here.

const VIEWER_ID = 'viewer-person-id'
const people: PersonOption[] = [{ id: VIEWER_ID, full_name: 'Cahya Cafe' }]
const now = new Date('2026-06-12T08:00:00Z')
const noop = () => {}

const events: TaskEventRow[] = [{
  id: 'evt-1', org_id: 'org', task_id: 'task-abc', actor_person_id: VIEWER_ID,
  event_type: 'created', from_value: null, to_value: null, created_at: '2026-06-11T00:00:00Z',
}]

function renderActivity(props: Partial<Parameters<typeof TaskActivity>[0]> = {}) {
  return render(
    <I18nProvider>
      <TaskActivity
        events={events}
        comments={[]}
        people={people}
        now={now}
        editable
        onPostComment={noop}
        {...props}
      />
    </I18nProvider>,
  )
}

describe('TaskActivity — the Task record Activity region', () => {
  it('renders the activity event log', () => {
    // The Activity region landmark is owned by the content slot that wraps this in the live record
    // (RecordViewer's `<section data-content-slot="activity" aria-label>`); standalone, TaskActivity
    // renders the event entries directly (no nested region — see the ActivityCard demotion).
    renderActivity()
    expect(screen.getByTestId('event-entry')).toBeInTheDocument()
  })

  it('owner-eyes item 5: both empty → ONE combined quiet line + composer, no orphan empty lines', () => {
    renderActivity({ events: [], comments: [] })
    expect(screen.getByText(/no activity yet — be the first to comment/i)).toBeInTheDocument()
    expect(screen.queryByText('No activity yet.')).toBeNull()
    expect(screen.queryByText('No comments yet.')).toBeNull()
    expect(screen.getByRole('button', { name: /post comment/i })).toBeInTheDocument()
  })

  it('owner-eyes item 5: activity present + comments empty → a single quiet "No comments yet." line', () => {
    renderActivity({ comments: [] })
    expect(screen.getByText('No comments yet.')).toBeInTheDocument()
    expect(screen.queryByText(/be the first to comment/i)).toBeNull()
  })

  it('owner-eyes item 5: both empty + not editable → one plain "No activity yet." line, no comment invite', () => {
    renderActivity({ events: [], comments: [], editable: false })
    expect(screen.getByText('No activity yet.')).toBeInTheDocument()
    expect(screen.queryByText(/be the first to comment/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /post comment/i })).toBeNull()
  })

  it('never carries a weekly-update write/ack affordance (this is a Task, not the upward-review pane)', () => {
    renderActivity()
    expect(screen.queryByRole('button', { name: /write update|submit update|acknowledge/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /write update|submit update|acknowledge/i })).toBeNull()
  })
})
