/**
 * AssistantFab — the phone-only floating action button that opens the deputy slide-over (T28).
 *
 * Placement (ADR-0019 D11): `fixed bottom: calc(var(--tabbar-h) + 1rem); right: 1rem; z-index: 45`
 * — sits above the bottom tab bar so it never collides with the primary phone nav. Shown ONLY when
 * narrow AND SHOW_ASSISTANT; the desktop affordance is the top-bar button (top-bar.tsx).
 *
 * AC-AP-001 (FAB opens the slide-over), AC-AP-005/AC-CF-003 (absent when the flag is off).
 */

import { useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import { SHOW_ASSISTANT } from '@/config/features'
import { useIsNarrow } from '@/shell/use-is-narrow'
import { useT } from '@/i18n/use-t'

export function AssistantFab() {
  const isNarrow = useIsNarrow()
  const t = useT()
  const { openPanel } = useAgentRuntime()

  if (!SHOW_ASSISTANT || !isNarrow) return null

  return (
    <button
      type="button"
      aria-label={t('assistant.open')}
      onClick={openPanel}
      className="fixed flex items-center justify-center rounded-full bg-brand-orange text-primary-foreground"
      style={{
        // Above the bottom tab bar (ADR-0019 D11) — 1rem clear of --tabbar-h.
        bottom: 'calc(var(--tabbar-h) + 1rem)',
        right: '1rem',
        width: 52,
        height: 52,
        zIndex: 45,
        boxShadow: 'var(--shadow-strong)',
      }}
    >
      <SparkIcon />
    </button>
  )
}

function SparkIcon() {
  // A deputy "spark" mark — distinct from the search/bell glyphs; aria-hidden (label on button).
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <path d="M5.6 5.6l2.1 2.1" />
      <path d="M16.3 16.3l2.1 2.1" />
      <path d="M18.4 5.6l-2.1 2.1" />
      <path d="M7.7 16.3l-2.1 2.1" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
