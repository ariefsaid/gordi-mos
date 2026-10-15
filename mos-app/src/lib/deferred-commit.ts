// Undo without a database change: an action is shown as done at once, but the write waits out an undo
// window and only then goes to the database. Undo inside the window cancels the write; leaving the page
// (flush) or starting another action writes immediately. One pending group at a time (last action wins,
// the earlier one is written first), so Undo always means "the thing I just did".

/** How long Undo stays available (ms). */
export const UNDO_WINDOW_MS = 6000

export interface DeferredCommit<T> {
  /** Hide/mark these items now; write them after the window unless undone. Writes any earlier group first. */
  start(items: readonly T[]): void
  /** Cancel the pending write. Returns what was pending. */
  undo(): readonly T[]
  /** Write the pending group now (window ended, page left, tab hidden). */
  flush(): Promise<void>
  readonly pending: readonly T[]
}

export function createDeferredCommit<T>(options: {
  delayMs?: number
  commit: (items: readonly T[]) => Promise<void> | void
  onChange: (pending: readonly T[]) => void
}): DeferredCommit<T> {
  const { delayMs = UNDO_WINDOW_MS, commit, onChange } = options
  let pending: readonly T[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  const clear = () => { if (timer !== null) { clearTimeout(timer); timer = null } }
  const set = (next: readonly T[]) => { pending = next; onChange(next) }

  const flush = async () => {
    if (pending.length === 0) return
    const items = pending
    clear()
    set([])
    await commit(items)
  }

  return {
    start(items) {
      if (items.length === 0) return
      if (pending.length > 0) void flush()
      set(items)
      timer = setTimeout(() => { void flush() }, delayMs)
    },
    undo() {
      const items = pending
      clear()
      if (items.length > 0) set([])
      return items
    },
    flush,
    get pending() { return pending },
  }
}
