import { useT } from '@/i18n/use-t'
import type { HomeRegionOrder } from '@/lib/home-region-order'
import './home-order-toggle.css'

// HomeOrderToggle — the Home region-order preference control (OD-REDESIGN-18). Moved out of
// HomePage's head action slot into Personal Profile (OD-18 completion, 2026-07-27): Home owes
// only the required `Needs attention · N` summary + jump target, not the control itself. This
// stays a radiogroup (RI-1) so the a11y contract carried over unchanged — same markup, same
// classnames, same `is-active`/`aria-checked` wiring, just a new host.
export function HomeOrderToggle({ order, onChange, label }: {
  order: HomeRegionOrder; onChange: (next: HomeRegionOrder) => void; label: string
}) {
  const t = useT()
  const options: { id: HomeRegionOrder; label: string }[] = [
    { id: 'attention-first', label: t('home.order.attentionFirst') },
    { id: 'personal-first', label: t('home.order.personalFirst') },
  ]
  return (
    <div role="radiogroup" aria-label={label} className="home-order-seg">
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          role="radio"
          aria-checked={order === opt.id}
          className={`home-order-seg-opt${order === opt.id ? ' is-active' : ''}`}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
