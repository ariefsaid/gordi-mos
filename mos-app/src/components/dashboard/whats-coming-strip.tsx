// WhatsComingStrip — the single honest strip of not-yet-backed KPIs (design-plan §2.11,
// FR-010/AC-010). Renders Opex · Material usage/waste · Labor cost % · Roastery yield as
// "Needs warehouse data" stubs. NEVER a faked number. Each stub = a dashed placeholder
// glyph + label + "Needs warehouse data" value + a muted note (the upstream feed).
import './whats-coming-strip.css'

const STUBS: Array<{ label: string; note: string }> = [
  { label: 'Opex', note: 'GL feed pending · slice 2' },
  { label: 'Material usage / waste', note: 'Portion + variance' },
  { label: 'Labor cost %', note: 'Payroll feed pending' },
  { label: 'Roastery yield / cost per kg', note: 'Production-log feed' },
]

export function WhatsComingStrip() {
  return (
    <section className="whats-coming" aria-label="What's coming — needs warehouse data">
      <span className="whats-coming-label">What&apos;s coming</span>
      <div className="whats-coming-grid">
        {STUBS.map(stub => (
          <div key={stub.label} className="whats-coming-stub">
            <span className="whats-coming-stub-head">
              <span className="whats-coming-ph" aria-hidden="true" />
              <span className="whats-coming-stub-name">{stub.label}</span>
            </span>
            <span className="whats-coming-stub-val">Needs warehouse data</span>
            <span className="whats-coming-stub-note">{stub.note}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
