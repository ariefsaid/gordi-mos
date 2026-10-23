// The short "Meetings" section on a Project/Process or Objective record: the newest Meetings linked to it.
// Meetings the viewer cannot read are already absent from the data layer; with none to show the section is absent too.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RecordSection } from '@/components/record/record-page-layout'
import { useI18n } from '@/i18n/I18nProvider'
import { useT } from '@/i18n/use-t'
import { listMeetingsForRecord } from '@/lib/db/meetings'
import type { MeetingLinkRow } from '@/lib/db/meetings.types'
import { formatMeetingWhen } from './meeting-format'

export function MeetingsSection({ workLineId, objectiveId }: { workLineId?: string; objectiveId?: string }) {
  const t = useT()
  const { locale } = useI18n()
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; rows: MeetingLinkRow[] }>({ status: 'loading' })
  useEffect(() => {
    let live = true
    const target = workLineId ? { workLineId } : objectiveId ? { objectiveId } : null
    if (!target) return
    listMeetingsForRecord(target).then(
      (rows) => { if (live) setState({ status: 'ready', rows }) },
      () => { if (live) setState({ status: 'error' }) },
    )
    return () => { live = false }
  }, [workLineId, objectiveId])

  if (state.status === 'loading') return null
  if (state.status === 'error') {
    return <RecordSection id="meetings" title={t('meetings.section.title')}><p role="status">{t('meetings.section.error')}</p></RecordSection>
  }
  if (state.rows.length === 0) return null
  return (
    <RecordSection id="meetings" title={t('meetings.section.title')} count={state.rows.length}>
      <ul className="meetings-section__list">
        {state.rows.map((row) => (
          <li key={row.id} className="meetings-section__item">
            <Link to={`/work/meetings/${row.id}`}>{row.title}</Link>
            {row.isPrivate ? <span className="sr-only"> · {t('meetings.private')}</span> : null}
            <span className="meetings-section__when">{row.startsAt ? formatMeetingWhen(row.startsAt, locale) : t('meetings.setWhen')}</span>
          </li>
        ))}
      </ul>
    </RecordSection>
  )
}
