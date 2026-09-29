// useSearchParamState — the shared primitive for "view state in query params survives refresh/share"
// (interaction I7 / D-E1) on surfaces that do NOT run the RecordCollection engine (People, Kitchen,
// Inbox triage). Engine surfaces get this for free via urlMode:'synced'; this hook is the direct
// equivalent for one query key on a bespoke surface.
//
// Contract: reads the key from the URL (falling back to `defaultValue`), and writes it back with
// `replace: true` so a filter/search change never spams the history stack — the CURRENT entry keeps
// the live view state, so a refresh or a copied link reproduces exactly what the user sees. Writing
// the default value (or an empty string) DELETES the key, so a reset URL stays clean (?status=all is
// never left dangling). Other query keys on the URL are preserved untouched.
//
// The displayed value is a LOCAL echo, not `params.get(key)` read straight — calibration finding,
// MVP wave 1: fast typing in Café Plan's item search dropped characters. A `setSearchParams` call
// goes through `navigate()` and a history write before this hook's own `useSearchParams()` reports
// the new value on its NEXT render, so a keystroke landing before that round trip completes was
// reading the router's PRE-keystroke state. `local` updates synchronously with every `setValue`
// call instead. Only a urlValue this hook did NOT itself write is adopted as an external change
// (back/forward, a shared reset) — see `ownWrites` below for how a same-hook write is told
// apart from one.
import { useCallback, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

const OWN_ECHO_WINDOW_MS = 5000

export function useSearchParamState(
  key: string,
  defaultValue = '',
): [string, (next: string) => void] {
  const [params, setParams] = useSearchParams()
  const urlValue = params.get(key) ?? defaultValue

  const [local, setLocal] = useState(urlValue)
  // Values THIS hook wrote recently, with the time of the write. The router echoes each write
  // back on its own schedule, and under load echoes land late and out of order; an echo is never
  // consumed, so any recent one (in any order, more than once) is recognised as our own and cannot
  // overwrite newer typed text. A urlValue matching no write inside OWN_ECHO_WINDOW_MS is a genuine
  // external change (back/forward, a reset, a deep link) and replaces local state.
  const ownWrites = useRef<{ value: string; at: number }[]>([])
  const prevUrlValue = useRef(urlValue)
  if (urlValue !== prevUrlValue.current) {
    prevUrlValue.current = urlValue
    const now = Date.now()
    ownWrites.current = ownWrites.current.filter((w) => now - w.at < OWN_ECHO_WINDOW_MS)
    if (!ownWrites.current.some((w) => w.value === urlValue)) {
      ownWrites.current = []
      setLocal(urlValue)
    }
  }

  const setValue = useCallback(
    (next: string) => {
      const normalized = !next || next === defaultValue ? defaultValue : next
      ownWrites.current.push({ value: normalized, at: Date.now() })
      setLocal(normalized)
      setParams(
        (prev) => {
          const updated = new URLSearchParams(prev)
          if (!next || next === defaultValue) updated.delete(key)
          else updated.set(key, next)
          return updated
        },
        { replace: true },
      )
    },
    [key, defaultValue, setParams],
  )

  return [local, setValue]
}

// Multi-key reset in ONE history replace. Two useSearchParamState setters called in the same
// handler clobber each other (react-router's functional updater reads the last-RENDER params,
// not the pending update) — a combined "Clear filters" must delete all its keys atomically.
export function useSearchParamReset(keys: string[]): () => void {
  const [, setParams] = useSearchParams()
  return useCallback(
    () =>
      setParams(
        (prev) => {
          const updated = new URLSearchParams(prev)
          for (const key of keys) updated.delete(key)
          return updated
        },
        { replace: true },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keys is a stable literal at call sites
    [setParams, keys.join(',')],
  )
}
