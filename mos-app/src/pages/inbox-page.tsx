import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useT } from '@/i18n/use-t'
import { InboxTriageConnected } from '@/components/inbox/inbox-triage-connected'

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
  return (
    // V3 Workspace family (Issue 11): the shared frame owns the h1 + job sentence
    // (no surface-title glyph — the ✉ was the "several apps" tell).
    <PageFamilyFrame family="workspace" title={t('inbox.title')} jobSentence={t('job.inbox')}>
      <InboxTriageConnected mode="page" />
    </PageFamilyFrame>
  )
}
