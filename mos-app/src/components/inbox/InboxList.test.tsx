import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { InboxList } from './InboxList'
import type { NotificationRow } from '@/lib/db/notifications'

function row(id: string, read: boolean, extra?: Partial<NotificationRow>): NotificationRow {
  return {
    id,
    severity: 'info',
    title: `Title ${id}`,
    body: `Body ${id}`,
    metadata: { entity: { type: 'task', id: 't1', route: '/tasks/t1' } },
    read_at: read ? '2026-07-05T00:00:00Z' : null,
    created_at: '2026-07-05T00:00:00Z',
    ...extra,
  }
}

function renderList(notifications: NotificationRow[], onOpen = vi.fn()) {
  render(
    <I18nProvider>
      <InboxList notifications={notifications} onOpen={onOpen} />
    </I18nProvider>,
  )
  return { onOpen }
}

describe('InboxList (AC-P3-IB-002/003/006)', () => {
  it('AC-P3-IB-002: renders a row per notification with title + body', () => {
    renderList([row('a', false), row('b', true)])
    expect(screen.getByText('Title a')).toBeInTheDocument()
    expect(screen.getByText('Body a')).toBeInTheDocument()
    expect(screen.getByText('Title b')).toBeInTheDocument()
  })

  it('AC-P3-IB-002: an unread row is marked unread (accessible name + style hook)', () => {
    renderList([row('a', false)])
    const btn = screen.getByRole('button', { name: /Title a \(unread\)/ })
    expect(btn).toBeInTheDocument()
    expect(btn.closest('.inbox-row')).toHaveClass('inbox-row--unread')
  })

  it('AC-P3-IB-003: clicking a row calls onOpen with that notification', () => {
    const { onOpen } = renderList([row('a', false)])
    fireEvent.click(screen.getByRole('button', { name: /Title a/ }))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
  })

  it('AC-P3-IB-006: empty state shows the caught-up message', () => {
    // Cohesion-debt 2026-07-19, item #2: the all-clear now renders through the shared
    // kit EmptyState (quiet variant) instead of a bespoke role="status" div — one
    // empty-state grammar app-wide. The earned caught-up message is preserved.
    renderList([])
    const empty = screen.getByTestId('empty-state')
    expect(empty).toHaveAttribute('data-empty-variant', 'quiet')
    expect(empty).toHaveTextContent(/caught up/i)
  })

  it('renders text-only content (no injected markup) — a title with markup stays inert text', () => {
    renderList([row('x', false, { title: '<img src=x onerror=alert(1)>' })])
    // React escapes it: it renders as text, and no <img> element is produced from the notification.
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })
})
