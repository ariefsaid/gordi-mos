import type { TaskListRow, ChecklistItemRow, TaskEventRow } from '@/lib/db/tasks.types'
import type { PersonOption } from '@/lib/db/directory'
import { ActivityCard } from './activity-card'
import { ChecklistCard } from './checklist-card'
import { CommentThread, type TaskComment } from './CommentThread'
import { useT } from '@/i18n/use-t'

// Feed tab vocabulary (ADR-0013 D3 right-feed). Order: Activity first (the manager-triage
// default), then Checklist. The former "Notes" tab was REMOVED (owner-eyes item 11): it merely
// re-rendered the Task's `description` as static text — dead content (no edit affordance) that
// also duplicated the editable Description in the record's TASK DETAILS section. A Task has no
// separate notes concept in the model (only `description`), so Description keeps its ONE canonical
// home (the value-first field in TASK DETAILS) and no surface renders it a second time, read-only.
export type FeedTab = 'activity' | 'checklist'

const TAB_ORDER: FeedTab[] = ['activity', 'checklist']
export type RecordFeedProps = {
  task: TaskListRow
  checklist: ChecklistItemRow[]
  events: TaskEventRow[]
  comments: TaskComment[]
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
  onPostComment: (body: string) => Promise<void> | void
  /** OD-REDESIGN-22 (D-C1): a failed checklist write → visible error + Retry (forwarded to ChecklistCard). */
  checklistError?: { message: string; onRetry: () => void } | null
  /** D-B2: a typed-but-unposted comment feeds the host leave-guard (forwarded to CommentThread). */
  onCommentDirtyChange?: (dirty: boolean) => void
}

// The right-hand record feed (ADR-0013 D3): a tab strip Activity / Checklist /
// Notes over the matching pane. Active tab is marked by weight + a 2px
// border-primary underline (never color-alone). ARIA tabs pattern with roving
// tabindex + ArrowLeft/Right navigation. The feed NEVER carries a weekly-update
// write/ack affordance (Lens-D guard A2 — this is a Task, not the upward-review pane).
export function RecordFeed({
  task, checklist, events, comments, people, now, editable, viewerId,
  activeTab, onSelectTab,
  onAddChecklist, onToggleChecklist, onReorderChecklist, onDeleteChecklist,
  onPostComment, checklistError = null, onCommentDirtyChange,
}: RecordFeedProps) {
  const t = useT()
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
        {key === 'activity' ? t('tasks.feed.activity') : t('tasks.feed.checklist')}
        {count !== null && <span className="rf-tcount tabular-nums">{count}</span>}
      </button>
    )
  }

  return (
    <div className="record-feed">
      <div className="rf-tabs" role="tablist" aria-label={t('tasks.feed.aria')}>
        {renderTab('activity', events.length > 0 ? `${events.length}` : null)}
        {renderTab('checklist', checklist.length > 0 ? `${done}/${checklist.length}` : null)}
      </div>

      <div
        className="rf-tabpane"
        role="tabpanel"
        id={`rf-tabpanel-${activeTab}`}
        aria-labelledby={`rf-tab-${activeTab}`}
      >
        {activeTab === 'activity' && (() => {
          // owner-eyes item 5 — collapse the empty stack. The old pane always stacked
          // "Activity & updates / No activity yet. / Comments / No comments yet." + composer, four
          // quiet lines and two orphan headings for an untouched task. Instead:
          //   • both empty → ONE combined quiet line (+ the composer, when the viewer can post).
          //   • only comments empty → a single quiet "No comments yet." line inside the (heading-
          //     less) comment section; the activity list stays.
          //   • only activity empty → just the comment list; no orphan activity-empty line.
          // The Activity/Comments headings are sr-only here (the active tab already reads "Activity").
          const activityEmpty = events.length === 0
          const commentsEmpty = comments.length === 0
          const bothEmpty = activityEmpty && commentsEmpty
          const commentsEmptyLabel = bothEmpty
            ? (editable ? t('tasks.feed.emptyCombined') : t('tasks.activityEmpty'))
            : commentsEmpty
              ? t('tasks.commentsEmpty')
              : null
          return (
            <>
              {!activityEmpty && <ActivityCard events={events} people={people} now={now} />}
              <CommentThread
                comments={comments}
                people={people}
                canPost={editable}
                onPost={onPostComment}
                heading="srOnly"
                emptyLabel={commentsEmptyLabel}
                onDirtyChange={onCommentDirtyChange}
              />
            </>
          )
        })()}
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
            saveError={checklistError}
          />
        )}
      </div>
    </div>
  )
}
