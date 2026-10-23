// RecordProperties — the compact label: value block under a record's title (Task now, Meeting next).
// Each row is a label and the existing record field (value edited in place) or any value node.
//
// Props
//   rows         { key, label, children, tone?, note? }[]   `children` is the value (usually a <RecordField/>);
//                `tone` 'overdue' paints it red, 'soon' amber; `note` is a quiet line under the value.
//   summary      ReactNode   what the folded block shows on one line
//   foldable     boolean = true   false keeps the block open with no Hide control (a draft whose rows must stay reachable)
// "Hide properties" folds the block to `summary`; the choice is remembered per user in localStorage.
import { useId, useState, type ReactNode } from 'react'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import './record-properties.css'

export type RecordPropertyRow = {
  key: string
  label: string
  children: ReactNode
  tone?: 'overdue' | 'soon'
  note?: ReactNode
}

export type RecordPropertiesProps = {
  rows: readonly RecordPropertyRow[]
  summary?: ReactNode
  foldable?: boolean
}

const STORAGE_KEY = 'mos-record-properties-collapsed'

function readFolded(key: string): boolean {
  try { return localStorage.getItem(key) === '1' } catch { return false }
}

export function RecordProperties({ rows, summary, foldable = true }: RecordPropertiesProps) {
  const t = useT()
  const auth = useAuth()
  const storageKey = `${STORAGE_KEY}:${auth.status === 'authenticated' ? auth.viewer.person.id : 'anon'}`
  const [foldedState, setFolded] = useState(() => readFolded(storageKey))
  const folded = foldable && foldedState
  const listId = useId()
  const toggle = () => {
    const next = !folded
    setFolded(next)
    try { localStorage.setItem(storageKey, next ? '1' : '0') } catch { /* private mode: the fold is just not remembered */ }
  }
  return (
    <section className="rp-props" aria-label={t('record.properties.title')} data-folded={folded || undefined}>
      {folded ? (
        <p className="rp-props__summary">{summary}</p>
      ) : (
        <ul id={listId} className="rp-props__list">
          {rows.map((row) => (
            <li key={row.key} className={`rp-props__row${row.tone ? ` rp-props__row--${row.tone}` : ''}`} data-property={row.key}>
              <span className="rp-props__label">{row.label}</span>
              <div className="rp-props__value">
                {row.children}
                {row.note ? <p className="rp-props__note">{row.note}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {foldable ? (
        <button type="button" className="rp-props__toggle" aria-expanded={!folded} aria-controls={folded ? undefined : listId} onClick={toggle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={folded ? undefined : 'rp-props__caret--open'}>
            <path d="m9 6 6 6-6 6" />
          </svg>
          {folded ? `${t('record.properties.show')} · ${rows.length}` : t('record.properties.hide')}
        </button>
      ) : null}
    </section>
  )
}
