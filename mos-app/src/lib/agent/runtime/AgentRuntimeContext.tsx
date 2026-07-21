/* eslint-disable react-refresh/only-export-components */
/**
 * AgentRuntimeProvider — the assistant panel/runtime context seam (T24, P2).
 *
 * Holds:
 *   - `runtime` — the singleton AgentRuntime (a MosNativeRuntime when SHOW_ASSISTANT=true; null
 *     when the flag is off, so every consumer short-circuits to "no assistant"). Tests inject a
 *     fake via the `runtime` prop to avoid fetch/env coupling.
 *   - `open` — the slide-over open/close state, persisted to localStorage ('mos.assistant.open'),
 *     mirroring the locale-toggle pattern (ADR-0021). Keep-mounted (FR-P2-AP-003) means the panel
 *     stays in the DOM with `inert` when closed; `open` only drives visibility, not mount.
 *
 * The context default is a null-runtime no-op set so consumers (TopBar) can call `useAgentRuntime()`
 * unconditionally even when the flag is off and no provider is mounted — no try/catch needed.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { SHOW_ASSISTANT } from '@/config/features'
import { MosNativeRuntime } from './mosNativeRuntime'
import type { AgentRuntime } from './port'
import { supabase } from '@/lib/supabase'

const STORAGE_KEY = 'mos.assistant.open'

interface AgentRuntimeContextValue {
  runtime: AgentRuntime | null
  open: boolean
  openPanel: () => void
  closePanel: () => void
  togglePanel: () => void
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

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(open))
    } catch {
      /* storage full / denied — in-memory state still applies */
    }
  }, [open])

  // Opener focus return (Interaction Contract I2): capture the element that launched Deputy (the
  // top-bar launcher or a command item) so closing the panel — by ✕, Esc, or toggle — returns
  // focus to it. The keep-mounted panel goes inert on close, so without this the focus would fall
  // to <body> and a keyboard/SR user would lose their place.
  const openerRef = useRef<HTMLElement | null>(null)
  const openRef = useRef(open)
  openRef.current = open

  const captureOpener = useCallback(() => {
    if (typeof document !== 'undefined') {
      openerRef.current = (document.activeElement as HTMLElement | null) ?? null
    }
  }, [])

  const restoreOpener = useCallback(() => {
    const opener = openerRef.current
    openerRef.current = null
    if (opener && typeof opener.focus === 'function') opener.focus()
  }, [])

  const openPanel = useCallback(() => {
    captureOpener()
    setOpen(true)
  }, [captureOpener])

  const closePanel = useCallback(() => {
    setOpen(false)
    restoreOpener()
  }, [restoreOpener])

  const togglePanel = useCallback(() => {
    if (openRef.current) {
      setOpen(false)
      restoreOpener()
    } else {
      captureOpener()
      setOpen(true)
    }
  }, [captureOpener, restoreOpener])

  const value = useMemo<AgentRuntimeContextValue>(
    () => ({ runtime: resolvedRuntime, open, openPanel, closePanel, togglePanel }),
    [resolvedRuntime, open, openPanel, closePanel, togglePanel],
  )

  return <AgentRuntimeContext.Provider value={value}>{children}</AgentRuntimeContext.Provider>
}

export function useAgentRuntime(): AgentRuntimeContextValue {
  return useContext(AgentRuntimeContext)
}
