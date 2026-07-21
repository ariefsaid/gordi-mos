// Lane B2 — Deputy ↔ shell-owner overlay mutual-exclusion (owner IA/IxD law: "one overlay grammar").
//
// WHY: Deputy (AssistantPanel) and a shell-owner overlay (Inbox quick-triage, future shell
// overlays) both float at `right: 0`, full-height, z-drawer — the SAME physical track. Two
// drawers in the same track is a grammar violation (OD-REDESIGN "one overlay grammar"). A
// collection-owner overlay (Tasks/Signals records) sits inside the page .record-split grid, so
// it does NOT float over the shell and coexists with Deputy normally — only shell-owner
// overlays conflict.
//
// INVARIANT: at most one of {shell-owner overlay, Deputy} is open at once. The newer intent
// wins: opening a shell-owner overlay closes Deputy; opening Deputy closes any open shell-owner
// overlay (through its leaveGuard). Deputy yields unconditionally (no dirty state by design).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  OverlayHostProvider,
  useOverlayHost,
} from './overlay-host'
import { AgentRuntimeProvider, useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import { useDeputyOverlayCoexistence } from './deputy-overlay-coexistence'

/** A child that exposes both controllers so the test can drive them directly. */
function CoordinatorProbe({ onReady }: { onReady: (api: {
  overlay: ReturnType<typeof useOverlayHost>
  deputy: ReturnType<typeof useAgentRuntime>
}) => void }) {
  const overlay = useOverlayHost()
  const deputy = useAgentRuntime()
  useDeputyOverlayCoexistence()
  // Hand the controllers out on first render so the test can call them imperatively.
  if (onReady) onReady({ overlay, deputy })
  return null
}

function Harness({ onOverlayReady, onDeputyReady }: {
  onOverlayReady?: (api: ReturnType<typeof useOverlayHost>) => void
  onDeputyReady?: (api: ReturnType<typeof useAgentRuntime>) => void
}) {
  return (
    // MemoryRouter: OverlayHostProvider is router-coupled since the route seam
    // (useNavigate/useLocation for URL markers) — harness shape only, goals unchanged.
    <MemoryRouter>
      <AgentRuntimeProvider runtime={null}>
        <OverlayHostProvider>
          <CoordinatorProbe
            onReady={({ overlay, deputy }) => {
              onOverlayReady?.(overlay)
              onDeputyReady?.(deputy)
            }}
          />
        </OverlayHostProvider>
      </AgentRuntimeProvider>
    </MemoryRouter>
  )
}

describe('Lane B2 — useDeputyOverlayCoexistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('opening a shell-owner overlay closes an already-open Deputy', async () => {
    let overlay!: ReturnType<typeof useOverlayHost>
    let deputy!: ReturnType<typeof useAgentRuntime>
    render(
      <Harness
        onOverlayReady={(a) => { overlay = a }}
        onDeputyReady={(a) => { deputy = a }}
      />,
    )

    // Open Deputy first.
    act(() => { deputy.openPanel() })
    expect(deputy.open).toBe(true)

    // Now open a shell-owner overlay (the Inbox quick-triage path).
    await act(async () => {
      await overlay.openRoot({
        key: 'inbox-quick', owner: 'shell', tenant: 'quick', label: 'Inbox', content: null,
      }, 'ephemeral')
    })

    // Coordinator should have closed Deputy.
    expect(deputy.open).toBe(false)
    expect(overlay.session?.frames.at(-1)?.entry.owner).toBe('shell')
  })

  it('opening Deputy closes an already-open shell-owner overlay', async () => {
    let overlay!: ReturnType<typeof useOverlayHost>
    let deputy!: ReturnType<typeof useAgentRuntime>
    render(
      <Harness
        onOverlayReady={(a) => { overlay = a }}
        onDeputyReady={(a) => { deputy = a }}
      />,
    )

    // Open a shell-owner overlay first.
    await act(async () => {
      await overlay.openRoot({
        key: 'inbox-quick', owner: 'shell', tenant: 'quick', label: 'Inbox', content: null,
      }, 'ephemeral')
    })
    expect(overlay.session).not.toBeNull()

    // Now open Deputy.
    act(() => { deputy.openPanel() })

    // Coordinator should have closed the shell-owner overlay.
    await act(async () => { await vi.runAllTimersAsync() })
    expect(overlay.session).toBeNull()
    expect(deputy.open).toBe(true)
  })

  it('a collection-owner overlay (Tasks) coexists with Deputy — neither closes the other', async () => {
    let overlay!: ReturnType<typeof useOverlayHost>
    let deputy!: ReturnType<typeof useAgentRuntime>
    render(
      <Harness
        onOverlayReady={(a) => { overlay = a }}
        onDeputyReady={(a) => { deputy = a }}
      />,
    )

    // Open Deputy first.
    act(() => { deputy.openPanel() })
    expect(deputy.open).toBe(true)

    // Open a TASKS-owner overlay (a record drawer that lives in the page grid, not floating).
    await act(async () => {
      await overlay.openRoot({
        key: 'task-1', owner: 'tasks', tenant: 'record', label: 'Task', content: null,
      }, 'route')
    })

    // Both stay open — collection overlays don't share Deputy's floating track.
    expect(deputy.open).toBe(true)
    expect(overlay.session?.frames.at(-1)?.entry.owner).toBe('tasks')
  })

  it('closing the shell-owner overlay does NOT auto-open Deputy', async () => {
    // Symmetry guard: closing the overlay restores "nothing open", not "Deputy snaps back".
    let overlay!: ReturnType<typeof useOverlayHost>
    let deputy!: ReturnType<typeof useAgentRuntime>
    render(
      <Harness
        onOverlayReady={(a) => { overlay = a }}
        onDeputyReady={(a) => { deputy = a }}
      />,
    )

    await act(async () => {
      await overlay.openRoot({
        key: 'inbox-quick', owner: 'shell', tenant: 'quick', label: 'Inbox', content: null,
      }, 'ephemeral')
    })
    expect(overlay.session).not.toBeNull()
    expect(deputy.open).toBe(false)

    await act(async () => { await overlay.close('explicit-close') })
    expect(overlay.session).toBeNull()
    // Deputy must NOT spontaneously open.
    expect(deputy.open).toBe(false)
  })
})
