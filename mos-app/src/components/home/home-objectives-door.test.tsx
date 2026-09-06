// HomeObjectivesDoor — ticket #757, Region 8 (spec docs/specs/home-shell-judgment.md).
//
// The door used to be a headed band with an explanatory paragraph and a single "See progress"
// link — audit finding F-5 ("Objectives door is prose, not data"). AC-070..072 restructure it
// into data rows: `Objective · x/y done →`, one row per Objective, the drill on EACH row, the
// `quiet` empty state at zero, error + retry on a failed read — and never prose.
//
// Layer: unit (RTL) with the roll-up read mocked — the view's arithmetic is owned by pgTAP
// (supabase/tests/mos_14_objective_rollup.sql); this file owns what the door renders from it.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { createElement } from 'react'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/objectives', () => ({ listObjectiveProgress: vi.fn() }))
import { listObjectiveProgress, type ObjectiveProgress } from '@/lib/db/objectives'
const mockListProgress = vi.mocked(listObjectiveProgress)

import { HomeObjectivesDoor } from './home-objectives-door'

function row(id: string, name: string, done: number, total: number) {
  return { id, name, done, total }
}

function renderDoor() {
  return render(
    createElement(I18nProvider, null, createElement(MemoryRouter, null, createElement(HomeObjectivesDoor))),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AC-070: the door renders one data row per Objective, drill on each row, no paragraph', () => {
  it('two Objectives with linked tasks render two rows with their x/y and a per-row drill', async () => {
    mockListProgress.mockResolvedValue([
      row('obj-1', 'Operational Excellence', 0, 3),
      row('obj-2', 'Q3 Growth', 0, 2),
    ])
    renderDoor()

    const door = await screen.findByRole('region', { name: 'Objectives' })
    const rows = await within(door).findAllByRole('link')
    expect(rows).toHaveLength(2)
    // Row anatomy: `<Objective> · x/y done →` — the whole row opens the Objective.
    expect(rows[0]).toHaveTextContent('Operational Excellence')
    expect(rows[0]).toHaveTextContent('0/3 done')
    expect(rows[1]).toHaveTextContent('Q3 Growth')
    expect(rows[1]).toHaveTextContent('0/2 done')
    // The drill is on EACH row (FR-070), into the Objectives collection, name-filtered to that
    // Objective — the one route the cascade record owns.
    expect(rows[0].getAttribute('href')).toBe(`/work/objectives?q=${encodeURIComponent('Operational Excellence')}`)
    expect(rows[1].getAttribute('href')).toBe(`/work/objectives?q=${encodeURIComponent('Q3 Growth')}`)
  })

  it('never renders explanatory prose — the paragraph is gone, not restyled', async () => {
    mockListProgress.mockResolvedValue([row('obj-1', 'Operational Excellence', 1, 3)])
    renderDoor()

    const door = await screen.findByRole('region', { name: 'Objectives' })
    await within(door).findByRole('link')
    // F-5's exact defect: a sentence explaining the roll-up model instead of data.
    expect(door).not.toHaveTextContent(/Progress rolls up/i)
    expect(door.querySelector('p')).toBeNull()
    // The old single "See progress" door link is gone with it — the rows are the way through.
    expect(within(door).queryByText(/see progress/i)).toBeNull()
  })
})

describe('AC-071: zero Objectives → quiet; failed read → error + retry', () => {
  it('a ready read with zero Objectives renders the quiet empty state — not prose, not a blank', async () => {
    mockListProgress.mockResolvedValue([])
    renderDoor()

    const empty = await screen.findByTestId('empty-state')
    expect(empty).toHaveAttribute('data-empty-variant', 'quiet')
    expect(empty).toHaveTextContent(/no objectives yet/i)
  })

  it('a failed read renders the error state and Retry re-runs the read', async () => {
    mockListProgress.mockRejectedValue(new Error('offline'))
    renderDoor()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't load this list/i)

    mockListProgress.mockResolvedValue([row('obj-1', 'Q3 Growth', 2, 2)])
    const callsBefore = mockListProgress.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(mockListProgress.mock.calls.length).toBe(callsBefore + 1)
    await waitFor(() => expect(screen.getByText('Q3 Growth')).toBeInTheDocument())
  })

  it('a still-loading read renders the loading shell, never a confident 0', async () => {
    let resolveRead!: (rows: ObjectiveProgress[]) => void
    mockListProgress.mockReturnValue(new Promise((resolve) => { resolveRead = resolve }))
    renderDoor()

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
    await act(async () => {
      resolveRead([])
      await Promise.resolve()
    })
  })
})

describe('issue-444 mechanism: the door is presentational about its audience', () => {
  it('renders for whoever mounts it — gating lives in HomePage, not here', async () => {
    mockListProgress.mockResolvedValue([row('obj-1', 'Q3 Growth', 0, 2)])
    renderDoor()
    expect(await screen.findByRole('region', { name: 'Objectives' })).toBeInTheDocument()
  })
})
