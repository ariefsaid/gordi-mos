import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useT } from '@/i18n/use-t'
import { InboxTriageConnected } from '@/components/inbox/inbox-triage-connected'
import { OverlayHostSlot, useOptionalOverlayHost } from '@/shell/overlay-host'
import { useIsSplitWidth } from '@/shell/use-is-split-width'
import { HelpTip } from '@/components/ui/help-tip'

/**
 * InboxPage — the Inbox destination (ADR-0019 D2/D9). A to-triage list of the viewer's
 * notifications; opening a row marks it read and opens the owning record IN CONTEXT through the
 * shared overlay host (Issue 7). Inbox is always live (Step 2, D-1). The page is the direct/refresh
 * door and the phone fallback for the bell; the triage body is the same InboxTriage surface the
 * bell opens as a quick root, so both doors open records identically. The connected body owns its
 * own loading/empty/error grammar (one shared state kit — no bare skeleton, no dead end), so the
 * frame stays neutral and does not re-derive notification state.
 */
export function InboxPage() {
  const t = useT()
  const host = useOptionalOverlayHost()
  const isSplit = useIsSplitWidth()
  // Census R2 DO-1 (F-INBOX-1): `.record-split` reserves its 360px/44% right track the moment it is
  // applied, so applying it unconditionally crushed triage to ~80px on phone and parked a permanent
  // dead void at rest on desktop. Gate it exactly like Signals/Tasks: the grid track exists only at
  // ≥1100px AND while an inbox-owned record is actually open in the slot. Below the split width the
  // host renders its own modal overlay, so the list keeps full width. (The former `.inbox-page-split`
  // companion class had no CSS anywhere — deleted rather than styled.)
  const recordOpen = host?.session?.frames.at(-1)?.entry.owner === 'inbox'
  const splitOpen = Boolean(recordOpen) && isSplit
  return (
    // V3 Workspace family (Issue 11): the shared frame owns the h1 + job sentence
    // (no surface-title glyph — the ✉ was the "several apps" tell).
    <PageFamilyFrame
      family="workspace"
      title={t('inbox.title')}
      jobSentence={t('job.inbox')}
      meta={<HelpTip label={t('inbox.help')} />}
    >
      <div className={splitOpen ? 'record-split' : undefined}>
        <InboxTriageConnected mode="page" />
        {host ? <OverlayHostSlot owner="inbox" /> : null}
      </div>
    </PageFamilyFrame>
  )
}
