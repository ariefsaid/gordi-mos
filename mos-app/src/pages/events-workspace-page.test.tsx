import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

const setQuery = vi.fn()
vi.mock('@/lib/record-collection/use-record-collection', () => ({ useRecordCollection: () => ({ state: { query: { month: '2027-01', savedViewId: null }, projection: { visibleRecords: [], totalRecords: 0 }, status: 'empty' }, setQuery, retry: vi.fn() }) }))
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
})
