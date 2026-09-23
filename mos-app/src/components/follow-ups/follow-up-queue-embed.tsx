// FollowUpQueueEmbed — the composed useFollowUpQueue + FollowUpQueueTable pair that Rule 11 /
// FR-905 asks every follow-up door to reuse. Money-inbox-alignment (Step 9, FR-903/AC-904).
// It renders inside a host's own content region: no PageFrame/PageHead — the HOST owns the
// region landmark + aria-label around the empty and live states.
//
// TWO RENDERERS, NOT ONE. pages/follow-ups-page.tsx is a bespoke renderer importing none of
// useFollowUpQueue / FollowUpQueueTable / useFollowUpRecordOpener. Both doors are dark behind
// SHOW_FOLLOWUPS today, so this is a divergence in the SOURCE, not one a viewer can reach yet:
// when the flag lights, the same record type renders two different ways depending on the door.
// The rebuild is deferred (OD-WAY-34); #428 owns the cutover — until then, THIS embed is the
// renderer that follows the shared-pair rule, and the divergence is deliberate, not an oversight.
//
// JQ-4 / interaction D-A4: this embed passes the shared record opener, so the counterparty cell
// opens the follow-up in the shared overlay-host panel instead of a bare <Link> page-jump. That
// is the open grammar every door is MEANT to share; the Money page shares none of it. Why that
// page cannot be read as a counter-example is stated once, in use-follow-up-record-opener.ts.
import { useFollowUpQueue } from './use-follow-up-queue'
import { FollowUpQueueTable } from './follow-up-queue-table'
import { useFollowUpRecordOpener } from './use-follow-up-record-opener'

export function FollowUpQueueEmbed() {
  const queue = useFollowUpQueue()
  const onOpenRecord = useFollowUpRecordOpener()
  return <FollowUpQueueTable queue={queue} onOpenRecord={onOpenRecord} />
}
