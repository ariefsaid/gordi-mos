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

  if (threads === null) {
    return (
      <div className="text-muted-foreground" style={{ padding: '1rem 0.25rem', fontSize: 14 }}>
        …
      </div>
    )
  }

  if (threads.length === 0) {
    return (
      <div className="text-muted-foreground" style={{ padding: '1rem 0.25rem', fontSize: 14 }}>
        {emptyText}
      </div>
    )
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
