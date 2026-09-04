import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { DueProcessRun } from '@/lib/db/processes.types'
import { DueRunsTrigger } from './due-runs-trigger'

const DUE_ROW: DueProcessRun = {
  work_line_id: 'wl-1', process_name: 'Café Opening',
  owning_team_id: 'team-1', team_name: 'Own Team',
  period_key: '2026-07-17', scheduled_date: '2026-07-17',
}

function renderTrigger(props: Partial<React.ComponentProps<typeof DueRunsTrigger>> = {}) {
  return render(
    <I18nProvider>
      <DueRunsTrigger due={[]} expanded={false} onToggle={() => {}} {...props} />
    </I18nProvider>,
  )
}

describe('DueRunsTrigger (design fix wave item 1)', () => {
  it('renders nothing when there is no due work', () => {
    renderTrigger({ due: [] })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders the labelled source count for three due runs, collapsed by default (aria-expanded=false)', () => {
    renderTrigger({ due: [DUE_ROW, DUE_ROW, DUE_ROW], expanded: false })
    const btn = screen.getByRole('button', { name: '3 runs due to start' })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
  })

  it('reflects expanded=true via aria-expanded and fires onToggle on click', () => {
    const onToggle = vi.fn()
    renderTrigger({ due: [DUE_ROW], expanded: true, onToggle })
    const btn = screen.getByRole('button', { name: '1 run due to start' })
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(btn)
    expect(onToggle).toHaveBeenCalled()
  })
})
