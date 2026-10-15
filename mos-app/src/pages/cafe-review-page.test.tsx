import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CafeWaiting, WaitingKey, WaitingState } from '@/lib/use-cafe-waiting'
import { CafeReviewPage } from './cafe-review-page'

const roles = vi.hoisted(() => ({ value: ['ops_lead'] as string[] }))
const counts = vi.hoisted(() => ({ value: {} as Record<string, number | 'loading' | 'error'> }))

vi.mock('@/auth/use-auth', () => ({ useAuth: () => ({ status: 'authenticated', viewer: { person: { id: 'p1' }, accessRoles: roles.value } }) }))
vi.mock('@/lib/use-cafe-waiting', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/use-cafe-waiting')>()
  return {
    ...real,
    useCafeWaiting: (): CafeWaiting => {
      const keys: WaitingKey[] = roles.value.includes('ops_lead') ? ['logs', 'counts', 'receipts', 'requests', 'issues', 'failed'] : ['logs', 'counts', 'receipts', 'requests', 'issues']
      const state = (key: WaitingKey): WaitingState => {
        const c = counts.value[key] ?? 0
        return c === 'loading' ? { status: 'loading' } : c === 'error' ? { status: 'error' } : { status: 'ready', count: c, bounded: false }
      }
      return { admitted: true, viewerId: 'p1', keys, queues: Object.fromEntries(['logs', 'counts', 'receipts', 'requests', 'issues', 'failed'].map((k) => [k, state(k as WaitingKey)])) as Record<WaitingKey, WaitingState>, load: vi.fn(), reload: vi.fn() }
    },
  }
})
vi.mock('@/components/kitchen/cafe-page-frame', () => ({ CafePageFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/kitchen/cafe-receipt-issues-link', () => ({ CafeReceiptIssuesLink: () => null }))
vi.mock('./kitchen-review-page', () => ({ KitchenReviewPage: ({ view }: { view: string }) => <p>logs-counts queue showing {view}</p> }))
vi.mock('./cafe-receipt-review-page', () => ({ CafeReceiptReviewPage: () => <p>receipts queue</p> }))
vi.mock('./cafe-request-review-page', () => ({ CafeRequestReviewPage: () => <p>requests queue</p> }))
vi.mock('@/components/kitchen/cafe-failed-sends-queue', () => ({ CafeFailedSendsQueue: () => <p>failed sends queue</p> }))

function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname}{l.search}</output> }
const renderAt = (url: string) => render(<MemoryRouter initialEntries={[url]}><Where /><CafeReviewPage /></MemoryRouter>)
const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.textContent)

describe('Café Review: one row of tabs', () => {
  beforeEach(() => { roles.value = ['ops_lead']; counts.value = {} })
  afterEach(() => cleanup())

  it('shows every queue as a tab with its waiting count and no dropdown', async () => {
    counts.value = { logs: 3, counts: 0, receipts: 12, requests: 1, failed: 2 }
    renderAt('/cafe/review?queue=receipts')
    expect(tabNames()).toEqual(['Logs3', 'Counts0', 'Receipts12', 'Requests1', 'Failed ESB sends2'])
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByRole('tab', { name: /receipts/i })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('receipts queue')).toBeInTheDocument()
  })

  it('shows "—" for a count that could not be read, never 0', async () => {
    counts.value = { logs: 'error' }
    renderAt('/cafe/review?queue=logs')
    expect(screen.getByRole('tab', { name: /^logs/i })).toHaveTextContent('Logs—')
    await screen.findByText(/queue showing logs/)
  })

  it('gives a supervisor no Failed ESB sends tab', () => {
    roles.value = ['supervisor']
    renderAt('/cafe/review')
    expect(tabNames().map((name) => name?.replace(/\d+$/, ''))).toEqual(['Logs', 'Counts', 'Receipts', 'Requests'])
  })

  it('opens the first tab with something waiting when the address names none', async () => {
    counts.value = { counts: 4, requests: 9 }
    renderAt('/cafe/review')
    expect(await screen.findByText('logs-counts queue showing counts')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /counts/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('opens Logs when nothing is waiting', async () => {
    renderAt('/cafe/review')
    expect(await screen.findByText('logs-counts queue showing logs')).toBeInTheDocument()
  })

  it('does not choose until every count has arrived', async () => {
    counts.value = { logs: 'loading', requests: 5 }
    renderAt('/cafe/review')
    expect(screen.getByRole('tab', { name: /^logs/i })).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByText(/queue showing/)).toBeNull()
    expect(screen.queryByText('requests queue')).toBeNull()
  })

  it('sends old Logs & Counts links to their tab, keeping the date', async () => {
    renderAt('/cafe/review?queue=logs-counts&view=counts&date=2026-10-14')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/cafe/review?queue=counts&date=2026-10-14'))
    expect(await screen.findByText('logs-counts queue showing counts')).toBeInTheDocument()
    cleanup()
    renderAt('/cafe/review?queue=logs-counts')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/cafe/review?queue=logs'))
    cleanup()
    renderAt('/cafe/review?view=counts')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/cafe/review?queue=counts'))
  })

  it('a tab writes its queue to the address; Logs and Counts share the date, other tabs start clean', async () => {
    const user = userEvent.setup()
    renderAt('/cafe/review?queue=logs&date=2026-10-14&log=abc')
    await user.click(screen.getByRole('tab', { name: /counts/i }))
    expect(screen.getByTestId('where')).toHaveTextContent('/cafe/review?queue=counts&date=2026-10-14')
    await user.click(screen.getByRole('tab', { name: /requests/i }))
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/cafe\/review\?queue=requests$/)
    expect(await screen.findByText('requests queue')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /^logs/i }))
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/cafe\/review\?queue=logs$/)
  })

  it('falls back to the default for a queue the viewer may not open', async () => {
    roles.value = ['supervisor']
    renderAt('/cafe/review?queue=failed-sends')
    expect(await screen.findByText('logs-counts queue showing logs')).toBeInTheDocument()
  })
})
