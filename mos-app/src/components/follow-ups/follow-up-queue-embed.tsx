// FollowUpQueueEmbed — Door 1 (Work → Tasks saved-view `?view=followups`).
// Money-inbox-alignment (Step 9, FR-903/AC-904). Renders the SAME
// useFollowUpQueue + FollowUpQueueTable pair as the canonical FollowUpsPage —
// no second table/detail implementation (Rule 11, FR-905). No PageFrame/
// PageHead: this mounts inside TasksWorkspace's own content region (Rule 6),
// which owns the region landmark + aria-label around both the placeholder and
// live states.
import { useFollowUpQueue } from './use-follow-up-queue'
import { FollowUpQueueTable } from './follow-up-queue-table'

export function FollowUpQueueEmbed() {
  const queue = useFollowUpQueue()
  return <FollowUpQueueTable queue={queue} />
}
