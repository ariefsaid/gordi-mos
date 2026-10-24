// The Meetings list body: scope switch, search, and the table (desktop) or stacked rows (phone).
// Newest first, as the data layer returns it; a Meeting still without a date ("Set date and time") leads.
import { Link } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { useI18n } from '@/i18n/I18nProvider'
import { useT } from '@/i18n/use-t'
import type { MeetingListRow } from '@/lib/db/meetings.types'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { nameOf, type MeetingContext } from './meeting-context'
import { formatMeetingWhen } from './meeting-format'
import './meetings-list.css'

function LockIcon({ label }: { label: string }) {
  return (
    <span className="meetings-lock" role="img" aria-label={label}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    </span>
  )
}

export function MeetingsList({ rows, ctx, onOpen }: { rows: readonly MeetingListRow[]; ctx: MeetingContext; onOpen: (id: string) => void }) {
  const t = useT()
  const { locale } = useI18n()
  const isDesktop = useIsDesktop()
  const whenOf = (row: MeetingListRow) => (row.startsAt ? formatMeetingWhen(row.startsAt, locale) : t('meetings.setWhen'))
  const teamOf = (row: MeetingListRow) => nameOf(ctx.teams, row.owningTeamId) ?? ''

  const identity = (row: MeetingListRow) => (
    <span className="meetings-identity">
      {row.isPrivate ? <LockIcon label={t('meetings.private')} /> : null}
      <Link
        to={`/work/meetings/${row.id}`}
        className="meetings-name"
        onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
          event.preventDefault()
          onOpen(row.id)
        }}
      >
        {row.title}
      </Link>
    </span>
  )
  const columns: DataTableColumn<MeetingListRow>[] = [
    { key: 'title', className: 'meetings-col-name', header: t('meetings.col.meeting'), render: identity },
    { key: 'when', className: 'meetings-col-when', header: t('meetings.col.when'), render: (row) => <span className={row.startsAt ? undefined : 'meetings-unset'}>{whenOf(row)}</span> },
    { key: 'team', className: 'meetings-col-team', header: t('meetings.col.team'), render: teamOf },
    { key: 'attendees', className: 'meetings-col-num', header: t('meetings.col.attendees'), numeric: true, render: (row) => row.attendeeIds.length },
    { key: 'open', className: 'meetings-col-num', header: t('meetings.col.open'), numeric: true, render: (row) => row.openTaskCount },
  ]
  const renderCard = (row: MeetingListRow) => (
    <div className="meetings-card">
      <div className="meetings-card__head">
        {identity(row)}
        {row.openTaskCount > 0 ? <span className="meetings-badge">{t('meetings.openBadge', { count: row.openTaskCount })}</span> : null}
      </div>
      <p className="meetings-card__meta">{[whenOf(row), teamOf(row)].filter(Boolean).join(' · ')}</p>
    </div>
  )
  return (
    <div className="meetings-list" role="region" aria-label={t('nav.work.meetings')}>
      <DataTable
        tableClassName="meetings-table"
        columns={columns}
        rows={[...rows]}
        isDesktop={isDesktop}
        renderCard={renderCard}
        caption={t('nav.work.meetings')}
      />
    </div>
  )
}
