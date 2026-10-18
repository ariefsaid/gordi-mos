// The scope of a Records view, in the spec's order: Question → Period → Production stream, then the exact
// days (and the custom range form). All three are the shared Select; no job tabs.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { DateField } from '@/components/ui/date-field'
import { Select } from '@/components/ui/select'
import type { MessageKey } from '@/i18n/messages'
import type { Translate } from '@/i18n/use-t'
import { PRESET_PERIOD_KEYS, isUnfinished, rangeError, type PeriodKey } from '@/lib/cafe-records/period'
import { QUESTIONS, type Question } from '@/lib/cafe-records/url-state'
import { formatDayMonthYear } from '@/lib/format/date'
import { QUESTION_LABEL } from './records-labels'

const PERIOD_LABEL: Record<PeriodKey, MessageKey> = {
  today: 'records.period.today',
  'this-week': 'records.period.thisWeek',
  'last-week': 'records.period.lastWeek',
  'this-month': 'records.period.thisMonth',
  'last-month': 'records.period.lastMonth',
  custom: 'records.period.custom',
}

export interface StreamChoice { value: string; label: string }

export function RecordsScope({ t, question, onQuestion, period, onPeriod, from, to, today, streamValue, streams, onStream, draftFrom, draftTo, onDraft, onApply, periodRef, trailing, open, onOpenChange }: {
  t: Translate
  question: Question
  onQuestion: (question: Question) => void
  period: PeriodKey
  onPeriod: (period: PeriodKey) => void
  from: string
  to: string
  today: string
  streamValue: string
  streams: readonly StreamChoice[]
  onStream: (value: string) => void
  draftFrom: string
  draftTo: string
  /** One date changed (a complete, real day): the other keeps whatever the URL holds. */
  onDraft: (field: 'from' | 'to', value: string) => void
  onApply: (from: string, to: string) => void
  periodRef?: React.Ref<HTMLButtonElement>
  /** The collapsed editor follows page-level state so empty results can open directly to Period. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Adjacent action that remains available while the editor is collapsed. */
  trailing?: React.ReactNode
}) {
  const [showError, setShowError] = useState(false)
  const panelId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  // A date field holding text that is not a real day says so itself; Apply must refuse it too.
  const [typedInvalid, setTypedInvalid] = useState({ from: false, to: false })
  // The form's own copy is the truth while typing (the URL copy follows it); an outside change to the URL (Back, a link) replaces it.
  const urlFrom = draftFrom || from
  const urlTo = draftTo || to
  const [local, setLocal] = useState({ from: urlFrom, to: urlTo })
  useEffect(() => { setLocal({ from: urlFrom, to: urlTo }) }, [urlFrom, urlTo])
  const dFrom = local.from
  const dTo = local.to
  const error = period === 'custom' ? (typedInvalid.from || typedInvalid.to ? 'invalid' : rangeError(dFrom, dTo, today)) : null
  useEffect(() => { setShowError(false) }, [dFrom, dTo, period])
  const errorText = error === 'future' ? t('records.range.future') : error === 'order' ? t('records.range.order') : error === 'invalid' ? t('records.range.invalid') : null
  const exact = from === to ? formatDayMonthYear(from) : t('records.range.exact', { from: formatDayMonthYear(from), to: formatDayMonthYear(to) })
  const streamName = streams.find(choice => choice.value === streamValue)?.label ?? t('records.stream.all')
  const onEditorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    event.stopPropagation()
    onOpenChange(false)
    triggerRef.current?.focus()
  }
  return (
    <section className="rec-scope" aria-label={t('records.scope.label')}>
      <div className="rec-scope__summary">
        <div className="rec-scope__summary-copy">
          <div className="rec-scope__summary-question"><span>{t(QUESTION_LABEL[question])}</span><span aria-hidden="true">·</span><span>{t(PERIOD_LABEL[period])}</span></div>
          <div className="rec-scope__summary-context"><span>{streamName}</span><span aria-hidden="true">·</span><span className="tabular">{exact}</span>{isUnfinished(period, { from, to }, today) && <span className="rec-range-line__through">{t('records.range.throughToday')}</span>}</div>
        </div>
        <Button ref={triggerRef} type="button" variant="outline" className="rec-scope__toggle" aria-expanded={open} aria-controls={panelId} onClick={() => onOpenChange(!open)}>
          {t('records.scope.change')}
        </Button>
        {trailing ? <div className="rec-scope__summary-trailing">{trailing}</div> : null}
      </div>
      <div id={panelId} className="rec-scope__editor" hidden={!open} onKeyDown={onEditorKeyDown}>
        {open ? <>
          <div className="rec-scope__row">
            <Select label={t('records.question.label')} value={question} fullWidth onChange={event => onQuestion(event.target.value as Question)} className="rec-scope__question">
              {QUESTIONS.map(value => <option key={value} value={value}>{t(QUESTION_LABEL[value])}</option>)}
            </Select>
            <Select label={t('records.period.label')} value={period} fullWidth ref={periodRef} onChange={event => onPeriod(event.target.value as PeriodKey)} className="rec-scope__period">
              {[...PRESET_PERIOD_KEYS, 'custom' as const].map(value => <option key={value} value={value}>{t(PERIOD_LABEL[value])}</option>)}
            </Select>
            <Select label={t('records.stream.label')} value={streamValue} fullWidth onChange={event => onStream(event.target.value)} className="rec-scope__stream">
              {streams.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
            </Select>
          </div>
          {period === 'custom' && (
            <form className="rec-range" noValidate onSubmit={event => { event.preventDefault(); if (error) { setShowError(true); return } onApply(dFrom, dTo) }}>
              <DateField label={t('records.range.from')} value={dFrom} max={today} fullWidth onChange={value => { if (value) { setLocal(current => ({ ...current, from: value })); onDraft('from', value) } }} onValidityChange={invalid => setTypedInvalid(current => (current.from === invalid ? current : { ...current, from: invalid }))} />
              <DateField label={t('records.range.to')} value={dTo} max={today} fullWidth onChange={value => { if (value) { setLocal(current => ({ ...current, to: value })); onDraft('to', value) } }} onValidityChange={invalid => setTypedInvalid(current => (current.to === invalid ? current : { ...current, to: invalid }))} />
              <Button type="submit" variant="primary" className="rec-range__apply">{t('records.range.apply')}</Button>
              {showError && errorText && <p className="rec-range__error" role="alert">{errorText}</p>}
            </form>
          )}
        </> : null}
      </div>
    </section>
  )
}
