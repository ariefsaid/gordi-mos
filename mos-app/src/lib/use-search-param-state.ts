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
// The displayed value is a LOCAL echo, not `params.get(key)` read straight — fast typing in Café
// Plan's item search dropped characters. A `setSearchParams` call goes through `navigate()` and a
// history write before `useSearchParams()` reports the new value on a LATER render, so a keystroke
// landing before that round trip completes read the router's PRE-keystroke state. `local` updates
// synchronously with every `setValue` call instead.
//
// A urlValue change is either the router's echo of THIS hook's own write (ignore: local is already
// ahead) or an external change — back/forward, "Clear filters", a link (adopt). Every new
// back/forward entry is adopted, whatever its value. Every own write is
// tagged in navigation state (`__sps[key] = token`) and the tag is read back off the location, so
// the two are told apart by what wrote the URL, never by its value or age.
import { useCallback, useId, useRef, useState } from 'react'
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom'

const STATE_KEY = '__sps'

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function readTag(state: unknown, key: string): unknown {
  return asRecord(asRecord(state)[STATE_KEY])[key]
}

export function useSearchParamState(
  key: string,
  defaultValue = '',
): [string, (next: string) => void] {
  const [params, setParams] = useSearchParams()
  const urlValue = params.get(key) ?? defaultValue

  const [local, setLocal] = useState(urlValue)

  // The latest location.state comes from `useLocation()`: `setSearchParams` takes a functional
  // updater for the params but not for state, and the merge in `setValue` must keep every other
  // state key (overlay markers, route-owned panels, other hooks' tags).
  const location = useLocation()
  const latestState = useRef<unknown>(location.state)
  latestState.current = location.state

  // This instance's write tag. A history traversal (POP: Back/Forward onto any entry, tagged or
  // not) is always external; otherwise a matching tag is our own echo, early or late.
  const token = useId()
  const navigationType = useNavigationType()

  // A new POP entry (its `location.key` differs) is adopted even when its value equals the URL's
  // current one: a keystroke's own write may still be pending, so `local` can be ahead of it.
  const prevUrlValue = useRef(urlValue)
  const prevLocationKey = useRef(location.key)
  const newPopEntry = navigationType === 'POP' && location.key !== prevLocationKey.current
  prevLocationKey.current = location.key
  if (newPopEntry || urlValue !== prevUrlValue.current) {
    prevUrlValue.current = urlValue
    if (navigationType === 'POP' || readTag(location.state, key) !== token) setLocal(urlValue)
  }

  const setValue = useCallback(
    (next: string) => {
      const normalized = !next || next === defaultValue ? defaultValue : next
      const state = asRecord(latestState.current)
      setLocal(normalized)
      setParams(
        (prev) => {
          const updated = new URLSearchParams(prev)
          if (!next || next === defaultValue) updated.delete(key)
          else updated.set(key, next)
          return updated
        },
        {
          replace: true,
          state: { ...state, [STATE_KEY]: { ...asRecord(state[STATE_KEY]), [key]: token } },
        },
      )
    },
    [key, defaultValue, setParams, token],
  )

  return [local, setValue]
}

// Multi-key reset in ONE history replace. Two useSearchParamState setters called in the same
// handler clobber each other (react-router's functional updater reads the last-RENDER params,
// not the pending update) — a combined "Clear filters" must delete all its keys atomically.
// It writes no tag, so every hook sees the resulting change as external and adopts it.
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
