import type { ReactNode } from 'react'
import { DateField } from '@/components/ui/date-field'
import { useT } from '@/i18n/use-t'
import { useIsDesktop } from '@/shell/use-is-desktop'
import type { MessageKey } from '@/i18n/messages'

export type RequestBriefLine = { id: string; name: string; quantity: string; unit: string }

export function CafeRequestBrief({
  requiredBy, min, max, disabled, onValidityChange, onRequiredByChange, note, onNoteChange, lines, invalidItems, dateProblem,
}: {
  requiredBy: string
  min: string
  max: string
  disabled: boolean
  onValidityChange: (invalid: boolean) => void
  onRequiredByChange: (value: string) => void
  note: string
  onNoteChange: (value: string) => void
  lines: readonly RequestBriefLine[]
  invalidItems: ReactNode
  dateProblem: MessageKey | null
}) {
  const t = useT()
  const desktop = useIsDesktop()
  return (
    <section className="cafe-request-brief" aria-labelledby="cafe-request-brief-title">
      <h2 id="cafe-request-brief-title">{t('cafe.request.brief.title')}</h2>
      <div className="cafe-request-brief__date">
        <DateField id="cafe-request-required-by" label={t('cafe.request.requiredBy')} value={requiredBy}
          min={min} max={max} fullWidth required disabled={disabled} onValidityChange={onValidityChange} onChange={onRequiredByChange} />
        {dateProblem && <p className="cafe-request-brief__error" role="status">{t(dateProblem)}</p>}
      </div>
      <details className="cafe-request-brief__contents" open={desktop}>
        <summary>{t('cafe.request.brief.enteredCount', { count: lines.length })}</summary>
        <div className="cafe-request-brief__contents-body">
          <div className="cafe-request-brief__lines">
            <h3>{t('cafe.request.brief.entered')}</h3>
            {lines.length ? <ul>{lines.map(line => <li key={line.id}><span>{line.name}</span><span className="tabular">{t('cafe.receipts.quantityUnit', { quantity: line.quantity, unit: line.unit })}</span></li>)}</ul>
              : <p>{t('cafe.request.brief.empty')}</p>}
            {invalidItems}
          </div>
          <details className="cafe-request-brief__note" open={note !== ''}>
            <summary>{t('cafe.request.noteDisclosure')}</summary>
            <label htmlFor="cafe-request-note">{t('cafe.request.note')}</label>
            <textarea id="cafe-request-note" rows={2} maxLength={500} value={note} disabled={disabled} onChange={event => onNoteChange(event.target.value)} />
          </details>
        </div>
      </details>
    </section>
  )
}
