import { useId } from 'react'
import { useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import { useT } from '@/i18n/use-t'

// Deputy spark icon — 16px, stroke-2, aria-hidden. Kept local so a record affordance never couples
// to the top-bar module; visually identical to the launcher's DeputyIcon (No-FAB Rule parity).
function DeputySparkIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export interface AskDeputyActionProps {
  /** The composer seed — a compact record reference (e.g. "About Task: Replace grinder burrs"). */
  draft: string
  /**
   * Placement: `chrome` is the icon-only ✦ button used in the record-page Back row (and on phone
   * for the record's Deputy door). `footer` is the labelled row that sits below the record body on
   * desktop — the labelled control the Deputy door on a record IS now (#758, DESIGN.md § Overlays →
   * Record panel A8). Defaults to `chrome` so the phone Back row and every legacy caller keep
   * their current icon-only shape.
   */
  variant?: 'chrome' | 'footer'
  /**
   * Visible label (footer variant) AND accessible name (both variants). "Ask Deputy about this
   * Task" for a Task record; falls back to the generic "Ask Deputy" when omitted, which matches
   * the pre-labelled behaviour of the legacy chrome icon.
   */
  label?: string
  /**
   * Footer helper text — the second half of the footer's "<label> — <helper>" row. Defaults to
   * the shared "Deputy will use this record as context" copy. Ignored by the chrome variant.
   */
  helper?: string
}

/**
 * The record-scoped "Ask Deputy" door. Clicking opens the existing Deputy panel with the composer
 * pre-seeded with `draft` — the user still edits and sends; it never auto-sends. The record stays
 * mounted while Deputy opens beside it (OD-REDESIGN-80 coexistence; see deputy-overlay-coexistence).
 *
 * Two placements share one behaviour:
 * - `chrome` — a 32/44px icon-only ✦ button. Used by the record-page Back row (also the phone
 *   record's door), so a coarse-pointer / phone viewport still meets the 44px touch floor.
 * - `footer` — the labelled row that lives at the bottom of the record surface on desktop: the
 *   ✦ + "Ask Deputy about this <Type>" + a muted helper "Deputy will use this record as context".
 *
 * Renders nothing when no runtime is available (SHOW_ASSISTANT=false → null runtime), so it never
 * offers an affordance that would open an inert panel.
 */
export function AskDeputyAction({ draft, variant = 'chrome', label, helper }: AskDeputyActionProps) {
  const { runtime, openPanel } = useAgentRuntime()
  const t = useT()
  const helperReactId = useId()
  if (!runtime) return null
  const accessibleName = label ?? t('assistant.askAboutRecord')

  if (variant === 'footer') {
    const helperText = helper ?? t('assistant.askDeputy.helper')
    const helperId = `ask-deputy-helper-${helperReactId}`
    return (
      <div className="record-ask-deputy-foot" data-testid="record-ask-deputy-foot">
        <button
          type="button"
          className="record-ask-deputy-foot__btn"
          aria-describedby={helperId}
          onClick={() => openPanel(draft)}
        >
          <DeputySparkIcon />
          <span className="record-ask-deputy-foot__label">{accessibleName}</span>
        </button>
        <span id={helperId} className="record-ask-deputy-foot__helper">{helperText}</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      className="record-panel-btn"
      aria-label={accessibleName}
      title={accessibleName}
      onClick={() => openPanel(draft)}
    >
      <DeputySparkIcon />
    </button>
  )
}
