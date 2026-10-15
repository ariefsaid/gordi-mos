import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { HomeCafeDoorData } from '@/lib/db/home-cafe'
import { HomeCafeDoor } from './home-cafe-door'

const data: HomeCafeDoorData = {
  branchName: 'Gordi HQ',
  opening: {
    started: true,
    runId: 'run-1',
    rollup: {
      process_run_id: 'run-1', caption: 'Café Opening', scheduled_date: '2026-09-09',
      status: 'open', total: 3, open: 1, in_progress: 0, blocked: 0, done: 2,
      overdue: 0, pending_unresolved: 0, completion_pct: 66.7,
    },
  },
}

function renderDoor(props: React.ComponentProps<typeof HomeCafeDoor> = {}) {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <HomeCafeDoor {...props} />
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('Home Café door', () => {
  it('separates the opening view from the direct production log action', () => {
    renderDoor({ data })
    expect(screen.getByRole('link', { name: /Café Gordi HQ.*2\/3.*View opening/i }))
      .toHaveAttribute('href', '/cafe')
    const logLink = screen.getByRole('link', { name: /Log production/i })
    expect(logLink).toHaveAttribute("href", "/cafe")
    expect(logLink).toHaveClass('tap-floor')
  })

  it('keeps a not-started opening actionable without inventing a count', () => {
    renderDoor({ data: { ...data, opening: { started: false, runId: null, rollup: null } } })
    expect(screen.getByRole('link', { name: /not started.*View opening/i })).toHaveAttribute('href', '/cafe')
    expect(screen.getByRole('link', { name: /Log production/i })).toHaveAttribute("href", "/cafe")
    expect(screen.queryByText(/0\//)).toBeNull()
  })

  it('describes an empty started opening without a misleading zero-over-zero count', () => {
    renderDoor({ data: { ...data, opening: { ...data.opening, rollup: { ...data.opening.rollup!, total: 0, done: 0, open: 0, completion_pct: 0 } } } })
    expect(screen.getByRole('link', { name: /No opening tasks assigned yet.*View opening/i })).toHaveAttribute('href', '/cafe')
    expect(screen.queryByText(/0\/0/)).toBeNull()
  })

  it('distinguishes loading, error/retry and no-stream empty states', () => {
    const { rerender } = renderDoor({ state: 'loading' })
    expect(screen.getByRole('status', { name: 'Loading Café opening' })).toBeInTheDocument()

    const retry = vi.fn()
    rerender(
      <I18nProvider>
        <MemoryRouter>
          <HomeCafeDoor state="error" onRetry={retry} />
        </MemoryRouter>
      </I18nProvider>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load today's Café opening.")
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()

    rerender(
      <I18nProvider>
        <MemoryRouter>
          <HomeCafeDoor state="ready" data={null} />
        </MemoryRouter>
      </I18nProvider>,
    )
    expect(screen.getByText(/No Café opening is assigned/i)).toBeInTheDocument()
  })
})
