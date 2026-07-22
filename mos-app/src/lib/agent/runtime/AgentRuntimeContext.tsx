/* eslint-disable react-refresh/only-export-components */
/**
 * AgentRuntimeProvider — the assistant panel/runtime context seam (T24, P2).
 *
 * Holds:
 *   - `runtime` — the singleton AgentRuntime (a MosNativeRuntime when SHOW_ASSISTANT=true; null
 *     when the flag is off, so every consumer short-circuits to "no assistant"). Tests inject a
 *     fake via the `runtime` prop to avoid fetch/env coupling.
 *   - `open` — the slide-over open/close state, persisted to localStorage ('mos.assistant.open'),
 *     mirroring the locale-toggle pattern (ADR-0021). Keep-mounted (FR-P2-AP-003) means the
 *     AssistantPanel hook owner stays mounted while the shared physical host opens/closes.
 *
 * Focus, Escape, scrim, and modality deliberately do not live here: RecordPanelHost owns those
 * interaction contracts for Deputy just as it does for record tenants.
 *
 * The context default is a null-runtime no-op set so consumers (TopBar) can call `useAgentRuntime()`
 * unconditionally even when the flag is off and no provider is mounted — no try/catch needed.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { SHOW_ASSISTANT } from '@/config/features'
import { MosNativeRuntime } from './mosNativeRuntime'
import type { AgentRuntime } from './port'
import { supabase } from '@/lib/supabase'

const STORAGE_KEY = 'mos.assistant.open'

interface AgentRuntimeContextValue {
  runtime: AgentRuntime | null
  open: boolean
  /**
   * Opens the Deputy slide-over. An optional `initialDraft` pre-fills the composer (record-scoped
   * "Ask Deputy" — the caller passes a compact record reference like "About Task: <title>"). The
   * draft is a seed the user still edits and sends; it never auto-sends. Non-string args (e.g. the
   * MouseEvent from `onClick={openPanel}`) are ignored, so plain launcher clicks seed nothing.
   * The `ReactMouseEvent` arm keeps `openPanel` usable directly as a click handler.
   */
  openPanel: (initialDraft?: string | ReactMouseEvent) => void
  closePanel: () => void
  togglePanel: () => void
  /** The pending composer seed from the last record-scoped openPanel, or null. Consumed once. */
  pendingDraft: string | null
  /** Clears the pending seed once the composer has adopted it (single-shot). */
  consumePendingDraft: () => void
}

// Safe default: null runtime + no-op setters. Lets components (TopBar) call useAgentRuntime()
// unconditionally even when SHOW_ASSISTANT=false and no provider is mounted.
const noop = () => {}
const DEFAULT_VALUE: AgentRuntimeContextValue = {
  runtime: null,
  open: false,
  openPanel: noop,
  closePanel: noop,
  togglePanel: noop,
  pendingDraft: null,
  consumePendingDraft: noop,
}

const AgentRuntimeContext = createContext<AgentRuntimeContextValue>(DEFAULT_VALUE)

function readPersistedOpen(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

interface ProviderProps {
  children: ReactNode
  /** Test seam: inject a fake runtime. When omitted, the provider constructs a MosNativeRuntime
   *  if SHOW_ASSISTANT=true, else null. */
  runtime?: AgentRuntime | null
}

export function AgentRuntimeProvider({ children, runtime }: ProviderProps) {
  // The in-app runtime: constructed once when the flag is on (and no test override supplied).
  // Lazy import guard: supabase auth.getSession is only ever called when subscribe runs, which only
  // happens when the panel is live (flag on) — so construction is safe.
  const realRuntime = useMemo<AgentRuntime | null>(() => {
    if (!SHOW_ASSISTANT) return null
    const url = import.meta.env.VITE_SUPABASE_URL
    return new MosNativeRuntime({
      endpoint: `${url}/functions/v1/agent-chat`,
      getAccessToken: async () => {
        const { data } = await supabase.auth.getSession()
        return data.session?.access_token ?? null
      },
    })
  }, [])

  const resolvedRuntime = runtime === undefined ? realRuntime : runtime

  const [open, setOpen] = useState<boolean>(readPersistedOpen)
  // Record-scoped seed: the composer adopts this once on open, then calls consumePendingDraft().
  // Not persisted — a page reload should not resurrect a stale record reference in the composer.
  const [pendingDraft, setPendingDraft] = useState<string | null>(null)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(open))
    } catch {
      /* storage full / denied — in-memory state still applies */
    }
  }, [open])

  const openRef = useRef(open)
  openRef.current = open

  const openPanel = useCallback((initialDraft?: string | ReactMouseEvent) => {
    // Guard against non-string args: `onClick={openPanel}` hands us a MouseEvent, which must not
    // become a composer seed. Only an explicit string (the record reference) seeds the draft.
    if (typeof initialDraft === 'string') setPendingDraft(initialDraft)
    setOpen(true)
  }, [])

  const consumePendingDraft = useCallback(() => {
    setPendingDraft(null)
  }, [])

  const closePanel = useCallback(() => {
    setOpen(false)
  }, [])

  const togglePanel = useCallback(() => {
    if (openRef.current) {
      setOpen(false)
    } else {
      setOpen(true)
    }
  }, [])

  const value = useMemo<AgentRuntimeContextValue>(
    () => ({ runtime: resolvedRuntime, open, openPanel, closePanel, togglePanel, pendingDraft, consumePendingDraft }),
    [resolvedRuntime, open, openPanel, closePanel, togglePanel, pendingDraft, consumePendingDraft],
  )

  return <AgentRuntimeContext.Provider value={value}>{children}</AgentRuntimeContext.Provider>
}

export function useAgentRuntime(): AgentRuntimeContextValue {
  return useContext(AgentRuntimeContext)
}
