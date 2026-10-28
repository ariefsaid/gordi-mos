import { lazy, Suspense, type ComponentProps } from 'react'
import { LoadingShell } from '@/components/ui/state-kit'

// A Meeting opened from a record's Meetings section or a document link; loaded only when one is opened.
const MeetingRecordDocument = lazy(() => import('@/components/meetings/meeting-record-document').then((m) => ({ default: m.MeetingRecordDocument })))

type Props = ComponentProps<typeof MeetingRecordDocument> & { loadingLabel: string }

export function CatalogMeetingRecordDocument({ loadingLabel, ...props }: Props) {
  return (
    <Suspense fallback={<LoadingShell label={loadingLabel} />}>
      <MeetingRecordDocument {...props} />
    </Suspense>
  )
}
