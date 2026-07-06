// T24 — AgentRuntimeProvider (the panel/runtime context seam). Holds the singleton runtime +
// the slide-over open/close state (persisted to localStorage, mirroring the locale-toggle pattern,
// ADR-0021). AC-AP-002 (keep-mounted survives close→open) + AC-AP-005 (flag-off hides everything).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, renderHook, act, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { AgentRuntimeProvider, useAgentRuntime } from './AgentRuntimeContext'
import type { AgentRuntime } from './port'

// Flag-staleness cleanup (nav-five-destinations): dev (ae7cffa) ungated SHOW_ASSISTANT to true,
// so the provider now constructs a MosNativeRuntime by default. This test's intent is the
// flag-OFF branch (runtime null → the whole capability is hidden). Mock SHOW_ASSISTANT=false
// LOCALLY so the flag-gating coverage is preserved (BDD rule). Every other test injects a
// runtime via the prop, so the blanket file-level mock is safe for them.
vi.mock('@/config/features', () => ({
  SHOW_WEEKLY_UPDATES: true,
  SHOW_DAILY_LOG: true,
  SHOW_USER_VIEWS: true,
  SHOW_ASSISTANT: false,
  SHOW_INBOX: true,
}))

// A fake runtime injected via the provider's `runtime` prop — proves the provider exposes whatever
// it's given (the real MosNativeRuntime is constructed in-app when SHOW_ASSISTANT=true; tests inject
// a fake to avoid fetch/env coupling).
const fakeRuntime: AgentRuntime = {
  createRun: vi.fn(),
  followUp: vi.fn(),
  openThread: vi.fn(),
  control: vi.fn(),
  subscribe: vi.fn(),
}

function wrapper({ runtime, children }: { runtime?: AgentRuntime | null; children: ReactNode }) {
  // children travels in the props object so createElement's typing satisfies ProviderProps.
  return createElement(AgentRuntimeProvider, { runtime, children })
}

describe('AgentRuntimeProvider (T24)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('exposes runtime/open/openPanel/closePanel/togglePanel via useAgentRuntime', () => {
    const { result } = renderHook(() => useAgentRuntime(), {
      wrapper: (p: { children: ReactNode }) => wrapper({ ...p, runtime: fakeRuntime }),
    })
    expect(result.current.runtime).toBe(fakeRuntime)
    expect(result.current.open).toBe(false)
    expect(typeof result.current.openPanel).toBe('function')
    expect(typeof result.current.closePanel).toBe('function')
    expect(typeof result.current.togglePanel).toBe('function')
  })

  it('openPanel/closePanel/togglePanel flip the open state', () => {
    const { result } = renderHook(() => useAgentRuntime(), {
      wrapper: (p: { children: ReactNode }) => wrapper({ ...p, runtime: fakeRuntime }),
    })
    act(() => result.current.openPanel())
    expect(result.current.open).toBe(true)
    act(() => result.current.togglePanel())
    expect(result.current.open).toBe(false)
    act(() => result.current.togglePanel())
    expect(result.current.open).toBe(true)
    act(() => result.current.closePanel())
    expect(result.current.open).toBe(false)
  })

  it('open state persists to localStorage under "mos.assistant.open" (locale-toggle pattern)', () => {
    const { result } = renderHook(() => useAgentRuntime(), {
      wrapper: (p: { children: ReactNode }) => wrapper({ ...p, runtime: fakeRuntime }),
    })
    act(() => result.current.openPanel())
    expect(localStorage.getItem('mos.assistant.open')).toBe('true')
    act(() => result.current.closePanel())
    expect(localStorage.getItem('mos.assistant.open')).toBe('false')
  })

  it('a persisted-open localStorage value rehydrates open on mount (survives reload)', () => {
    localStorage.setItem('mos.assistant.open', 'true')
    const { result } = renderHook(() => useAgentRuntime(), {
      wrapper: (p: { children: ReactNode }) => wrapper({ ...p, runtime: fakeRuntime }),
    })
    expect(result.current.open).toBe(true)
  })

  it('runtime is null by default (SHOW_ASSISTANT=false — flag-off hides the whole capability)', () => {
    const { result } = renderHook(() => useAgentRuntime(), {
      wrapper: (p: { children: ReactNode }) => wrapper(p), // no runtime prop
    })
    expect(result.current.runtime).toBeNull()
  })

  it('useAgentRuntime returns safe defaults when rendered with NO provider (TopBar calls it unconditionally)', () => {
    // No wrapper — useAgentRuntime must NOT throw (the context default is a null-runtime no-op set),
    // so components like TopBar can call the hook even when the flag is off and no provider mounts.
    const { result } = renderHook(() => useAgentRuntime())
    expect(result.current.runtime).toBeNull()
    expect(result.current.open).toBe(false)
    expect(() => result.current.openPanel()).not.toThrow()
  })

  it('exposes the runtime + open state to children (integration: a child reads context)', () => {
    function Child() {
      const ctx = useAgentRuntime()
      return createElement('div', null, ctx.runtime ? 'has-runtime' : 'no-runtime', ` open=${ctx.open}`)
    }
    render(wrapper({ runtime: fakeRuntime, children: createElement(Child) }))
    expect(screen.getByText(/has-runtime open=false/)).toBeInTheDocument()
  })
})
