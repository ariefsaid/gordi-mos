import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

const collection = vi.hoisted(() => ({ hasMore: false, loadMore: vi.fn(), setQuery: vi.fn() }))
vi.mock('@/lib/record-collection/use-record-collection', () => ({ useRecordCollection: () => ({
  state: {
    query: { month: '2027-01', savedViewId: null },
    projection: { visibleRecords: [], totalRecords: 0 },
    data: collection.hasMore ? { records: [], context: { nextCursor: { starts_at: '2027-01-01T00:00:00Z', id: 'event-1' } } } : null,
    loadingMore: false, moreError: null, status: 'empty',
  },
  loadMore: collection.loadMore, setQuery: collection.setQuery, retry: vi.fn(),
}) }))
vi.mock('@/components/record-collection/record-collection', () => ({ RecordCollectionSurface: ({ controls, empty, error, loadingLabel }: { controls: ReactNode; empty: { title: string }; error: { message: string }; loadingLabel: string }) => <><span>{loadingLabel}</span>{controls}<p>{empty.title}</p><p>{error.message}</p></> }))
import { EventsWorkspacePage } from './events-workspace-page'

describe('EventsWorkspacePage', () => {
  it('keeps the workspace frame and accessible month controls through its collection states', () => {
    render(<I18nProvider><MemoryRouter><EventsWorkspacePage /></MemoryRouter></I18nProvider>)
    expect(screen.getByRole('heading', { name: 'Events' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument()
    expect(screen.getByText('Nothing scheduled this month')).toBeInTheDocument()
    expect(screen.getByText('Events could not be loaded. Try again.')).toBeInTheDocument()
  })

  it.each([
    { locale: 'en' as const, label: 'Load more items' },
    { locale: 'id' as const, label: 'Muat item lainnya' },
  ])('lets the user continue the month event window in $locale', async ({ locale, label }) => {
    collection.loadMore.mockClear()
    collection.hasMore = true
    render(<I18nProvider initialLocale={locale}><MemoryRouter><EventsWorkspacePage /></MemoryRouter></I18nProvider>)
    await userEvent.click(screen.getByRole('button', { name: label }))
    expect(collection.loadMore).toHaveBeenCalledOnce()
    collection.hasMore = false
  })
})
