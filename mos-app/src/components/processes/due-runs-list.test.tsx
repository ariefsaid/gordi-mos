import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { DueProcessRun } from '@/lib/db/processes.types'
import { DueRunsList } from './due-runs-list'

const DUE_ROW: DueProcessRun = {
  work_line_id: 'wl-1', process_name: 'Café Opening',
  owning_team_id: 'team-1', team_name: 'Own Team',
  period_key: '2026-07-17', scheduled_date: '2026-07-17',
}

function renderList(props: Partial<React.ComponentProps<typeof DueRunsList>> = {}) {
  return render(
    <I18nProvider>
      <DueRunsList
        due={[DUE_ROW]}
        expanded={true}
        startingKey={null}
        startError={false}
        onStart={() => Promise.resolve()}
        {...props}
      />
    </I18nProvider>,
  )
}

describe('DueRunsList (design fix wave item 1)', () => {
  it('renders nothing when not expanded, even with due rows present', () => {
    renderList({ expanded: false })
    expect(screen.queryByText('Café Opening')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument()
  })

  it('renders nothing when there are no due rows, even when expanded', () => {
    renderList({ expanded: true, due: [] })
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('when expanded, renders each due row (process + team) with a Start action', () => {
    renderList()
    expect(screen.getByText('Café Opening')).toBeInTheDocument()
    expect(screen.getByText('Own Team')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start · Café Opening' })).toBeInTheDocument()
  })

  it('clicking Start calls onStart with the row', () => {
    const onStart = vi.fn().mockResolvedValue(undefined)
    renderList({ onStart })
    fireEvent.click(screen.getByRole('button', { name: 'Start · Café Opening' }))
    expect(onStart).toHaveBeenCalledWith(DUE_ROW)
  })

  it('shows an inline error (role=alert) when startError is true', () => {
    renderList({ startError: true })
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't start this run — try again.")
  })

  it('disables the Start button for the row currently starting', () => {
    renderList({ startingKey: 'wl-1:team-1:2026-07-17' })
    expect(screen.getByRole('button', { name: 'Start · Café Opening' })).toBeDisabled()
  })

  // AC-623 (docs/specs/occurrence-as-tasks.spec.md) — the due row's action is verb+object, never a
  // bare "Create"/"Start" (Rule 7/12, OD-58). Design fix wave item 5 FINAL DECISION: the visible
  // button text composes "Start · <process name>" (id: "Mulai · <name>") so the object is the
  // REAL job, not a repeated generic "run" — CSS clamps a long name (max-width + ellipsis).
  it('AC-623: the composed "Start · <process name>" label is verb+object, never a bare Create/Start', () => {
    renderList({ due: [{ ...DUE_ROW, process_name: 'Café HQ daily opening' }] })
    const btn = screen.getByRole('button', { name: 'Start · Café HQ daily opening' })
    expect(btn).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^create$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^start$/i })).not.toBeInTheDocument()
  })

  it('two rows with different process names each get their own distinct composed button name', () => {
    renderList({
      due: [
        { ...DUE_ROW, work_line_id: 'wl-1', process_name: 'Café Opening' },
        { ...DUE_ROW, work_line_id: 'wl-2', process_name: 'Café Closing' },
      ],
    })
    expect(screen.getByRole('button', { name: 'Start · Café Opening' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start · Café Closing' })).toBeInTheDocument()
  })
})
