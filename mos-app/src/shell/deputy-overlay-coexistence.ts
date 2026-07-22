/**
 * useDeputyOverlayCoexistence — Lane B2 mutual-exclusion guard between Deputy (the assistant
 * companion) and any shell-owner overlay (Inbox quick-triage, future shell overlays).
 *
 * WHY: both consume the shell's right-edge surface track. Showing two peers there violates the
 * owner IA/IxD law "one overlay grammar"
 * (OD-REDESIGN). A collection-owner record overlay (Tasks/Signals/Inbox page records) sits inside
 * the page `.record-split` grid, so it may coexist; AssistantPanel reads that same session and
 * contracts into the record-safe compact desktop regime (OD-REDESIGN-80). Only shell-owner
 * overlays collide and therefore remain mutually exclusive here.
 *
 * INVARIANT: at most one of {shell-owner overlay, Deputy} is open at once. The NEWEST intent
 * wins — the one that just transitioned to open stays, the already-open one yields:
 *   - Overlay just opened while Deputy was up → close Deputy (Deputy has no dirty state — safe).
 *   - Deputy just opened while a shell overlay was up → close the shell overlay (through any
 *     leaveGuard; Deputy wins as the newer intent).
 * "Both closed" is a stable state; closing one does NOT auto-open the other.
 *
 * Mount ONCE inside both providers (AppShell composes AgentRuntimeProvider ⊃ OverlayHostProvider,
 * so a child of the inner provider sees both). Safe when SHOW_ASSISTANT=false: the agent runtime's
 * default context returns `open=false` and no-op setters, so the shell-overlay side of the rule
 * still fires correctly and the deputy side is inert.
 */
import { useEffect, useRef } from 'react'
import { useOptionalOverlayHost } from './overlay-host'
import { useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'

export function useDeputyOverlayCoexistence(): void {
  const overlay = useOptionalOverlayHost()
  const deputy = useAgentRuntime()

  const overlaySession = overlay?.session ?? null
  const deputyOpen = deputy.open

  const shellOverlayActive =
    !!overlaySession && overlaySession.frames.at(-1)?.entry.owner === 'shell'

  // Previous-render snapshot of both flags so this render can detect WHICH one just turned true.
  const prevShellOverlay = useRef(false)
  const prevDeputyOpen = useRef(false)

  // Refs to the live controllers so the effect closure calls the freshest setters without
  // re-subscribing (and without listing them as deps, which would re-fire on every render).
  const overlayRef = useRef(overlay)
  const deputyRef = useRef(deputy)
  overlayRef.current = overlay
  deputyRef.current = deputy

  const shellJustOpened = shellOverlayActive && !prevShellOverlay.current
  const deputyJustOpened = deputyOpen && !prevDeputyOpen.current

  // Single effect, single reconciliation pass per render: decide which side yields based on
  // which flag just transitioned. Using one effect (not two) avoids double-fire ordering hazards
  // when both flags change in the same commit.
  useEffect(() => {
    if (!shellOverlayActive || !deputyOpen) {
      prevShellOverlay.current = shellOverlayActive
      prevDeputyOpen.current = deputyOpen
      return
    }
    // Both are open — a conflict. The one that JUST opened wins.
    if (shellJustOpened && !deputyJustOpened) {
      // Shell overlay is the newer intent → Deputy yields.
      deputyRef.current.closePanel()
    } else if (deputyJustOpened && !shellJustOpened) {
      // Deputy is the newer intent → shell overlay yields (through its leaveGuard, if any).
      void overlayRef.current?.close('explicit-close')
    } else if (shellJustOpened && deputyJustOpened) {
      // Simultaneous open (rare — e.g. a programmatic double-dispatch). Favor the overlay
      // (records are the user's primary task surface; Deputy is ambient).
      deputyRef.current.closePanel()
    }
    prevShellOverlay.current = shellOverlayActive
    prevDeputyOpen.current = deputyOpen
  }, [shellOverlayActive, deputyOpen, shellJustOpened, deputyJustOpened])
}
