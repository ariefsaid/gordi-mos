// The record panel over Café Records: Item history (every supported source for one identity in the
// period) and a single entry's detail. Both are read-only, keep their selection in the URL, and never
// replace a job's own home — links go to the existing Receive / Request / Review pages only where the
// viewer is admitted.
import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RecordPanelHost } from '@/shell/record-panel-host'
import { formatWibDateTime } from '@/lib/format/date'
import { buildDayRows, sortDayRows, type DayColumn, type DayRow, type RecordEntry } from '@/lib/cafe-records/model'
import { LocationRecordFields } from '@/components/preview/location-preview-fields'
import { RECORD_LOCATION_KEYS } from '@/lib/cafe-locations-preview'
import { EntryStatus, Quantity } from './records-format'
import { MOVEMENT_LABEL, SOURCE_LABEL, dateText, postingBadge, quantityText, unitText } from './records-labels'
import { type RecordsText } from './records-readings'

export interface PanelCoverage { logs: boolean; counts: boolean; receipts: boolean; requests: boolean }

interface PanelBase {
  text: RecordsText
  rangeText: string
  streamText: string
  /** The viewer may open the existing review pages (ops lead, admin, supervisor). */
  reviewer: boolean
  onClose: () => void
  onOpenEntry: (entryKey: string) => void
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="rec-fields__row"><dt>{label}</dt><dd>{children}</dd></div>
}

const DAY_ORDER: DayColumn[] = ['made', 'transferred', 'wasted', 'counted']

export function ItemHistoryPanel({ text, itemKey, itemName, entries, coverage, rangeText, streamText, reviewer: _reviewer, onClose, onOpenEntry }: PanelBase & {
  itemKey: string
  itemName: string
  entries: readonly RecordEntry[]
  coverage: PanelCoverage
}) {
  void _reviewer
  const { t } = text
  const heading = useRef<HTMLHeadingElement>(null)
  const mine = entries.filter(entry => entry.itemKey === itemKey)
  const readings = sortDayRows(buildDayRows(mine, 'everything', { logs: coverage.logs, counts: coverage.counts }), 'asc')
  const chronological = [...mine].sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at) || a.key.localeCompare(b.key))
  const incomplete = (['logs', 'counts', 'receipts', 'requests'] as const).filter(source => !coverage[source])
  const nameOnly = itemKey.startsWith('request-name:')
  // The panel is narrow: the short column words (the full ones are on the Day summary).
  const heads: Record<DayColumn, string> = {
    made: t('records.day.made'), transferred: t('records.day.out'), wasted: t('records.day.waste'), counted: t('records.day.count'),
  }
  return (
    <RecordPanelHost
      label={t('records.history.title')}
      title={t('records.history.title')}
      closeLabel={t('record.close')}
      rootClassName="drawer-split--sticky rec-panel"
      focusKey={`history:${itemKey}`}
      initialFocusRef={heading}
      onClose={onClose}
    >
      <div className="rec-panel__body">
        <button type="button" className="rec-panel__back" onClick={onClose}>{t('records.back')}</button>
        <h2 className="rec-panel__title" ref={heading} tabIndex={-1}>{itemName}</h2>
        <p className="rec-panel__scope">{[rangeText, streamText].join(' · ')}</p>
        {nameOnly && <p className="rec-panel__note">{t('records.history.nameOnly')}</p>}
        {incomplete.length > 0 && (
          <p className="rec-panel__note rec-panel__note--warn" role="status">
            {t('records.history.incomplete', { sources: incomplete.map(source => t(SOURCE_LABEL[source])).join(', ') })}
          </p>
        )}
        {readings.length > 0 && (
          <section aria-labelledby="rec-history-days">
            <h3 id="rec-history-days" className="rec-panel__section">{t('records.history.days')}</h3>
            <div className="rec-mini-wrap" role="region" aria-label={t('records.history.days')} tabIndex={0}>
              <table className="rec-mini">
                <thead>
                  <tr>
                    <th scope="col">{t('records.col.date')}</th>
                    {DAY_ORDER.map(column => <th scope="col" key={column} className="rec-mini__num">{heads[column]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {readings.map((row: DayRow) => (
                    <tr key={row.id}>
                      <td className="rec-mini__date">{dateText(row.date)}<span className="rec-meta-line">{unitText(t, row.unit)}</span></td>
                      {DAY_ORDER.map(column => {
                        const cell = row.cells[column]
                        return <td key={column} className="rec-mini__num">{cell.value === null ? '—' : quantityText(cell.value)}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <section aria-labelledby="rec-history-entries">
          <h3 id="rec-history-entries" className="rec-panel__section">{t('records.history.entries')}</h3>
          {chronological.length === 0 ? <p className="rec-panel__note">{t('records.history.none')}</p> : (
            <ul className="rec-history-list">
              {chronological.map(entry => (
                <li key={entry.key}>
                  <button type="button" className="rec-history-row" onClick={() => onOpenEntry(entry.key)}>
                    <span className="rec-history-row__main">
                      <span className="rec-history-row__title">{t(MOVEMENT_LABEL[entry.movement])} · {dateText(entry.date)}</span>
                      <span className="rec-card__meta">{text.stream(entry.streamKey)}</span>
                    </span>
                    <EntryStatus t={t} entry={entry} />
                    <Quantity t={t} qty={entry.entered?.quantity ?? entry.qty} unit={entry.unit} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </RecordPanelHost>
  )
}

export function EntryPanel({ text, entry, reviewer, canCapture, onClose, onOpenHistory }: Omit<PanelBase, 'rangeText' | 'streamText' | 'onOpenEntry'> & {
  /** The viewer may use the capture pages (Receive, Request); otherwise those links are not offered. */
  canCapture: boolean
  entry: RecordEntry | null
  onOpenHistory: (itemKey: string) => void
}) {
  const { t } = text
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [entry?.key])
  if (!entry) {
    return (
      <RecordPanelHost label={t('records.entry.title')} title={t('records.entry.title')} closeLabel={t('record.close')} rootClassName="drawer-split--sticky rec-panel" focusKey="entry:none" onClose={onClose}>
        <div className="rec-panel__body">
          <button type="button" className="rec-panel__back" onClick={onClose}>{t('records.back')}</button>
          <p className="rec-panel__note">{t('records.entry.notFound')}</p>
        </div>
      </RecordPanelHost>
    )
  }
  const posting = postingBadge(t, entry)
  const raw = entry.raw
  const when = (value: string | null) => (value ? formatWibDateTime(value) : '—')
  const personOf = (id: string | null) => id ? (text.personById(id)) : t('records.who.unavailable')
  const enteredText = entry.entered ? `${quantityText(entry.entered.quantity)} ${entry.entered.unitName ?? ''}`.trim() : null
  // Existing pages only, and only where this viewer is admitted: Records never becomes a way to act.
  const reviewLink = raw.source === 'receipt'
    ? reviewer ? { to: '/cafe/review?queue=receipts', label: t('records.link.receiptReview') } : canCapture ? { to: '/cafe/receive', label: t('records.link.receive') } : null
    : raw.source === 'request'
      ? reviewer ? { to: '/cafe/review?queue=requests', label: t('records.link.requestReview') } : canCapture ? { to: '/cafe/request', label: t('records.link.request') } : null
      : reviewer ? { to: '/cafe/review', label: t('records.link.review') } : null
  return (
    <RecordPanelHost
      label={t('records.entry.title')}
      title={t('records.entry.title')}
      closeLabel={t('record.close')}
      rootClassName="drawer-split--sticky rec-panel"
      focusKey={`entry:${entry.key}`}
      initialFocusRef={heading}
      onClose={onClose}
    >
      <div className="rec-panel__body">
        <button type="button" className="rec-panel__back" onClick={onClose}>{t('records.back')}</button>
        <h2 className="rec-panel__title" ref={heading} tabIndex={-1}>{entry.itemName || '—'}</h2>
        <p className="rec-panel__badges"><EntryStatus t={t} entry={entry} /></p>
        <dl className="rec-fields">
          <Field label={t('records.col.movement')}>{t(MOVEMENT_LABEL[entry.movement])}</Field>
          <Field label={t('records.col.date')}>{dateText(entry.date)}</Field>
          <Field label={t('records.col.stream')}>{text.stream(entry.streamKey)}</Field>
          {entry.destinationBranchId && <Field label={t('records.col.destination')}>{text.destination(entry.streamKey, entry.destinationBranchId)}</Field>}
          <Field label={t('records.col.amount')}><Quantity t={t} qty={entry.qty} unit={entry.unit} /></Field>
          {enteredText && <Field label={t('records.field.enteredAs')}>{enteredText}</Field>}
          <LocationRecordFields keys={RECORD_LOCATION_KEYS[entry.movement]} />
          {/* HANDOVER: R/handover/records-gaps.md §5. Count submitter identity — shown as not available until a stored submitter exists. */}
          <Field label={t('records.col.by')}>{raw.source === 'count' ? t('records.who.notAvailable') : text.person(entry)}</Field>
          {raw.source === 'log' && <>
            <Field label={t('records.field.recorded')}>{when(raw.log.created_at)}</Field>
            {raw.log.notes && <Field label={t('records.field.notes')}>{raw.log.notes}</Field>}
            {raw.log.reviewed_at && <Field label={t('records.field.reviewedBy')}>{personOf(raw.log.reviewed_by)} · {when(raw.log.reviewed_at)}</Field>}
            {raw.log.review_note && <Field label={t('records.field.reviewNote')}>{raw.log.review_note}</Field>}
            <Field label={t('records.field.posting')}>
              {raw.log.posted_to_esb
                ? <>{t('records.posting.sent')}{raw.log.posted_at ? ` · ${when(raw.log.posted_at)}` : ''}{raw.log.esb_doc_num ? ` · ${raw.log.esb_doc_num}` : ''}</>
                : t('records.posting.notMarked')}
            </Field>
          </>}
          {raw.source === 'count' && <>
            <Field label={t('records.field.recorded')}>{when(raw.count.submitted_at)}</Field>
            {raw.count.reviewed_at && <Field label={t('records.field.reviewedAt')}>{when(raw.count.reviewed_at)}</Field>}
            <Field label={t('records.field.posting')}>{posting ? posting.label : t('records.posting.noneRecorded')}</Field>
          </>}
          {raw.source === 'receipt' && <>
            <Field label={t('records.field.recorded')}>{when(raw.receipt.received_at)}</Field>
            {raw.receipt.delivery_note_number && <Field label={t('records.field.deliveryNote')}>{raw.receipt.delivery_note_number}</Field>}
            {raw.line.conditions.length > 0 && <Field label={t('records.field.condition')}>{t('records.field.damagedWrong')}{raw.line.condition_reason ? ` — ${raw.line.condition_reason}` : ''}</Field>}
            {raw.receipt.reviewed_at && <Field label={t('records.field.reviewedBy')}>{personOf(raw.receipt.reviewed_by)} · {when(raw.receipt.reviewed_at)}</Field>}
            {raw.receipt.review_note && <Field label={t('records.field.reviewNote')}>{raw.receipt.review_note}</Field>}
            {raw.receipt.posting_status === 'held' && raw.receipt.posting_hold_reason && <Field label={t('records.field.holdReason')}>{raw.receipt.posting_hold_reason}</Field>}
            <Field label={t('records.field.posting')}>{posting ? posting.label : t('records.posting.noneRecorded')}</Field>
            {/* HANDOVER: R/handover/records-gaps.md §3. Supplier history — no supplier field on a receipt yet. */}
            <Field label={t('records.field.receivedNote')}>{t('records.field.receivedNoteBody')}</Field>
          </>}
          {raw.source === 'request' && <>
            <Field label={t('records.field.recorded')}>{when(raw.request.requested_at)}</Field>
            <Field label={t('records.field.neededBy')}>{dateText(raw.request.required_by)}</Field>
            {raw.request.note && <Field label={t('records.field.notes')}>{raw.request.note}</Field>}
            {raw.request.reviewed_at && <Field label={t('records.field.reviewedBy')}>{personOf(raw.request.reviewed_by)} · {when(raw.request.reviewed_at)}</Field>}
            {raw.request.review_note && <Field label={t('records.field.reviewNote')}>{raw.request.review_note}</Field>}
            {/* HANDOVER: R/handover/records-gaps.md §4. Request → PO fulfilment — no ordered/received linkage shown for a request. */}
          </>}
          {/* HANDOVER: R/handover/records-gaps.md §6. Correction trail — no predecessor/successor or correction actor/reason is shown here. */}
        </dl>
        <div className="rec-panel__links">
          {!entry.itemKey.startsWith('request-name:') && !entry.itemKey.startsWith('receipt-unit:') && (
            <button type="button" className="btn btn-outline btn-touch" onClick={() => onOpenHistory(entry.itemKey)}>{t('records.entry.seeHistory')}</button>
          )}
          {reviewLink && <Link className="btn btn-outline btn-touch" to={reviewLink.to}>{reviewLink.label}</Link>}
        </div>
      </div>
    </RecordPanelHost>
  )
}

