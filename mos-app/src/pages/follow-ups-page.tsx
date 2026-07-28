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
import { useFollowUpQueue } from '@/components/follow-ups/use-follow-up-queue'
import { FollowUpQueueTable } from '@/components/follow-ups/follow-up-queue-table'
import { useFollowUpRecordOpener } from '@/components/follow-ups/use-follow-up-record-opener'

export function FollowUpsPage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('doc.followUpQueue') }))
  const route = useParams<{ id?: string }>()
  const queue = useFollowUpQueue({ detailId: route.id })

  // The ONE shared follow-up record opener (drawer-first, ROUTE mode) — identical to the Work Tasks
  // saved-view embed's door so both open the record the same way. See use-follow-up-record-opener.ts.
  const onOpenRecord = useFollowUpRecordOpener()

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
