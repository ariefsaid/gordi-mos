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
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

export function useSearchParamState(
  key: string,
  defaultValue = '',
): [string, (next: string) => void] {
  const [params, setParams] = useSearchParams()
  const value = params.get(key) ?? defaultValue

  const setValue = useCallback(
    (next: string) => {
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

  return [value, setValue]
}
