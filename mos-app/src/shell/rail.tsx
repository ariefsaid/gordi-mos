import { RailNav } from './rail-nav'
import { useRailCounts } from './use-rail-counts'
import { useRailCollapsePref } from './use-rail-collapse-pref'
import { Chevron } from './icons'
import { useT } from '@/i18n/use-t'
import './rail-nav.css'

interface RailProps {
  onNavigate?: () => void
  /**
   * OD-REDESIGN-84.2 (P1-1): the 920–1099.98px icon-only regime — app-shell computes this
   * from the existing narrow/split breakpoint family (`!isNarrow && !isSplit`) and passes it
   * down; Rail itself stays width-query-free (one hook owner per breakpoint).
   *
   * #442: the SAME prop now also carries the user's own choice at ≥1100px. `useRailCompact`
   * folds width and preference into this one boolean precisely so there is one compact
   * rendering path, never a second collapsed style.
   */
  compact?: boolean
  /**
   * #442: whether the collapse toggle can change anything — true only at ≥1100px, where the
   * full rail is what a preference-free viewer gets. In the 920–1099.98px band the width regime
   * wins outright, so the control is ABSENT rather than present-and-inert: a toggle that visibly
   * does nothing when pressed is a worse answer than no toggle.
   */
  collapsible?: boolean
}

/**
 * The collapse affordance (#442). An ordinary `<button>` — so Enter and Space operate it and it
 * takes a tab stop — carrying `aria-expanded` for the rail's own nav, which is the state that
 * actually changes. Its glyph is the ONE shared disclosure `Chevron` rotated by CSS (left = "fold
 * this away", right = "bring it back"), not a new icon.
 */
function RailCollapseToggle({ compact }: { compact: boolean }) {
  const t = useT()
  const { toggle } = useRailCollapsePref()
  const label = compact ? t('rail.expand') : t('rail.collapse')
  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={!compact}
      aria-controls="rail-primary-nav"
      aria-label={label}
      title={label}
      // The compact rail has no room for a visible label, so it borrows the same CSS-only
      // `data-label` tooltip the compact nav items use. The full-width rail is a scroll
      // container, which would clip that tooltip (NAV-2), so there it relies on `title`.
      className={['rail-collapse-toggle', compact ? 'rail-tooltip-target' : ''].filter(Boolean).join(' ')}
      data-label={compact ? label : undefined}
      data-rail-collapsed={compact ? 'true' : undefined}
    >
      <Chevron className="rail-collapse-toggle__chevron" size={16} />
    </button>
  )
}

export function Rail({ onNavigate, compact = false, collapsible = false }: RailProps) {
  // The rail's single count-fetch seam (once per mount, no polling). Rail is the desktop-only
  // wrapper (app-shell renders it at ≥920px), so the aggregate is fetched exactly once.
  const counts = useRailCounts()
  return (
    <aside
      className="bg-secondary border-r border-border flex flex-col"
      data-rail-compact={compact ? 'true' : undefined}
      style={{
        width: compact ? 'var(--rail-w-compact)' : 'var(--rail-w)',
        gridArea: 'rail',
        minHeight: 0,
        // NAV-2: the CSS-only compact tooltip (rail-nav.css) escapes the 72px aside to the RIGHT
        // (`left:100%`). A scroll container clips it — and `overflow-y:auto` alone forces
        // `overflow-x` computed to `auto` too (the spec's "visible reverts to auto" rule), so the
        // label never paints in the 920–1099px band. The compact regime is icon-only (short list),
        // so it takes `overflow:visible` to let the tooltip disclose; the full labelled rail (no
        // tooltip, taller content) keeps its own scroll.
        ...(compact
          ? { overflow: 'visible' }
          : { overflowY: 'auto', overscrollBehavior: 'contain' }),
      }}
    >
      {collapsible && (
        <div className={['rail-collapse-row', compact ? 'rail-collapse-row--compact' : ''].filter(Boolean).join(' ')}>
          <RailCollapseToggle compact={compact} />
        </div>
      )}
      <RailNav onNavigate={onNavigate} counts={counts} compact={compact} />
    </aside>
  )
}
