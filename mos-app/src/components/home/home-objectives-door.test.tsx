import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { HomeObjectivesDoor } from './home-objectives-door'

function renderDoor(props: React.ComponentProps<typeof HomeObjectivesDoor> = {}) {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <HomeObjectivesDoor {...props} />
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('Home Objectives door', () => {
  it('renders useful Objective progress rows and drills by Objective name', () => {
    renderDoor({ rows: [{ id: 'o1', name: 'Q3 Growth', done: 2, total: 3 }] })
    const row = screen.getByRole('link', { name: /Q3 Growth.*2\/3 done/i })
    expect(row).toHaveAttribute('href', '/work/objectives?q=Q3%20Growth')
    expect(screen.queryByText(/Progress rolls up from each Objective/i)).toBeNull()
  })

  it('keeps loading, error/retry and empty states explicit', () => {
    const { rerender } = renderDoor({ state: 'loading' })
    expect(screen.getByRole('status', { name: 'Loading Objectives' })).toBeInTheDocument()

    const retry = vi.fn()
    rerender(
      <I18nProvider>
        <MemoryRouter>
          <HomeObjectivesDoor state="error" onRetry={retry} />
        </MemoryRouter>
      </I18nProvider>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load Objectives.")
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()

    rerender(
      <I18nProvider>
        <MemoryRouter>
          <HomeObjectivesDoor state="ready" rows={[]} />
        </MemoryRouter>
      </I18nProvider>,
    )
    expect(screen.getByText('No active Objectives yet.')).toBeInTheDocument()
  })
})
