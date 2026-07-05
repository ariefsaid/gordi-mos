// T7 (P3a) — ThreadList: lists mos.agent_threads for the owner (updated_at desc); click ->
// openThread(id). P2 follow-up ("always-empty History") — populates the History tab of
// AssistantPanel instead of a static "no conversations" stub. AC-P3-RP-003.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThreadList } from './ThreadList'

vi.mock('@/lib/agent/history', () => ({
  listThreads: vi.fn(),
}))

import { listThreads } from '@/lib/agent/history'

describe('ThreadList (T7, AC-P3-RP-003)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the loading state, then the threads (updated_at desc as returned by the DAL)', async () => {
    vi.mocked(listThreads).mockResolvedValue([
      { id: 't2', title: 'Second thread', updated_at: '2026-07-05T01:00:00.000Z' },
      { id: 't1', title: 'First thread', updated_at: '2026-07-04T00:00:00.000Z' },
    ])
    render(<ThreadList emptyText="No conversations yet" onOpen={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Second thread')).toBeInTheDocument()
    })
    const items = screen.getAllByRole('button')
    expect(items.map((el) => el.textContent)).toEqual(['Second thread', 'First thread'])
  })

  it('clicking a thread calls onOpen(threadId)', async () => {
    vi.mocked(listThreads).mockResolvedValue([
      { id: 't1', title: 'My thread', updated_at: '2026-07-04T00:00:00.000Z' },
    ])
    const onOpen = vi.fn()
    render(<ThreadList emptyText="No conversations yet" onOpen={onOpen} />)

    await waitFor(() => expect(screen.getByText('My thread')).toBeInTheDocument())
    fireEvent.click(screen.getByText('My thread'))
    expect(onOpen).toHaveBeenCalledWith('t1')
  })

  it('renders the empty-state text when there are no threads', async () => {
    vi.mocked(listThreads).mockResolvedValue([])
    render(<ThreadList emptyText="No conversations yet" onOpen={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('No conversations yet')).toBeInTheDocument())
  })

  it('an untitled thread falls back to a placeholder label (never renders blank)', async () => {
    vi.mocked(listThreads).mockResolvedValue([
      { id: 't1', title: null, updated_at: '2026-07-04T00:00:00.000Z' },
    ])
    render(<ThreadList emptyText="No conversations yet" onOpen={vi.fn()} />)
    await waitFor(() => {
      const btn = screen.getByRole('button')
      expect(btn.textContent).toBeTruthy()
      expect(btn.textContent).not.toBe('')
    })
  })
})
