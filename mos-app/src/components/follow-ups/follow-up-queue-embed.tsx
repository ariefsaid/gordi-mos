// FollowUpQueueEmbed — Door 1 (Work → Tasks saved-view `?view=followups`).
// Money-inbox-alignment (Step 9, FR-903/AC-904). Composes useFollowUpQueue +
// FollowUpQueueTable, the shared pair Rule 11 / FR-905 asks every door to use. No PageFrame/
// PageHead: this mounts inside TasksWorkspace's own content region (Rule 6),
// which owns the region landmark + aria-label around both the placeholder and
// live states.
//
// TWO RENDERERS, NOT ONE. This header used to claim the canonical FollowUpsPage renders the same
// pair. It does not: pages/follow-ups-page.tsx is a 261-line bespoke renderer importing none of
// useFollowUpQueue / FollowUpQueueTable / useFollowUpRecordOpener. Both doors are dark behind
// SHOW_FOLLOWUPS today, so this is a divergence in the SOURCE, not one a viewer can reach yet:
// when the flag lights, the same record type renders two different ways depending on the door.
// The rebuild is deferred (OD-WAY-34); #428 owns the cutover. The claim is corrected rather than
// deleted because asserting the divergence away is exactly what let it be rediscovered four times.
//
// JQ-4 / interaction D-A4: this embed passes the shared record opener, so the counterparty cell
// opens the follow-up in the shared overlay-host panel instead of a bare <Link> page-jump. That
// is the open grammar every door is MEANT to share; the Money page shares none of it, and in fact
// offers no record-open affordance at all — its detail aside is a lifecycle-form target
// (settle/partial/promise), and the `:id` it also reads belongs to a route deleted by DD-WAY-36.
import { useFollowUpQueue } from './use-follow-up-queue'
import { FollowUpQueueTable } from './follow-up-queue-table'
import { useFollowUpRecordOpener } from './use-follow-up-record-opener'

export function FollowUpQueueEmbed() {
  const queue = useFollowUpQueue()
  const onOpenRecord = useFollowUpRecordOpener()
  return <FollowUpQueueTable queue={queue} onOpenRecord={onOpenRecord} />
}
