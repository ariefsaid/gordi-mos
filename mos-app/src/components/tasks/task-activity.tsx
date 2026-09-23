import type { PersonOption } from '@/lib/db/directory'
import type { TaskEventRow } from '@/lib/db/tasks.types'
import { ActivityCard } from './activity-card'
import { CommentThread, type TaskComment } from './CommentThread'
import { useT } from '@/i18n/use-t'

// TaskActivity — the Task record's Activity (audit) region: the event log + the comment thread,
// stacked and quiet, as the LAST content region of the content-first anatomy (OD-REDESIGN-90 §2.2
// item 5). Extracted verbatim from the retired RecordFeed's Activity pane (the tabbed feed is gone
// now that Checklist and Activity are separate ordered regions, not two tabs). It never carries a
// weekly-update write/ack affordance (Lens-D guard A2 — this is a Task, not the upward-review pane)
// and never re-renders the Task description read-only (owner-eyes item 11 — Description has ONE home,
// the content region above).
export type TaskActivityProps = {
  events: TaskEventRow[]
  comments: TaskComment[]
  people: PersonOption[]
  now: Date
  editable: boolean
  onPostComment: (body: string) => Promise<void> | void
  /** D-B2: a typed-but-unposted comment feeds the host leave-guard (forwarded to CommentThread). */
  onCommentDirtyChange?: (dirty: boolean) => void
}

export function TaskActivity({
  events, comments, people, now, editable, onPostComment, onCommentDirtyChange,
}: TaskActivityProps) {
  const t = useT()
  // owner-eyes item 5 — collapse the empty stack. Never stack "No activity yet." + "No comments
  // yet." as two orphan lines:
  //   • both empty → ONE combined quiet line (+ the composer, when the viewer can post).
  //   • only comments empty → a single quiet "No comments yet." line (the activity list stays).
  //   • only activity empty → just the comment list; no orphan activity-empty line.
  const activityEmpty = events.length === 0
  const commentsEmpty = comments.length === 0
  const bothEmpty = activityEmpty && commentsEmpty
  const commentsEmptyLabel = bothEmpty
    ? (editable ? t('tasks.feed.emptyCombined') : t('tasks.activityEmpty'))
    : commentsEmpty
      ? t('tasks.commentsEmpty')
      : null
  return (
    <div className="record-activity">
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
    </div>
  )
}
