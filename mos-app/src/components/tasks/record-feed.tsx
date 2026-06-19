import type { TaskListRow, ChecklistItemRow, TaskEventRow } from '@/lib/db/tasks.types'
import type { PersonOption } from '@/lib/db/directory'
import { ActivityCard } from './activity-card'
import { ChecklistCard } from './checklist-card'

// Feed tab vocabulary (ADR-0013 D3 right-feed). "Notes" maps to the existing
// description pane — no new entity (Director resolution). Order: Activity first
// (the manager-triage default), then Checklist, then Notes.
export type FeedTab = 'activity' | 'checklist' | 'notes'

const TAB_ORDER: FeedTab[] = ['activity', 'checklist', 'notes']
const TAB_LABEL: Record<FeedTab, string> = {
  activity: 'Activity',
  checklist: 'Checklist',
  notes: 'Notes',
}

export type RecordFeedProps = {
  task: TaskListRow
  checklist: ChecklistItemRow[]
  events: TaskEventRow[]
  people: PersonOption[]
  now: Date
  editable: boolean
  viewerId: string
  activeTab: FeedTab
  onSelectTab: (tab: FeedTab) => void
  onAddChecklist: (label: string) => void
  onToggleChecklist: (id: string, isDone: boolean) => void
  onReorderChecklist: (id: string, direction: 'up' | 'down') => void
  onDeleteChecklist: (id: string) => void
}

// The right-hand record feed (ADR-0013 D3): a tab strip Activity / Checklist /
// Notes over the matching pane. Active tab is marked by weight + a 2px
// border-primary underline (never color-alone). ARIA tabs pattern with roving
// tabindex + ArrowLeft/Right navigation. The feed NEVER carries a weekly-update
// write/ack affordance (Lens-D guard A2 — this is a Task, not the upward-review pane).
export function RecordFeed({
  task, checklist, events, people, now, editable, viewerId,
  activeTab, onSelectTab,
  onAddChecklist, onToggleChecklist, onReorderChecklist, onDeleteChecklist,
}: RecordFeedProps) {
  const done = checklist.filter(i => i.is_done).length

  function move(dir: 1 | -1) {
    const idx = TAB_ORDER.indexOf(activeTab)
    onSelectTab(TAB_ORDER[(idx + dir + TAB_ORDER.length) % TAB_ORDER.length])
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1) }
  }

  function renderTab(key: FeedTab, count: string | null) {
    const selected = activeTab === key
    return (
      <button
        key={key}
        type="button"
        role="tab"
        id={`rf-tab-${key}`}
        aria-selected={selected}
        aria-controls={`rf-tabpanel-${key}`}
        tabIndex={selected ? 0 : -1}
        className={`rf-tab${selected ? ' on' : ''}`}
        onClick={() => onSelectTab(key)}
        onKeyDown={handleKey}
      >
        {TAB_LABEL[key]}
        {count !== null && <span className="rf-tcount tabular-nums">{count}</span>}
      </button>
    )
  }

  return (
    <div className="record-feed">
      <div className="rf-tabs" role="tablist" aria-label="Record feed">
        {renderTab('activity', events.length > 0 ? `${events.length}` : null)}
        {renderTab('checklist', checklist.length > 0 ? `${done}/${checklist.length}` : null)}
        {renderTab('notes', null)}
      </div>

      <div
        className="rf-tabpane"
        role="tabpanel"
        id={`rf-tabpanel-${activeTab}`}
        aria-labelledby={`rf-tab-${activeTab}`}
      >
        {activeTab === 'activity' && (
          <ActivityCard events={events} people={people} now={now} />
        )}
        {activeTab === 'checklist' && (
          <ChecklistCard
            items={checklist}
            canEdit={editable}
            taskId={task.id}
            viewerId={viewerId}
            onAdd={onAddChecklist}
            onToggle={onToggleChecklist}
            onReorder={onReorderChecklist}
            onDelete={onDeleteChecklist}
          />
        )}
        {activeTab === 'notes' && (
          <section className="rf-notes" aria-label="Notes">
            {task.description
              ? <p className="desc-body">{task.description}</p>
              : <p className="empty-substate">No notes.</p>
            }
          </section>
        )}
      </div>
    </div>
  )
}
