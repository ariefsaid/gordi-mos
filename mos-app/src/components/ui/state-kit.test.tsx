import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmptyState, ErrorState, LoadingShell } from './state-kit'
import { I18nProvider } from '@/i18n/I18nProvider'
import { messages } from '@/i18n/messages'

describe('EmptyState', () => {
  it('renders the quiet archetype with no action row', () => {
    render(
      <EmptyState
        variant="quiet"
        title="You're all caught up"
        copy="Anything that needs your attention will appear here."
      />,
    )

    const emptyState = screen.getByTestId('empty-state')
    expect(emptyState).toHaveAttribute('data-empty-variant', 'quiet')
    expect(emptyState).toHaveAttribute('role', 'region')
    expect(screen.getByText("You're all caught up")).toBeInTheDocument()
    expect(screen.queryByText('Refresh')).not.toBeInTheDocument()
    expect(emptyState.querySelector('.empty-actions')).toBeNull()
  })

  it('renders the next-step archetype with one clear action', () => {
    render(
      <EmptyState variant="next-step" title="No log entries yet today." copy="Add the first one.">
        <button type="button">+ Add log entry</button>
      </EmptyState>,
    )

    const emptyState = screen.getByTestId('empty-state')
    expect(emptyState).toHaveAttribute('data-empty-variant', 'next-step')
    expect(emptyState.querySelectorAll('.empty-state-icon, .empty-title, .empty-copy, .empty-actions')).toHaveLength(4)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('renders the awaiting archetype with a muted retry note and one action', () => {
    render(
      <EmptyState
        variant="awaiting"
        title="No pushes yet"
        copy={messages.en['kitchen.pushes.empty.copy']}
        note="Pull again to check for new push activity."
      >
        <button type="button">Refresh</button>
      </EmptyState>,
    )

    const emptyState = screen.getByTestId('empty-state')
    expect(emptyState).toHaveAttribute('data-empty-variant', 'awaiting')
    expect(emptyState.querySelector('.empty-note')).not.toBeNull()
    expect(screen.getByText('Nothing has been sent to the outlet system today.')).toBeInTheDocument()
    expect(emptyState).not.toHaveTextContent(/ESB|outbox/i)
    expect(screen.getByText(/pull again to check for new push activity/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /refresh/i })).toHaveLength(1)
  })

  it('renders the blank archetype — empty BY DESIGN, so neither ✓ nor ↻', () => {
    render(<EmptyState variant="blank" title="Not in this slice yet" copy="Roastery lands later." />)

    const emptyState = screen.getByTestId('empty-state')
    expect(emptyState).toHaveAttribute('data-empty-variant', 'blank')
    // The glyph carries meaning: ✓ claims an earned all-clear and ↻ claims pending work. A route
    // that has never had a data source is neither.
    expect(emptyState.querySelector('.empty-state-glyph')!.textContent).toBe('—')
  })

  it('defaults the title to h3 and honours an explicit heading level', () => {
    const { unmount } = render(<EmptyState title="Default" />)
    expect(screen.getByRole('heading', { level: 3, name: 'Default' })).toBeInTheDocument()
    unmount()

    // A caller whose EmptyState sits directly under the page h1 raises it, so the outline does
    // not skip a level.
    render(<EmptyState title="Raised" headingLevel={2} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Raised' })).toBeInTheDocument()
  })

  // Ported for #192 (Tasks): RecordViewer's empty body (record-viewer.tsx) sits inside the
  // record panel/page's own already-labelled landmark — a nested `region` here would be a
  // redundant landmark a screen-reader user has to tab past to reach the same content twice.
  it('drops the region landmark and its labelling when nested', () => {
    render(<EmptyState variant="blank" title="No fields yet" nested />)
    const emptyState = screen.getByTestId('empty-state')
    expect(emptyState).not.toHaveAttribute('role')
    expect(emptyState).not.toHaveAttribute('aria-labelledby')
    // The title itself still renders — only the landmark wrapper is dropped.
    expect(screen.getByRole('heading', { name: 'No fields yet' })).toBeInTheDocument()
  })

  it('keeps the region landmark by default (nested omitted)', () => {
    render(<EmptyState variant="blank" title="Still a landmark" />)
    expect(screen.getByRole('region', { name: 'Still a landmark' })).toBeInTheDocument()
  })
})

describe('LoadingShell — the one loading grammar', () => {
  function renderShell(ui: React.ReactNode) {
    return render(<I18nProvider>{ui}</I18nProvider>)
  }

  it('announces itself as a busy status region with a localized label', () => {
    renderShell(<LoadingShell />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    // SkeletonRows alone is aria-hidden, so without this region a screen reader gets silence
    // while a code-split route's chunk downloads.
    expect(status).toHaveAccessibleName('Loading…')
    expect(status.querySelectorAll('.skeleton-row')).toHaveLength(3)
  })

  it('takes a row count and an override label', () => {
    renderShell(<LoadingShell count={5} label="Loading the review queue" />)
    const status = screen.getByRole('status')
    expect(status).toHaveAccessibleName('Loading the review queue')
    expect(status.querySelectorAll('.skeleton-row')).toHaveLength(5)
  })
})

// #359 — ErrorState's retry label comes from the catalog, not a literal 'Retry'.
// 25 of 31 call sites pass no retryLabel, so the default IS the app's retry copy.
describe('ErrorState — localized retry default (#359)', () => {
  it('defaults the retry label to common.retry (en: "Try again", never the literal "Retry")', () => {
    render(<ErrorState message="Something failed" onRetry={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('an explicit retryLabel still wins over the default', () => {
    render(<ErrorState message="Something failed" onRetry={vi.fn()} retryLabel="Reload" />)
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })

  describe('id locale', () => {
    beforeEach(() => localStorage.setItem('mos.locale', 'id'))
    afterEach(() => localStorage.clear())

    it('renders "Coba lagi" with no per-call-site work', () => {
      render(
        <I18nProvider>
          <ErrorState message="Gagal" onRetry={vi.fn()} />
        </I18nProvider>,
      )
      expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument()
      expect(screen.queryByText(/try again|retry/i)).toBeNull()
    })
  })
})
