import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createDeferredCommit, UNDO_WINDOW_MS } from '@/lib/deferred-commit'

/**
 * React binding for lib/deferred-commit: `pending` drives what the page hides and shows in its Undo
 * notice; the write runs when the window ends, or immediately when the page unmounts or the tab is
 * hidden. `commit` may change between renders (always the latest one runs).
 */
export function useDeferredCommit<T>(commit: (items: readonly T[]) => Promise<void> | void, delayMs: number = UNDO_WINDOW_MS) {
  const [pending, setPending] = useState<readonly T[]>([])
  const commitRef = useRef(commit)
  commitRef.current = commit
  const instance = useMemo(
    () => createDeferredCommit<T>({ delayMs, commit: (items) => commitRef.current(items), onChange: setPending }),
    [delayMs],
  )
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void instance.flush() }
    window.addEventListener('pagehide', onHide as EventListener)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide as EventListener)
      document.removeEventListener('visibilitychange', onHide)
      void instance.flush()
    }
  }, [instance])
  const start = useCallback((items: readonly T[]) => instance.start(items), [instance])
  const undo = useCallback(() => instance.undo(), [instance])
  const flush = useCallback(() => instance.flush(), [instance])
  return { pending, start, undo, flush }
}
