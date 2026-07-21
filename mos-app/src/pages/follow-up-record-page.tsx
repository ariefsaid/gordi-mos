// FollowUpRecordPage — the standalone canonical Follow-up record door (/work/follow-ups/:id).
// R-OWNER-5: the follow-ups QUEUE (/money/follow-ups) is a workspace destination; the follow-up
// RECORD is a focused-record. Reached by a direct load / refresh / new-tab of the record URL, or
// a queue row opening its source. Reuses the ONE FollowUpRecordHost renderer at mode="page" —
// no queue shell, no bespoke in-flow aside — mirroring SignalRecordPage / the Task record page
// (Rule 11: same renderer as the drawer, `mode` the only difference).
import { Navigate, useParams } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { FollowUpRecordHost } from '@/components/follow-ups/follow-up-record-host'

export function FollowUpRecordPage() {
  useDocumentTitle('Follow-up — Gordi MOS')
  const t = useT()
  const { id } = useParams<{ id: string }>()
  if (!id) return <Navigate to="/money/follow-ups" replace />
  return (
    <PageFamilyFrame
      family="focused-record"
      title={t('followUps.record.title')}
      jobSentence={t('followUps.subtitle')}
    >
      <FollowUpRecordHost followUpId={id} mode="page" />
    </PageFamilyFrame>
  )
}
