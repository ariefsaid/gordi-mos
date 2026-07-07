// BasisChip — the neutral basis-qualifier badge (design-plan §2.9, FR-008/AC-008).
// Every gross-margin/COGS figure carries one so "interim — stock-movement" is never
// confused for GL-certified (CONTEXT.md "COGS"/"Gross margin"). This is the
// `--basis-chip` semantic role = secondary bg + muted-foreground text (no dot — it
// is a qualifier, not a status, distinguishing it from DQBadge).
import './basis-chip.css'

export interface BasisChipProps {
  label: string
}

export function BasisChip({ label }: BasisChipProps) {
  return <span className="basis-chip">{label}</span>
}
