import { describe, it, expect, vi } from 'vitest'
import { render, within, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { TaskListRow, ChecklistItemRow, TaskEventRow } from '@/lib/db/tasks.types'
import type { PersonOption, BusinessUnitOption } from '@/lib/db/directory'
import { createTaskRecordAdapter, type TaskFieldLabels, type TaskRecordAdapterInput } from './task-record-adapter'
import { TaskRecordDocument } from './task-record-document'
import { formatDate } from './task-formatters'

// Task record anatomy conformance on the shared record page: the Task adapter supplies fields and
// rights, TaskRecordDocument composes the header and the sections. Intents carried over from the
// retired tabbed viewer: content leads, status and due appear once, a read-only record carries one
// note, the event log has one home, no tabs, no skipped heading level, one primary action.

const PIC = 'p-pic'
const SUPERVISOR = 'p-sup'
const people: PersonOption[] = [
  { id: PIC, full_name: 'Nico' },
  { id: SUPERVISOR, full_name: 'Wayan Kusuma' },
]
const businessUnits: BusinessUnitOption[] = [{ id: 'bu-retail', name: 'Retail Ops' }]
const labels: TaskFieldLabels = {
  title: 'Title', businessUnit: 'Business Unit', pic: 'PIC', supervisor: 'Supervisor', team: 'Team',
  teamUnassigned: 'Team not assigned yet (data migration)', teamFromRecord: 'Team is set from the task record',
  teamMigration: 'No team is assigned to this task yet (data migration).', dueDate: 'Due', createdBy: 'Created by',
  supervisorInheritedFrom: 'inherited from ${name}',
}
// Wednesday 22 Jul 2026, noon in Jakarta.
const NOW = new Date('2026-07-22T05:00:00Z')

const LONG_TITLE =
  'Restock the oat milk before the Monday morning rush and reconcile the fridge count against the delivery note'

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-1', org_id: 'org', title: LONG_TITLE, business_unit_id: 'bu-retail', status: 'Open',
    responsible_person_id: PIC, accountable_person_id: SUPERVISOR,
    consulted_person_ids: [], informed_person_ids: [], description: 'Two cartons short since Friday.',
    due_date: '2026-07-25', objective_id: null, work_line_id: null,
    last_activity_at: '2026-07-20T00:00:00Z', archived_at: null,
    created_by: PIC, created_at: '2026-07-19T00:00:00Z', updated_at: '2026-07-20T00:00:00Z',
    ...overrides,
  }
}

function step(id: string, label: string, isDone = false): ChecklistItemRow {
  return { id, org_id: 'org', task_id: 'task-1', label, is_done: isDone, position: 0, created_at: '', updated_at: '' }
}
const EVENT: TaskEventRow = {
  id: 'e1', org_id: 'org', task_id: 'task-1', actor_person_id: PIC, event_type: 'created',
  from_value: null, to_value: null, created_at: '2026-07-19T00:00:00Z',
}

type Options = {
  task?: TaskListRow
  viewerId?: string
  downlineIds?: string[]
  checklist?: ChecklistItemRow[]
  comments?: { id: string; author_id: string; body: string; created_at: string }[]
  events?: TaskEventRow[]
  input?: Partial<TaskRecordAdapterInput>
  mode?: 'panel' | 'page'
}

function renderRecord({
  task = makeTask(), viewerId = PIC, downlineIds = [], checklist = [step('c1', 'Check fridge stock')],
  comments = [], events = [EVENT], input = {}, mode = 'page',
}: Options = {}) {
  const adapter = createTaskRecordAdapter({
    detail: { task, checklist, events }, viewerId, downlineIds, people, businessUnits, labels, now: NOW,
    formatDate: (iso) => formatDate(iso, 'en'),
    onUpdateField: vi.fn(async () => {}), onUpdateStatus: vi.fn(async () => {}),
    onArchive: vi.fn(async () => {}), onUnarchive: vi.fn(async () => {}),
    ...input,
  })
  return render(
    <I18nProvider>
      <TaskRecordDocument
        adapter={adapter} task={task} mode={mode} headingLevel={mode === 'page' ? 1 : 2}
        canonicalHref="/work/tasks/task-1" now={NOW} people={people}
        checklist={checklist} checklistError={null}
        onAddChecklist={vi.fn()} onToggleChecklist={vi.fn()} onReorderChecklist={vi.fn()} onDeleteChecklist={vi.fn()}
        events={events} comments={comments} onPostComment={vi.fn()}
        commentDraft="" onCommentDraftChange={vi.fn()} onCommentDirtyChange={vi.fn()}
        onCommitField={vi.fn(async () => {})} onDirtyChange={vi.fn()}
      />
    </I18nProvider>,
  )
}

const sections = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-record-section]')].map((node) => (node as HTMLElement).dataset.recordSection)
const facts = (container: HTMLElement) => container.querySelector('.rp-facts') as HTMLElement

describe('Task record anatomy', () => {
  it('shows the work-first order without section tabs: description, checklist, comments', () => {
    const { container } = renderRecord()
    expect(sections(container)).toEqual(['description', 'checklist', 'comments'])
    expect(within(container).queryByRole('tablist')).toBeNull()
  })

  it('content leads: the description is the first section, directly under a header that already carries state, people and due', () => {
    const { container } = renderRecord()
    expect(container.querySelector('.rp-main')!.firstElementChild).toHaveAttribute('data-record-section', 'description')
    expect(container.querySelector('[data-record-section="description"]')).toHaveTextContent('Two cartons short since Friday.')
    expect(facts(container)).toHaveTextContent('PIC')
    expect(facts(container)).toHaveTextContent('Supervisor')
    expect(facts(container)).toHaveTextContent('Due')
  })

  it('the heading is the full Task title (unclipped) and stays an editable field', () => {
    const { container } = renderRecord()
    const h1 = container.querySelector('h1')!
    expect(h1.textContent).toBe(LONG_TITLE)
    expect(container.querySelector('[data-field-key="title"]')).toBeTruthy()
  })

  it('a read-only Task carries ONE note that names who can change it, and no per-field permission captions', () => {
    const { container } = renderRecord({ viewerId: 'stranger' })
    expect(container.querySelectorAll('.rp-readonly')).toHaveLength(1)
    expect(container.querySelector('.rp-readonly')).toHaveTextContent('View only · Wayan Kusuma (Supervisor) or Nico (PIC) can change this task.')
    // The Team migration state is a real field-specific explanation, not a permission caption.
    expect(container.querySelectorAll('.record-field__reason')).toHaveLength(1)
    expect(container.querySelector('.record-field__reason')).toHaveTextContent(/migration/i)
  })

  it('a record nobody may edit says so once, with no per-field reasons beyond Team', () => {
    const { container } = renderRecord({ task: makeTask({ archived_at: '2026-07-21T00:00:00Z' }) })
    expect(container.querySelectorAll('.rp-readonly')).toHaveLength(1)
    expect(container.querySelector('.rp-readonly')).toHaveTextContent('This task is archived.')
    expect(container.querySelectorAll('[data-field-key]:not([data-field-key="team"]) .record-field__reason')).toHaveLength(0)
  })

  it('an editor sees no permission noise', () => {
    const { container } = renderRecord()
    expect(container.querySelectorAll('.rp-readonly')).toHaveLength(0)
    expect(container.querySelectorAll('[data-field-key]:not([data-field-key="team"]) .record-field__reason')).toHaveLength(0)
  })

  it('the event log has one home, History, and shows no old to new diff dump by default', () => {
    const { container } = renderRecord()
    expect(container.querySelectorAll('[data-testid="event-entry"]')).toHaveLength(0)
    fireEvent.click(within(container).getByRole('button', { name: /History/ }))
    expect(container.querySelectorAll('[data-testid="event-entry"]')).toHaveLength(1)
    expect(container.textContent).not.toMatch(/→/)
  })

  it('omits History when there are no events, and counts it when there are', () => {
    const none = renderRecord({ events: [] }).container
    expect(within(none).queryByRole('button', { name: /History/ })).toBeNull()
    expect(none).not.toHaveTextContent(/History|No activity yet/)
    const some = renderRecord({ events: [EVENT, { ...EVENT, id: 'e2' }] }).container
    expect(within(some).getByRole('button', { name: /History/ })).toHaveTextContent('History2')
  })

  it('offers no weekly-update write or acknowledge action (this is a Task, not the upward-review pane)', () => {
    const { container } = renderRecord()
    expect(within(container).queryByRole('button', { name: /write update|submit update|acknowledge/i })).toBeNull()
    expect(within(container).queryByRole('link', { name: /write update|submit update|acknowledge/i })).toBeNull()
  })

  it('has one primary action at most, and it sits in the header', () => {
    const { container } = renderRecord({ checklist: [step('c1', 'Check fridge stock', true)] })
    expect(container.querySelectorAll('.btn-primary')).toHaveLength(1)
    expect(container.querySelector('.rp-head')!.contains(container.querySelector('.btn-primary'))).toBe(true)
  })

  it('status and due each appear once, in the facts line', () => {
    const { container } = renderRecord()
    expect(container.querySelectorAll('[data-field-key="status"]')).toHaveLength(1)
    expect(facts(container).querySelector('[data-field-key="status"]')).toBeTruthy()
    expect(container.querySelectorAll('[data-field-key="dueDate"]')).toHaveLength(1)
    expect(facts(container).querySelector('[data-field-key="dueDate"]')).toBeTruthy()
  })

  it('keeps Team, Business Unit and Created by out of the facts line, in About', () => {
    const { container } = renderRecord()
    expect(facts(container).querySelector('[data-field-key="team"]')).toBeNull()
    expect(facts(container).querySelector('[data-field-key="businessUnit"]')).toBeNull()
    const about = within(container).getByRole('region', { name: 'About' })
    expect(about.querySelector('[data-field-key="team"]')).toBeTruthy()
    expect(about.querySelector('[data-field-key="businessUnit"]')).toHaveTextContent('Retail Ops')
    expect(about.querySelector('[data-field-key="createdBy"]')).toHaveTextContent('Nico')
  })

  it('shows the parent Project/Process in the facts line and the generating Process in About', () => {
    const { container } = renderRecord({
      task: makeTask({ work_line_id: 'process-1' }),
      input: { workLines: [{ id: 'process-1', name: 'Café Opening', type: 'process' }], generatedFromLabel: 'Café Opening' },
    })
    expect(facts(container).querySelector('[data-field-key="projectProcess"]')).toHaveTextContent('Café Opening')
    expect(container.querySelector('[data-field-key="generatedFrom"]')).toHaveTextContent('Café Opening')
    expect(within(container).getByRole('region', { name: 'About' }).querySelector('[data-field-key="generatedFrom"]')).toBeTruthy()
  })

  it('holds a link back until its name resolves, never showing a linked record as "Ad hoc"', () => {
    const { container } = renderRecord({ task: makeTask({ work_line_id: 'process-1', objective_id: 'obj-1' }) })
    expect(container).not.toHaveTextContent('Ad hoc')
    expect(facts(container).querySelector('[data-field-key="projectProcess"]')).toBeNull()
    expect(facts(container).querySelector('[data-field-key="objective"]')).toBeNull()
  })

  it('a record on its own page reads h1 then h2, with no level skipped into its sections', () => {
    const { container } = renderRecord()
    const levels = [...container.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((heading) => Number(heading.tagName.slice(1)))
    expect(levels[0], 'the title owns the page h1').toBe(1)
    for (const [index, level] of levels.entries()) {
      expect(level - (levels[index - 1] ?? level)).toBeLessThanOrEqual(1)
    }
  })

  it('in a panel the title is an h2 and sections sit one rung under it', () => {
    const { container } = renderRecord({ mode: 'panel' })
    expect(container.querySelector('h1')).toBeNull()
    expect(within(container).getByRole('heading', { level: 2, name: LONG_TITLE })).toBeInTheDocument()
    expect(within(container).getByRole('heading', { level: 3, name: 'Checklist' })).toBeInTheDocument()
  })
})

describe('Task header: due, supervisor and status facts', () => {
  it('says "Overdue" in words on the date, with the lost tone', () => {
    const { container } = renderRecord({ task: makeTask({ due_date: '2026-07-20' }) })
    const due = facts(container).querySelector('.rp-fact--overdue')!
    expect(due).toHaveTextContent(/Overdue · /)
    expect(due).toHaveTextContent('Mon 20 Jul')
  })

  it('leaves a date due within three days in the soon tone, and a later or finished one plain', () => {
    expect(facts(renderRecord({ task: makeTask({ due_date: '2026-07-25' }) }).container).querySelector('.rp-fact--soon')).toBeTruthy()
    const later = renderRecord({ task: makeTask({ due_date: '2026-08-30' }) }).container
    expect(facts(later).querySelector('.rp-fact--overdue, .rp-fact--soon')).toBeNull()
    const done = renderRecord({ task: makeTask({ due_date: '2026-07-20', status: 'Done' }) }).container
    expect(facts(done).querySelector('.rp-fact--overdue')).toBeNull()
    expect(facts(done)).not.toHaveTextContent('Overdue')
  })

  it('offers an editor a prompt for a missing due date and shows a reader nothing', () => {
    const editor = renderRecord({ task: makeTask({ due_date: null }) }).container
    expect(within(editor).getByRole('button', { name: 'Edit Due' })).toHaveTextContent('+ Set due date')
    const reader = renderRecord({ task: makeTask({ due_date: null }), viewerId: 'stranger' }).container
    expect(facts(reader)).not.toHaveTextContent(/Due|No due date/)
  })

  it('carries "inherited from" as a description of the Supervisor, not a visible line', () => {
    const { container } = renderRecord({
      task: makeTask({ work_line_id: 'process-1' }),
      input: { workLines: [{ id: 'process-1', name: 'Café Opening', type: 'process', accountable_person_id: SUPERVISOR } as never] },
    })
    const chip = [...container.querySelectorAll('.rp-chip')].find((node) => node.textContent?.includes('Supervisor'))!
    expect(chip).toHaveAttribute('title', 'inherited from Café Opening')
    expect(chip.querySelector('.sr-only')).toHaveTextContent('inherited from Café Opening')
    expect(container.querySelector('.record-field__subline')).toBeNull()
  })

  it('shows the status of a record the viewer cannot change as a plain pill, with no caret and no control', () => {
    const { container } = renderRecord({ task: makeTask({ status: 'Blocked' }), viewerId: 'stranger' })
    const pill = facts(container).querySelector('.pill')!
    expect(pill).toHaveTextContent('Blocked')
    expect(pill).toHaveClass('pill--destructive')
    expect(within(container).queryByRole('button', { name: 'Edit Status' })).toBeNull()
    expect(container.querySelector('.record-field__pill-caret')).toBeNull()
  })

  it('lets the PIC change the status in place, with the caret that says so', () => {
    const { container } = renderRecord()
    expect(within(facts(container)).getByRole('button', { name: 'Edit Status' })).toBeInTheDocument()
    expect(container.querySelector('.record-field__pill-caret')).not.toBeNull()
  })

  it('replaces the status with an Archived pill on an archived task', () => {
    const { container } = renderRecord({ task: makeTask({ archived_at: '2026-07-21T00:00:00Z', status: 'Blocked' }) })
    expect(facts(container).querySelector('.pill')).toHaveTextContent('Archived')
    expect(facts(container)).not.toHaveTextContent('Blocked')
  })
})

describe('Task header: the one primary action and the ⋯ menu', () => {
  it('draws Mark complete as the primary once the task is ready: not Blocked and no open step', () => {
    const { container } = renderRecord({ checklist: [step('c1', 'Check fridge stock', true)] })
    expect(within(container).getByRole('button', { name: 'Mark complete' })).toHaveClass('btn-primary')
  })

  it('draws Mark complete quietly while a step is open or the task is Blocked', () => {
    expect(within(renderRecord().container).getByRole('button', { name: 'Mark complete' })).toHaveClass('btn-outline')
    const blocked = renderRecord({ task: makeTask({ status: 'Blocked' }), checklist: [] }).container
    expect(within(blocked).getByRole('button', { name: 'Mark complete' })).toHaveClass('btn-outline')
  })

  it('offers Reopen, quietly, on a Done task', () => {
    const { container } = renderRecord({ task: makeTask({ status: 'Done' }) })
    expect(within(container).getByRole('button', { name: 'Reopen' })).toHaveClass('btn-outline')
    expect(within(container).queryByRole('button', { name: 'Mark complete' })).toBeNull()
  })

  it('gives a viewer who cannot change the task no primary action', () => {
    const { container } = renderRecord({ viewerId: 'stranger' })
    expect(container.querySelectorAll('.rp-head .btn')).toHaveLength(0)
  })

  it('archives from the ⋯ menu as the last, destructive item, for a manager above the PIC', () => {
    const { container } = renderRecord({ viewerId: 'chain-mgr', downlineIds: [PIC] })
    expect(within(container).queryByRole('button', { name: 'Archive task' })).toBeNull()
    fireEvent.click(within(container).getByRole('button', { name: 'More actions' }))
    const items = within(document.body).getAllByRole('menuitem')
    expect(items[items.length - 1]).toHaveTextContent('Archive task')
    expect(items[items.length - 1]).toHaveClass('rp-menu__item--destructive')
  })

  it('offers Unarchive from the ⋯ menu and no primary on an archived task', () => {
    const { container } = renderRecord({ task: makeTask({ archived_at: '2026-07-21T00:00:00Z' }), viewerId: 'chain-mgr', downlineIds: [PIC] })
    expect(container.querySelectorAll('.rp-head .btn')).toHaveLength(0)
    fireEvent.click(within(container).getByRole('button', { name: 'More actions' }))
    expect(within(document.body).getByRole('menuitem', { name: 'Unarchive' })).toBeInTheDocument()
  })
})

describe('Task sections: what is shown when there is nothing yet', () => {
  it('shows an editor the checklist add field with no "No steps yet." line, and a prompt for a missing description', () => {
    const { container } = renderRecord({ checklist: [], task: makeTask({ description: null }) })
    expect(within(container).getByRole('region', { name: 'Checklist' })).toBeInTheDocument()
    expect(within(container).getByLabelText('Add checklist item')).toBeInTheDocument()
    expect(container).not.toHaveTextContent(/No steps yet/i)
    expect(within(container).getByRole('button', { name: 'Edit Description' })).toHaveTextContent('+ Add a description')
  })

  it('omits the empty sections for a reader, and leaves no empty line behind', () => {
    const { container } = renderRecord({ viewerId: 'stranger', checklist: [], task: makeTask({ description: null }) })
    expect(sections(container)).toEqual([])
    expect(container).not.toHaveTextContent(/No steps yet|No comments yet|No activity yet/i)
  })

  it('shows a reader the comments that exist, with no composer', () => {
    const { container } = renderRecord({
      viewerId: 'stranger', comments: [{ id: 'k1', author_id: PIC, body: 'Moved the order to Monday', created_at: '2026-07-21T00:00:00Z' }],
    })
    expect(within(container).getByRole('region', { name: 'Comments' })).toHaveTextContent('Moved the order to Monday')
    expect(within(container).queryByRole('textbox')).toBeNull()
  })

  it('keeps the composer to one line until it is focused', () => {
    const { container } = renderRecord()
    const composer = within(container).getByRole('textbox', { name: /comment/i })
    expect(composer).toHaveAttribute('rows', '1')
    expect(within(container).queryByRole('button', { name: /post comment/i })).toBeNull()
    fireEvent.focus(composer)
    expect(composer).toHaveAttribute('rows', '3')
    expect(within(container).getByRole('button', { name: /post comment/i })).toBeInTheDocument()
  })
})
