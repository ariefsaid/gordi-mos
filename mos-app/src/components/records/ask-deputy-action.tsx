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
}

/**
 * A quiet, record-scoped "Ask Deputy" affordance for the RecordPanelHost actions seam (the same
 * chrome slot the Close (Esc) button uses). Clicking opens the existing Deputy slide-over with the
 * composer pre-seeded with `draft` — the user still edits and sends; it never auto-sends.
 *
 * Renders nothing when no runtime is available (SHOW_ASSISTANT=false → null runtime), so it never
 * offers an affordance that would open an inert panel.
 */
export function AskDeputyAction({ draft }: AskDeputyActionProps) {
  const { runtime, openPanel } = useAgentRuntime()
  const t = useT()
  if (!runtime) return null
  return (
    <button
      type="button"
      className="record-panel-btn"
      aria-label={t('assistant.askAboutRecord')}
      title={t('assistant.askAboutRecord')}
      onClick={() => openPanel(draft)}
    >
      <DeputySparkIcon />
    </button>
  )
}
