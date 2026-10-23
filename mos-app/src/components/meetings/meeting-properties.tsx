// The Meeting's properties block: When, Owning Team, Attendees, Private, Linked to and Series, as rows of the
// shared RecordProperties. Every value edits in place for those who may edit; everyone else sees plain values.
// Handlers return a promise; the host decides how a failed save is reported.
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Picker, type PickerOption } from '@/components/ui/picker'
import { Toggle } from '@/components/ui/toggle'
import { RecordProperties, type RecordPropertyRow } from '@/components/record/record-properties'
import { useI18n } from '@/i18n/I18nProvider'
import { useT } from '@/i18n/use-t'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsOffline } from '@/shell/use-is-offline'
import type { MeetingSeriesLink } from '@/lib/db/meetings.types'
import { nameOf, type MeetingContext } from './meeting-context'
import { formatMeetingWhen, fromWibInput, initialsOf, toWibInput } from './meeting-format'

export type MeetingPropertyValues = {
  startsAt: string | null
  owningTeamId: string | null
  attendeeIds: string[]
  isPrivate: boolean
  workLineId: string | null
  objectiveId: string | null
}

type MeetingSeriesInfo = {
  number: number
  previous: MeetingSeriesLink | null
  next: MeetingSeriesLink | null
  canStart: boolean
  starting: boolean
  onStart: () => void
}

export type MeetingPropertiesProps = {
  ctx: MeetingContext
  value: MeetingPropertyValues
  editable: boolean
  /** An attendee who cannot be removed (the creator, on a draft). */
  pinnedAttendeeId?: string | null
  /** A new meeting still without a Team shows the Needed cue. */
  teamNeeded?: boolean
  /** Change it to open a folded block (a failed Create shows what is missing). */
  unfold?: number
  series?: MeetingSeriesInfo
  /** Resolves true once saved; false keeps the editor open (the host has said why). */
  onStartsAt: (iso: string | null) => Promise<boolean>
  onTeam: (teamId: string) => Promise<void>
  /** The Teams the viewer may pick: their own, or all for an admin (the database allows no other). */
  teamChoices: ReadonlyArray<{ id: string; name: string }>
  onAddAttendee: (personId: string) => Promise<void>
  onRemoveAttendee: (personId: string) => Promise<void>
  onPrivate: (next: boolean) => Promise<void>
  onLinked: (next: { workLineId: string | null; objectiveId: string | null }) => Promise<void>
  /** Open a series neighbour in the host's own way (a panel pushes a frame); omitted = plain page link. */
  openMeeting?: (id: string) => void
}

function Mark({ name }: { name: string }) {
  return <span className="rp-avatar" data-initials={initialsOf(name)} aria-hidden="true" />
}

function WhenField({ iso, editable, onSave }: { iso: string | null; editable: boolean; onSave: (iso: string | null) => Promise<boolean> }) {
  const t = useT()
  const { locale } = useI18n()
  const offline = useIsOffline()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const text = iso ? formatMeetingWhen(iso, locale, true) : null
  if (!editable) return <span className="meeting-when meeting-when--plain">{text ?? t('catalog.notSet')}</span>
  const begin = () => { setDraft(iso ? toWibInput(iso) : ''); setEditing(true) }
  const commit = async () => {
    const next = fromWibInput(draft)
    if (!next) return
    setBusy(true)
    try { if (await onSave(next)) setEditing(false) } finally { setBusy(false) }
  }
  if (!editing) {
    return (
      <button type="button" className={`meeting-when${iso ? '' : ' meeting-when--unset'}`} disabled={offline} onClick={begin} aria-label={iso ? `${t('meetings.when.edit')}: ${text}` : undefined}>
        {text ?? t('meetings.setWhen')}
      </button>
    )
  }
  return (
    <form className="meeting-when-edit" onSubmit={(event) => { event.preventDefault(); void commit() }} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setEditing(false) } }}>
      <input type="datetime-local" className="meeting-when-edit__input" aria-label={t('meetings.prop.when')} autoFocus required value={draft} onChange={(event) => setDraft(event.target.value)} />
      <Button type="submit" variant="primary" disabled={busy || !fromWibInput(draft)}>{t('meetings.when.save')}</Button>
    </form>
  )
}

function Attendees({ ctx, ids, editable, pinnedId, onAdd, onRemove }: {
  ctx: MeetingContext; ids: string[]; editable: boolean; pinnedId?: string | null
  onAdd: (id: string) => Promise<void>; onRemove: (id: string) => Promise<void>
}) {
  const t = useT()
  const isDesktop = useIsDesktop()
  const offline = useIsOffline()
  const [listOpen, setListOpen] = useState(false)
  const nameFor = (id: string) => ctx.people.find((person) => person.id === id)?.full_name ?? ''
  const attendees = ids.map((id) => ({ id, name: nameFor(id) })).filter((person) => person.name !== '')
  const addable: PickerOption[] = ctx.people.filter((person) => !ids.includes(person.id)).map((person) => ({ value: person.id, label: person.full_name }))
  const add = editable ? (
    <Picker
      label={t('meetings.attendees.add')}
      hideLabel
      value=""
      options={addable}
      placeholder={isDesktop ? `+ ${t('meetings.attendees.add')}` : '+'}
      disabled={offline}
      triggerClassName={isDesktop ? 'meeting-add' : 'meeting-add meeting-add--icon'}
      onChange={(personId) => { if (personId) void onAdd(personId) }}
    />
  ) : null
  const removable = (person: { id: string; name: string }) => editable && person.id !== pinnedId && !offline
  const names = (
    <ul className="meeting-attendees__list">
      {attendees.map((person) => (
        <li key={person.id} className="meeting-attendees__item">
          <Mark name={person.name} />
          <span>{person.name}</span>
          {removable(person) ? (
            <button type="button" className="meeting-attendees__remove" aria-label={t('meetings.attendees.remove', { name: person.name })} onClick={() => { void onRemove(person.id) }}>
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  )
  if (isDesktop) return <div className="meeting-attendees">{names}{add}</div>
  const count = attendees.length
  return (
    <div className="meeting-attendees meeting-attendees--phone">
      <div className="meeting-attendees__faces">
        <button type="button" className="meeting-attendees__summary" aria-expanded={listOpen} aria-label={t('meetings.attendees.list')} onClick={() => setListOpen((open) => !open)}>
          <span className="meeting-attendees__stack" aria-hidden="true">{attendees.slice(0, 5).map((person) => <Mark key={person.id} name={person.name} />)}</span>
          <span>{t(count === 1 ? 'meetings.attendees.count.one' : 'meetings.attendees.count.other', { count })}</span>
        </button>
        {add}
      </div>
      {listOpen ? names : null}
    </div>
  )
}

function linkedValue(workLineId: string | null, objectiveId: string | null): string {
  return workLineId ? `wl:${workLineId}` : objectiveId ? `ob:${objectiveId}` : ''
}

export function MeetingProperties({
  ctx, value, editable, pinnedAttendeeId, teamNeeded, unfold, series, teamChoices,
  onStartsAt, onTeam, onAddAttendee, onRemoveAttendee, onPrivate, onLinked, openMeeting,
}: MeetingPropertiesProps) {
  const t = useT()
  const offline = useIsOffline()
  const { locale } = useI18n()
  const teamName = nameOf(ctx.teams, value.owningTeamId)
  const linkedName = nameOf(ctx.workLines, value.workLineId) ?? nameOf(ctx.objectives, value.objectiveId)
  const linkedHref = value.workLineId ? `/work/projects/${value.workLineId}` : value.objectiveId ? `/work/objectives/${value.objectiveId}` : null
  const linkedOptions: PickerOption[] = [
    { value: '', label: t('meetings.linked.none') },
    ...ctx.workLines.map((line) => ({ value: `wl:${line.id}`, label: line.name, group: t('nav.work.projects') })),
    ...ctx.objectives.map((objective) => ({ value: `ob:${objective.id}`, label: objective.name, group: t('nav.work.objectives') })),
  ]
  const neighbour = (link: MeetingSeriesLink) => (
    <Link
      className="meeting-series__link"
      to={`/work/meetings/${link.id}`}
      onClick={(event) => {
        if (!openMeeting || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        openMeeting(link.id)
      }}
    >
      {link.startsAt ? formatMeetingWhen(link.startsAt, locale).split(' · ')[0] : t('meetings.setWhen')}
    </Link>
  )

  const rows: RecordPropertyRow[] = [
    { key: 'when', label: t('meetings.prop.when'), children: <WhenField iso={value.startsAt} editable={editable} onSave={onStartsAt} /> },
    {
      key: 'team',
      label: t('meetings.prop.team'),
      note: teamNeeded && !value.owningTeamId ? t('meetings.create.teamRequired') : undefined,
      children: editable ? (
        <Picker
          label={t('meetings.team.edit')}
          hideLabel
          value={value.owningTeamId ?? ''}
          options={teamChoices.map((team) => ({ value: team.id, label: team.name }))}
          placeholder={t('meetings.team.choose')}
          disabled={offline}
          triggerClassName="meeting-pick"
          onChange={(teamId) => { if (teamId) void onTeam(teamId) }}
        />
      ) : <span className="meeting-plain">{teamName ?? t('catalog.notSet')}</span>,
    },
    {
      key: 'attendees',
      label: t('meetings.prop.attendees'),
      children: <Attendees ctx={ctx} ids={value.attendeeIds} editable={editable} pinnedId={pinnedAttendeeId} onAdd={onAddAttendee} onRemove={onRemoveAttendee} />,
    },
    {
      key: 'private',
      label: t('meetings.prop.private'),
      note: value.isPrivate ? t('meetings.private.helpOn') : t('meetings.private.helpOff'),
      children: (
        <span className="meeting-private">
          <Toggle value={value.isPrivate} disabled={!editable || offline} aria-label={t('meetings.private')} onChange={(next) => { void onPrivate(next) }} />
          <span>{value.isPrivate ? t('meetings.private.on') : t('meetings.private.off')}</span>
        </span>
      ),
    },
    {
      key: 'linked',
      label: t('meetings.prop.linked'),
      children: editable ? (
        <Picker
          label={t('meetings.linked.choose')}
          hideLabel
          value={linkedValue(value.workLineId, value.objectiveId)}
          options={linkedOptions}
          placeholder={t('meetings.linked.none')}
          disabled={offline}
          triggerClassName="meeting-pick"
          onChange={(next) => {
            const [kind, id] = next.split(':')
            void onLinked({ workLineId: kind === 'wl' ? id : null, objectiveId: kind === 'ob' ? id : null })
          }}
        />
      ) : linkedHref
        ? <Link className="meeting-plain meeting-plain--link" to={linkedHref}>{linkedName ?? t('meetings.linked.unavailable')}</Link>
        : <span className="meeting-plain">{t('meetings.linked.none')}</span>,
    },
  ]
  if (series) {
    rows.push({
      key: 'series',
      label: t('meetings.prop.series'),
      children: (
        <div className="meeting-series">
          <span className="meeting-series__number">{t('meetings.series.number', { n: series.number })}</span>
          {series.previous
            ? <span className="meeting-series__step">{t('meetings.series.previous')} · {neighbour(series.previous)}</span>
            : <span className="meeting-series__step meeting-series__step--muted">{t('meetings.series.first')}</span>}
          {series.next
            ? <span className="meeting-series__step">{t('meetings.series.next')} · {neighbour(series.next)}</span>
            : <span className="meeting-series__step meeting-series__step--muted">{t('meetings.series.noNext')}</span>}
          {series.canStart && !series.next ? (
            <Button variant="ghost" className="meeting-series__start" disabled={series.starting || offline} onClick={series.onStart}>
              <span aria-hidden="true">+</span> {series.starting ? t('meetings.series.starting') : t('meetings.series.start')}
            </Button>
          ) : null}
        </div>
      ),
    })
  }

  const count = value.attendeeIds.length
  const summary: ReactNode = (
    <>
      <span>{value.startsAt ? formatMeetingWhen(value.startsAt, locale) : t('meetings.setWhen')}</span>
      {teamName ? <span>{teamName}</span> : null}
      <span>{t(count === 1 ? 'meetings.attendees.count.one' : 'meetings.attendees.count.other', { count })}</span>
      {value.isPrivate ? <span>{t('meetings.private')}</span> : null}
    </>
  )
  return <RecordProperties rows={rows} summary={summary} unfold={unfold} />
}
