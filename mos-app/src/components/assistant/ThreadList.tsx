/**
 * ThreadList — lists the owner's mos.agent_threads (updated_at desc); click -> onOpen(threadId)
 * (T7, P3a). Closes the P2 review follow-up ("always-empty History" — the panel's History tab
 * had no client-side thread index). Renders inside AssistantPanel's body when showHistory is on.
 *
 * Tokens only (DESIGN.md) — no raw hex/spacing. Loading/empty/populated states; each thread is a
 * `button` (keyboard-operable, focus-visible via the browser default outline on this token set).
 */

import { useEffect, useState } from 'react'
import { listThreads, type ThreadSummary } from '@/lib/agent/history'
import { EmptyState, LoadingShell } from '@/components/ui/state-kit'

export interface ThreadListProps {
  emptyText: string
  onOpen: (threadId: string) => void
}

export function ThreadList({ emptyText, onOpen }: ThreadListProps) {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void listThreads().then((rows) => {
      if (!cancelled) setThreads(rows)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // DEP-1 (census DO-16): the loading + empty states join the shared state-kit grammar instead
  // of a bare "…" (no role=status) / a naked <div>. `nested` drops the redundant region landmark
  // (the History pane already sits inside the labelled Assistant drawer). 'blank' = an empty-BY-
  // DESIGN surface (you have no past conversations yet), never a false ✓ / ↻.
  if (threads === null) {
    return <LoadingShell count={3} />
  }

  if (threads.length === 0) {
    return <EmptyState variant="blank" nested title={emptyText} />
  }

  return (
    <div className="flex flex-col gap-1">
      {threads.map((thread) => (
        <button
          key={thread.id}
          type="button"
          onClick={() => onOpen(thread.id)}
          className="text-left rounded-md border border-border bg-secondary text-foreground hover:border-muted-foreground/50 truncate"
          style={{ padding: '0.625rem 0.75rem', fontSize: 14 }}
        >
          {thread.title || '(untitled conversation)'}
        </button>
      ))}
    </div>
  )
}
