// One save grammar for every eager-commit row in Admin Settings (Teams, Home, Position, Access,
// Revenue scope, Team lead): the row shows its own state beside itself — Saving… → Saved, or
// Failed · Retry — and a failed row keeps showing the value the admin attempted until Retry
// succeeds or they change it back. There is no second feedback channel (no toast).
//
// A failed request does not prove the write failed: the response can be lost after the database
// committed. Every failure is followed by the caller's re-read, and a failed row whose re-read
// saved value already equals the attempted one reads Saved — so the next click acts on what the
// server holds, never on a stale "failed" picture of it.

import { useCallback, useRef, useState } from 'react'

export type RowCommitStatus = 'saving' | 'saved' | 'failed'

interface RowEntry<V> {
  status: RowCommitStatus
  /** The value the admin asked for. Displayed while saving and after a failure. */
  value: V
  /** Raw failure text, kept for the hover title only (the visible copy is localized). */
  error?: string
}

export interface RowCommits<V> {
  /** `saved` is the latest re-read value: a failure the server already holds reads Saved. */
  status: (key: string, saved: V) => RowCommitStatus | undefined
  error: (key: string) => string | undefined
  /** Saved value unless a write for this row is in flight or failed — then the attempted value. */
  display: (key: string, saved: V) => V
  /** True while any row whose key starts with `prefix` is saving. */
  busy: (prefix?: string) => boolean
  /**
   * Ask for `value` on row `key`. Asking for the saved value again while a failure is showing is a
   * revert: the row clears and nothing is written. `write` runs the database call; `after` runs
   * after either outcome (a reload), and the row reads Saved only once both have finished.
   */
  commit: (key: string, value: V, saved: V, write: () => Promise<void>, after?: () => Promise<void> | void) => Promise<void>
  retry: (key: string) => Promise<void>
}

export function useRowCommits<V>(): RowCommits<V> {
  const [rows, setRows] = useState<Record<string, RowEntry<V>>>({})
  // The last write per row, so Retry repeats exactly what failed.
  const pending = useRef<Record<string, { write: () => Promise<void>; after?: () => Promise<void> | void; value: V }>>({})

  const run = useCallback(async (key: string) => {
    const job = pending.current[key]
    if (!job) return
    setRows((current) => ({ ...current, [key]: { status: 'saving', value: job.value } }))
    const reload = async () => {
      try { await job.after?.() } catch { /* a failed reload leaves the list as it was; the row still reports the write */ }
    }
    try {
      await job.write()
      await reload()
      setRows((current) => ({ ...current, [key]: { status: 'saved', value: job.value } }))
    } catch (err) {
      await reload()
      const error = err instanceof Error ? err.message : undefined
      setRows((current) => ({ ...current, [key]: { status: 'failed', value: job.value, error } }))
    }
  }, [])

  const commit = useCallback<RowCommits<V>['commit']>(async (key, value, saved, write, after) => {
    if (Object.is(value, saved)) {
      delete pending.current[key]
      setRows((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
      return
    }
    pending.current[key] = { write, after, value }
    await run(key)
  }, [run])

  return {
    status: (key, saved) => {
      const row = rows[key]
      return row?.status === 'failed' && Object.is(row.value, saved) ? 'saved' : row?.status
    },
    error: (key) => rows[key]?.error,
    display: (key, saved) => {
      const row = rows[key]
      return row && row.status !== 'saved' ? row.value : saved
    },
    busy: (prefix = '') => Object.entries(rows).some(([key, row]) => key.startsWith(prefix) && row.status === 'saving'),
    commit,
    retry: run,
  }
}
