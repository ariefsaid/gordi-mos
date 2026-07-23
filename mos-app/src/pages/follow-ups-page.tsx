// FollowUpsPage — the canonical Follow-up queue page (/work/follow-ups,
// /work/follow-ups/:id, and — after Step 9 — /money/follow-ups). Composes the
// shared useFollowUpQueue hook + FollowUpQueueTable renderer — the SAME
// components the Work Tasks saved-view embed uses (FR-905/AC-906/AC-907,
// ADR-0025 D9). Rendered behavior is unchanged from the pre-Step-9
// implementation; only the PageFrame/PageHead chrome stays owned here.
import { useParams } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useOptionalOverlayHost } from '@/shell/overlay-host'
import { useFollowUpQueue } from '@/components/follow-ups/use-follow-up-queue'
import { FollowUpQueueTable } from '@/components/follow-ups/follow-up-queue-table'
import { FollowUpRecordHost } from '@/components/follow-ups/follow-up-record-host'
import type { FollowUpRow } from '@/lib/db/follow-ups'

export function FollowUpsPage() {
  useDocumentTitle('Follow-up queue — Gordi MOS')
  const t = useT()
  const route = useParams<{ id?: string }>()
  const queue = useFollowUpQueue({ detailId: route.id })
  const host = useOptionalOverlayHost()

  // Drawer-first record door (Luna audit B4): the queue row opens the follow-up record in panel
  // mode through the shared overlay host, preserving the queue behind the panel. The canonical
  // page route (/work/follow-ups/:id) remains reachable via the host chrome's Open-full-page
  // button (the entry carries pageTo). Falls back to no callback when the host is unavailable
  // (defensive — FollowUpsPage always renders under the shell host, but the fallback keeps the
  // table's contract honest for isolated test/embed use).
  //
  // D-A3 (fix work-order item 5): opens in ROUTE mode, not ephemeral. Route mode pushes a real
  // `__mosOverlay` history marker, so browser Back closes the panel and returns to the queue.
  // Ephemeral pushed no history entry, so Back ejected the user OUT of the section entirely
  // (panel AND queue gone) — the dead-end I2 + OD-REDESIGN-20 forbid.
  const onOpenRecord = (row: FollowUpRow) => {
    if (!host) return
    void host.openRoot(
      {
        key: `follow-up:${row.id}`,
        owner: 'shell',
        tenant: 'record',
        label: row.counterparty,
        title: row.counterparty,
        pageTo: { pathname: `/work/follow-ups/${row.id}` },
        content: <FollowUpRecordHost followUpId={row.id} mode="panel" />,
      },
      'route',
    )
  }

  return (
    <PageFamilyFrame
      family="workspace"
      title={t('followUps.title')}
      jobSentence={t('followUps.subtitle')}
      count={queue.state === 'ready' ? queue.rows.length : null}
      meta={<span>{t('followUps.overdue')}: {queue.overdueCount}</span>}
    >
      <FollowUpQueueTable queue={queue} onOpenRecord={onOpenRecord} />
    </PageFamilyFrame>
  )
}
