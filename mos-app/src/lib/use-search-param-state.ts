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
// the new value on its NEXT render; a keystroke landing before that round trip completes was
// reading the router's PRE-keystroke state, so the box could visibly regress mid-typing. `local`
// updates synchronously with every `setValue` call, so the box always shows what was just typed
// regardless of how long the URL write takes to land. It only adopts a URL value when that value
// did NOT come from this hook's own last write — i.e. an external change (back/forward, a shared
// reset) — so the two never fight over which is authoritative.
import { useCallback, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

export function useSearchParamState(
  key: string,
  defaultValue = '',
): [string, (next: string) => void] {
  const [params, setParams] = useSearchParams()
  const urlValue = params.get(key) ?? defaultValue

  const [local, setLocal] = useState(urlValue)
  const lastWritten = useRef(urlValue)
  // What the URL read as of the PREVIOUS render — the only way to tell "the router is still
  // catching up to what we just wrote" (urlValue unchanged since last render, lastWritten has
  // moved on) apart from "something else navigated" (urlValue itself changed). Gating on
  // `lastWritten` alone cannot tell these apart: a write that hasn't landed yet leaves urlValue
  // permanently behind lastWritten, which would misread as an external change every render
  // until the navigation lands — regressing `local` back to the stale value mid-typing, the
  // exact defect this hook exists to fix.
  const prevUrlValue = useRef(urlValue)
  if (urlValue !== prevUrlValue.current) {
    prevUrlValue.current = urlValue
    if (urlValue !== lastWritten.current) {
      lastWritten.current = urlValue
      setLocal(urlValue)
    }
  }

  const setValue = useCallback(
    (next: string) => {
      const normalized = !next || next === defaultValue ? defaultValue : next
      lastWritten.current = normalized
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
