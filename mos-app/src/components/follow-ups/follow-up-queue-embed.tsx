// FollowUpQueueEmbed — Door 1 (Work → Tasks saved-view `?view=followups`).
// Money-inbox-alignment (Step 9, FR-903/AC-904). Composes useFollowUpQueue +
// FollowUpQueueTable, the shared pair Rule 11 / FR-905 asks every door to use.
//
// This comment used to claim the canonical FollowUpsPage renders the same pair. It does not:
// pages/follow-ups-page.tsx is a 261-line bespoke renderer importing none of them, so the same
// record type has two divergent renderers — the shared overlay door from Tasks, an inline aside
// from Money. The rebuild is deferred behind SHOW_FOLLOWUPS and OD-WAY-34; the duplication is
// tracked in #428. The claim is corrected here because asserting it away is what let the
// divergence be rediscovered four times. No PageFrame/
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
