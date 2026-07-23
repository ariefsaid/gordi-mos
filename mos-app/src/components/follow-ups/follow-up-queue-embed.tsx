// FollowUpQueueEmbed — Door 1 (Work → Tasks saved-view `?view=followups`).
// Money-inbox-alignment (Step 9, FR-903/AC-904). Renders the SAME
// useFollowUpQueue + FollowUpQueueTable pair as the canonical FollowUpsPage —
// no second table/detail implementation (Rule 11, FR-905). No PageFrame/
// PageHead: this mounts inside TasksWorkspace's own content region (Rule 6),
// which owns the region landmark + aria-label around both the placeholder and
// live states.
//
// JQ-4 / interaction D-A4: this embed now passes the SAME shared record opener the canonical page
// uses, so the counterparty cell opens the follow-up in the shared overlay-host panel instead of a
// bare <Link> page-jump — one open grammar across every door.
import { useFollowUpQueue } from './use-follow-up-queue'
import { FollowUpQueueTable } from './follow-up-queue-table'
import { useFollowUpRecordOpener } from './use-follow-up-record-opener'

export function FollowUpQueueEmbed() {
  const queue = useFollowUpQueue()
  const onOpenRecord = useFollowUpRecordOpener()
  return <FollowUpQueueTable queue={queue} onOpenRecord={onOpenRecord} />
}
