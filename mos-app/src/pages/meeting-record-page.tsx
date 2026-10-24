import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { MeetingRecordDocument } from '@/components/meetings/meeting-record-document'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { RecordPageChrome } from '@/shell/record-page-chrome'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { useSetBreadcrumbTitle } from '@/shell/breadcrumb-title'
import { useDocumentTitle } from '@/shell/use-document-title'

/** The Meeting record page: `/work/meetings/:meetingId`, and `/work/meetings/new` for a blank new meeting. */
export function MeetingRecordPage() {
  const t = useT()
  const { meetingId } = useParams<{ meetingId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const [title, setTitle] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  useSetBreadcrumbTitle(title ?? '')
  useDocumentTitle(t('common.docTitle', {
    page: title ? `${title} · ${t('nav.work.meetings')}` : t('nav.work.meetings'),
  }))

  // The leave guard must see the draft as saved before the page moves on to the new record.
  useEffect(() => {
    if (createdId && !dirty) navigate(`/work/meetings/${createdId}`, { replace: true })
  }, [createdId, dirty, navigate])

  const back = { pathname: '/work/meetings', search: location.search }
  if (!meetingId && !location.pathname.endsWith('/new')) return <Navigate to="/work/meetings" replace />

  return (
    <PageFamilyFrame family="focused-record" title={t('nav.work.meetings')} hideHead>
      <RouteLeaveGuard when={dirty} message={t('meetings.create.discardBody')} />
      <ConfirmDialog
        open={confirmCancel}
        title={t('tasks.unsaved.title')}
        body={t('meetings.create.discardBody')}
        confirmLabel={t('tasks.unsaved.discard')}
        cancelLabel={t('leaveGuard.stay')}
        tone="destructive"
        onConfirm={async () => { setConfirmCancel(false); setDirty(false); navigate(back) }}
        onCancel={() => setConfirmCancel(false)}
      />
      <RecordPageChrome backTo={back} backLabel={t('nav.work.meetings')} />
      <MeetingRecordDocument
        key={meetingId ?? 'new'}
        id={meetingId ?? null}
        mode="page"
        onTitleResolved={setTitle}
        onDirtyChange={setDirty}
        onCreated={(id) => { setDirty(false); setCreatedId(id) }}
        onCancelCreate={() => { if (dirty) setConfirmCancel(true); else navigate(back) }}
      />
    </PageFamilyFrame>
  )
}
