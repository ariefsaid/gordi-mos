import type { ReactNode } from 'react'
import './cafe-close-review-workspace.css'

export function CafeCloseReviewWorkspace({ master, detail, selected, onBack, backLabel, label }: {
  master: ReactNode
  detail: ReactNode
  selected: boolean
  onBack: () => void
  backLabel: string
  label: string
}) {
  return <section className={`cafe-close-workspace${selected ? ' is-selected' : ''}`} aria-label={label}>
    <div className="cafe-close-workspace__master">{master}</div>
    <div className="cafe-close-workspace__detail">
      {selected && <button type="button" className="btn btn-outline cafe-close-workspace__back" onClick={onBack}>{backLabel}</button>}
      {detail}
    </div>
  </section>
}
