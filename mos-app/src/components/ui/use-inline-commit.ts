// useInlineCommit — the ONE inline-edit primitive (interaction-contract.md class I5,
// owner-locked by OD-REDESIGN-22, docs/decisions.md). It owns a single behavior for
// editing a saved record field in place:
//
//   • Enter / Tab / click-outside COMMIT the current draft.
//   • Escape DISCARDS and restores the last saved value — it never commits.
//   • While an async commit is pending the field is disabled + aria-busy.
//   • A rejected commit rolls the draft back to the saved value and announces the
//     revert via a role=status live region (the same optimistic idiom Tasks already
//     uses — reused here, not re-invented; see task-surface.tsx `announce`).
//
// ── Native-select reading (why this hook is TEXT/NUMBER only) ──────────────────
// A native <select> (and the equivalent listbox popovers — e.g. PersonPicker)
// has NO free-typing draft: picking an option IS the user's commit intent, so those
// surfaces commit eagerly on change — that is the CORRECT I5 reading for a select, not
// a violation. For a select, "Escape discards" means Escape-while-open closes the
// native dropdown without changing the value (browser-native) — there is no draft to
// restore. The draft/restore model in this hook applies STRICTLY to free-entry
// text/number inputs, where a keystroke is not yet a commit. Do not route selects
// through this hook — doing so would break their correct eager commit.
//
// The caller supplies `onCommit`; if it returns a rejecting Promise the hook drives the
// rollback + announce. A void (synchronous) `onCommit` simply commits with no async
// pending/rollback — the caller then owns any error surfacing.

import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseInlineCommitOptions<T> {
  /** The committed / saved value — the source of truth restored on Escape or rollback. */
  value: T
  /**
   * Persist the committed draft. Return a Promise to opt into pending + rollback:
   * a rejecting Promise rolls the draft back to `value` and announces `rollbackMessage`.
   */
  onCommit: (next: T) => void | Promise<void>
  /** When true the field is inert (offline / parent-disabled); commits are suppressed. */
  disabled?: boolean
  /** Skip no-op commits (draft equals saved). Defaults to Object.is. */
  equals?: (a: T, b: T) => boolean
  /** Announced via the returned `liveMessage` (role=status) when a commit rejects. */
  rollbackMessage?: string
}

export interface UseInlineCommitResult<T> {
  /** The in-progress draft value bound to the input. */
  draft: T
  /** Update the draft as the user types (does NOT commit). */
  setDraft: (v: T) => void
  /** True while an async commit is in flight — drive `disabled` + `aria-busy`. */
  pending: boolean
  /**
   * True after an async commit REJECTED — drive a VISIBLE "Couldn't save · Retry" affordance
   * (OD-REDESIGN-22: autosave shows pending/saved/error/retry, never a sr-only-only rollback).
   * Cleared when a new commit starts, on `retry`, on `cancel`, and when `value` syncs upstream.
   */
  error: boolean
  /**
   * Re-send the LAST rejected attempt (the preserved value the user typed) — Retry re-commits
   * the same draft, it does NOT re-send the rolled-back saved value. No-op with nothing to retry.
   */
  retry: () => void
  /** Commit the current draft, or an explicit `override` (e.g. a stepper ± click). */
  commit: (override?: T) => void
  /** Escape — restore the saved value WITHOUT committing. */
  cancel: () => void
  /** Rollback announcement text; render inside an aria-live=polite role=status node. */
  liveMessage: string
  /** Spread onto the input: Enter commits, Escape restores. */
  onKeyDown: (e: React.KeyboardEvent) => void
  /** Spread onto the input: commits on blur (covers Tab + click-outside). */
  onBlur: () => void
}

function isThenable(v: unknown): v is Promise<void> {
  return typeof (v as { then?: unknown } | null)?.then === 'function'
}

export function useInlineCommit<T>({
  value,
  onCommit,
  disabled = false,
  equals = Object.is,
  rollbackMessage,
}: UseInlineCommitOptions<T>): UseInlineCommitResult<T> {
  const [draft, setDraft] = useState<T>(value)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const [liveMessage, setLiveMessage] = useState('')
  const pendingRef = useRef(false)
  // The last value handed to a rejecting commit — preserved so Retry re-sends the user's
  // attempt (not the rolled-back saved value). `null` means there is nothing to retry.
  const lastAttemptRef = useRef<{ value: T } | null>(null)

  // The last upstream value this hook has synced against. Seeded with the mount value:
  // the draft is ALREADY initialized from `value` (useState above), so the effect's job
  // is strictly to track LATER upstream changes — never to re-assert the mount value.
  const lastSyncedValueRef = useRef(value)

  // Keep the draft synced to the committed value when it changes upstream (a confirmed
  // save, an external edit, or — for the qty cells — an action-type switch). Never
  // clobber an in-flight edit: while a commit is pending the draft is authoritative.
  // A confirmed upstream value also clears any stale error/retry (the field is at rest).
  //
  // #345: the effect MUST no-op when `value` has not actually changed — above all on its
  // mount invocation. Passive effects flush asynchronously, so when the field appears via
  // a non-act/concurrent commit (every data-loaded surface) there is a window between the
  // DOM landing and the mount effects running; a keystroke in that window sets the draft
  // first, and an unguarded `setDraft(value)` then lands later in the same batch and wipes
  // it — the user's edit silently becomes a no-op commit. Deps alone don't guard the mount
  // run, hence the explicit last-synced ref.
  useEffect(() => {
    if (Object.is(lastSyncedValueRef.current, value)) return
    lastSyncedValueRef.current = value
    if (!pendingRef.current) {
      setDraft(value)
      setError(false)
      lastAttemptRef.current = null
    }
  }, [value])

  // Re-announce even identical consecutive outcomes: clear then set on the next frame
  // so a repeated rollback is spoken again (mirrors task-surface `announce`).
  const announce = useCallback((msg: string) => {
    setLiveMessage('')
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setLiveMessage(msg))
    } else {
      setLiveMessage(msg)
    }
  }, [])

  // A pending async attempt owns the field until it settles; duplicate gestures are inert.
  const commit = useCallback((override?: T) => {
    if (pendingRef.current) return
    const next = override !== undefined ? override : draft
    if (override !== undefined) setDraft(override)
    if (disabled) return
    if (equals(next, value)) return // no-op — no needless write
    setError(false) // a fresh attempt clears any prior error/retry state
    const result = onCommit(next)
    if (isThenable(result)) {
      pendingRef.current = true
      setPending(true)
      result.then(
        () => {
          pendingRef.current = false
          setPending(false)
          lastAttemptRef.current = null
        },
        () => {
          pendingRef.current = false
          setPending(false)
          lastAttemptRef.current = { value: next } // preserve the attempt for Retry
          setDraft(value) // rollback the visible draft to the saved value
          setError(true) // surface a VISIBLE error + Retry (OD-REDESIGN-22)
          if (rollbackMessage) announce(rollbackMessage)
        },
      )
    }
  }, [draft, disabled, equals, value, onCommit, rollbackMessage, announce])

  const retry = useCallback(() => {
    const attempt = lastAttemptRef.current
    if (attempt) commit(attempt.value)
  }, [commit])

  const cancel = useCallback(() => {
    setDraft(value) // Escape — discard the draft, restore saved; never commit
    setError(false)
    lastAttemptRef.current = null
  }, [value])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }, [commit, cancel])

  const onBlur = useCallback(() => {
    commit()
  }, [commit])

  return { draft, setDraft, pending, error, retry, commit, cancel, liveMessage, onKeyDown, onBlur }
}
