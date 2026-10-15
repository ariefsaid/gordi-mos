import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CafeTodayNext } from './cafe-today-next'
import type { TodayJobs } from '@/lib/use-cafe-today-jobs'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'

afterEach(cleanup)

const hq = { id: 'b1', code: 'ghq', name: 'Gordi HQ' }
const stream: ProductionStream = { branch: hq, activity: 'bar', produces: true }
const jobs = (patch: Partial<TodayJobs> = {}): TodayJobs => ({
  state: 'ready', producing: true, planned: 4, made: 1, transfers: [{ destinationBranchId: 'b1', branch: hq, planned: 3 }],
  wasteLogged: 0, drafts: {}, lockedReceipts: 0, lastRequest: null, itemsReady: true, canSetUpItems: false, retry: vi.fn(), ...patch,
})
const renderNext = (value: TodayJobs) => render(<MemoryRouter><CafeTodayNext jobs={value} stream={stream} setupHref="/cafe/items" /></MemoryRouter>)

describe('Café home: Next up', () => {
  it('has one row per job, in shift order, each saying where the job stands', () => {
    renderNext(jobs({ lockedReceipts: 1 }))
    const rows = screen.getAllByRole('listitem')
    expect(rows.map(row => within(row).getAllByRole('link')[0].getAttribute('href'))).toEqual([
      '/cafe/production', '/cafe/transfer', '/cafe/waste', '/cafe/count', '/cafe/receive', '/cafe/request',
    ])
    expect(rows[0]).toHaveTextContent('Production4 planned · 1 made')
    expect(rows[1]).toHaveTextContent('3 planned to Gordi HQ · Kitchen')
    expect(rows[4]).toHaveTextContent('1 receipt locked, not sent')
    expect(within(rows[4]).getByText('Continue')).toBeInTheDocument()
  })

  it('offers Continue on a job with unsent browser entries', () => {
    renderNext(jobs({ drafts: { production: '2026-10-13T07:02:00.000Z' } }))
    const production = screen.getAllByRole('listitem')[0]
    expect(production).toHaveTextContent('unsent entries saved')
    expect(within(production).getByText('Continue')).toBeInTheDocument()
  })

  it('says items are not set up, with the one way forward for whoever can set them up', () => {
    renderNext(jobs({ itemsReady: false, canSetUpItems: true }))
    expect(screen.getByRole('link', { name: 'Set up items' })).toHaveAttribute('href', '/cafe/items')
    expect(screen.getAllByText('Items not set up yet')).toHaveLength(4)
  })

  it('tells everyone else who can set them up, and has no Set up items link', () => {
    renderNext(jobs({ itemsReady: false }))
    expect(screen.getByText(/Bar items aren't set up yet\. Ask your bar lead or an ops lead/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Set up items' })).toBeNull()
  })

  it('names Production only for a stream that can produce', () => {
    renderNext(jobs({ producing: false, transfers: [] }))
    expect(screen.queryByRole('link', { name: /Production/ })).toBeNull()
  })
})
