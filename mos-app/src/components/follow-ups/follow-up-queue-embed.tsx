// FollowUpQueueEmbed — Door 1 (Work → Tasks saved-view `?view=followups`).
// Money-inbox-alignment (Step 9, FR-903/AC-904). Composes useFollowUpQueue +
// FollowUpQueueTable, the shared pair Rule 11 / FR-905 asks every door to use. No PageFrame/
// PageHead: this mounts inside TasksWorkspace's own content region (Rule 6),
// which owns the region landmark + aria-label around both the placeholder and
// live states.
//
// TWO RENDERERS, NOT ONE. This header used to claim the canonical FollowUpsPage renders the same
// pair. It does not: pages/follow-ups-page.tsx is a 261-line bespoke renderer importing none of
// useFollowUpQueue / FollowUpQueueTable / useFollowUpRecordOpener, so the same record type opens
// two different ways depending on the door — the shared overlay panel from Tasks, an inline aside
// from Money. The rebuild is deferred (SHOW_FOLLOWUPS, OD-WAY-34); #428 owns the cutover. The
// claim is corrected rather than deleted because asserting the divergence away is exactly what
// let it be rediscovered four times.
//
// JQ-4 / interaction D-A4: this embed passes the shared record opener, so the counterparty cell
// opens the follow-up in the shared overlay-host panel instead of a bare <Link> page-jump. That
// is the open grammar every door is MEANT to share; until #428 lands, the Money page is the door
// that does not.
import { useFollowUpQueue } from './use-follow-up-queue'
import { FollowUpQueueTable } from './follow-up-queue-table'
import { useFollowUpRecordOpener } from './use-follow-up-record-opener'

export function FollowUpQueueEmbed() {
  const queue = useFollowUpQueue()
  const onOpenRecord = useFollowUpRecordOpener()
  return <FollowUpQueueTable queue={queue} onOpenRecord={onOpenRecord} />
}
