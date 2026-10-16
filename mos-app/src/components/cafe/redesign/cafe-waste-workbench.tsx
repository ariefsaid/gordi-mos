import type { ReactNode } from 'react'
import './cafe-waste-workbench.css'

type WasteWorkbenchEntry = {
  id: string
  name: string
  quantity: string
  unit: string
  capturedDate?: string
  status: string
}

export function CafeWasteWorkbench({
  entries, selectedId, onSelect, editor, title, emptyMessage, onBack, backLabel,
}: {
  entries: WasteWorkbenchEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
  editor: ReactNode
  title: string
  emptyMessage: string
  onBack: () => void
  backLabel: string
}) {
  const selected = entries.find(entry => entry.id === selectedId)
  return <section className="cafe-waste-workbench" aria-label={title}>
    <div className="cafe-waste-workbench__list" aria-label={title}>
      {entries.length === 0 ? <p className="cafe-waste-workbench__empty">{emptyMessage}</p> : entries.map(entry => (
        <button
          key={entry.id}
          type="button"
          className="cafe-waste-workbench__entry"
          aria-pressed={entry.id === selectedId}
          onClick={() => onSelect(entry.id)}
        >
          <span className="cafe-waste-workbench__identity">{entry.name}</span>
          <span className="cafe-waste-workbench__quantity">{entry.quantity} {entry.unit}</span>
          <span className="cafe-waste-workbench__status">{entry.status}</span>
          {entry.capturedDate && <span className="cafe-waste-workbench__date">{entry.capturedDate}</span>}
        </button>
      ))}
    </div>
    <div className="cafe-waste-workbench__editor">
      {selected ? <>
        <button type="button" className="btn btn-outline cafe-waste-workbench__back" onClick={onBack}>{backLabel}</button>
        <h2>{selected.name}</h2>
        <p className="cafe-waste-workbench__locked">{selected.quantity} {selected.unit}{selected.capturedDate ? ` · ${selected.capturedDate}` : ''}</p>
        {editor}
      </> : <p>{emptyMessage}</p>}
    </div>
  </section>
}
