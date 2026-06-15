// ── Confirm-archive dialog ───────────────────────────────────────────────────
export type ConfirmArchiveProps = {
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmArchive({ onConfirm, onCancel }: ConfirmArchiveProps) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Archive confirmation" className="confirm-overlay">
      <div className="confirm-box">
        <p className="confirm-msg">Archive this task? It leaves the default list but isn&apos;t deleted.</p>
        <div className="confirm-actions">
          <button type="button" className="btn-outline confirm-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-archive" onClick={onConfirm} aria-label="Archive">Archive</button>
        </div>
      </div>
    </div>
  )
}
