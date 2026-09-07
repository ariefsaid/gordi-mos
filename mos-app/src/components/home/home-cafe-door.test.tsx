// HomeCafeDoor — ticket #757, Region 8 (FR-073 / AC-074).
//
// The member capture door: ONE `.btn-outline`-weight row — `Café <branch> · today — Opening
// checklist x/y · Log production →` — branch = the viewer's primary stream Team's branch,
// x/y = today's opening run at that branch, the whole row a link to /cafe.
//
// Layer: unit (RTL) with the facts read mocked — the branch/roll-up composition is owned by
// home-page.test.tsx; this file owns what the door renders from it.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { createElement } from 'react'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/cafe-opening', () => ({ getViewerCafeDoor: vi.fn() }))
import { getViewerCafeDoor, type CafeDoorFacts } from '@/lib/db/cafe-opening'
const mockGetDoor = vi.mocked(getViewerCafeDoor)

import { HomeCafeDoor } from './home-cafe-door'

function renderDoor() {
  return render(
    createElement(I18nProvider, null, createElement(MemoryRouter, null, createElement(HomeCafeDoor))),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AC-074: the Café door is one outline-weight row for the barista\'s primary stream branch', () => {
  it('renders `Café <branch> · today — Opening checklist x/y · Log production →` linking to /cafe', async () => {
    mockGetDoor.mockResolvedValue({ branchName: 'Gordi HQ', done: 3, total: 9 })
    renderDoor()

    const door = await screen.findByRole('link', { name: /café gordi hq/i })
    expect(door.getAttribute('href')).toBe('/cafe')
    // The whole row is the door: branch · today, then the run's x/y, then the route's verb.
    expect(door).toHaveTextContent('Café Gordi HQ · today')
    expect(door).toHaveTextContent('Opening checklist 3/9')
    expect(door).toHaveTextContent('Log production →')
    // `.btn-outline` weight — an ambient-tail door never carries the action blue (DESIGN.md).
    expect(door.className).toContain('btn-outline')
  })

  it('unstarted day renders the honest 0/0 — the row is still the way in', async () => {
    mockGetDoor.mockResolvedValue({ branchName: 'Gordi HQ', done: 0, total: 0 })
    renderDoor()

    const door = await screen.findByRole('link', { name: /café gordi hq/i })
    expect(door).toHaveTextContent('Opening checklist 0/0')
  })

  it('a viewer whose primary team is not a stream renders NO door — no branch, no row', async () => {
    mockGetDoor.mockResolvedValue(null)
    renderDoor()

    await waitFor(() => expect(mockGetDoor).toHaveBeenCalled())
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('a failed read renders the error state and Retry re-runs it — never a blank', async () => {
    mockGetDoor.mockRejectedValue(new Error('offline'))
    renderDoor()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't load this list/i)

    mockGetDoor.mockResolvedValue({ branchName: 'Gordi HQ', done: 0, total: 9 })
    const callsBefore = mockGetDoor.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(mockGetDoor.mock.calls.length).toBe(callsBefore + 1)
    await waitFor(() => expect(screen.getByText(/Opening checklist 0\/9/)).toBeInTheDocument())
  })

  it('a still-loading read renders the loading shell, never a confident 0', async () => {
    let resolveRead!: (facts: CafeDoorFacts | null) => void
    mockGetDoor.mockReturnValue(new Promise((resolve) => { resolveRead = resolve }))
    renderDoor()

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
    await act(async () => {
      resolveRead({ branchName: 'Gordi HQ', done: 0, total: 0 })
      await Promise.resolve()
    })
  })
})

describe('the door carries no count that is not tabular', () => {
  it('the checklist figure renders in the tabular scope (DESIGN.md Tabular-Numbers Rule)', async () => {
    mockGetDoor.mockResolvedValue({ branchName: 'Gordi HQ', done: 3, total: 9 })
    const { container } = renderDoor()
    const door = await screen.findByRole('link', { name: /café gordi hq/i })
    const count = within(door).getByText('Opening checklist 3/9')
    expect(count.className).toContain('tabular')
    expect(container).toBeInTheDocument()
  })
})
