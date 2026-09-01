import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { OverlayHostProvider } from '@/shell/overlay-host'
import type { UseNotifications } from '@/hooks/useNotifications'
import type { NotificationRow } from '@/lib/db/notifications'

vi.mock('@/hooks/useNotifications', () => ({ useNotifications: vi.fn() }))
import { useNotifications } from '@/hooks/useNotifications'
import { InboxPage } from './inbox-page'

const mockUseNotifications = vi.mocked(useNotifications)

function notification(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'n-1',
    severity: 'info',
    title: 'Task assigned',
    body: 'Review budget',
    metadata: { entity: { type: 'task', id: 'task-1', route: '/tasks/task-1' } },
    read_at: null,
    created_at: '2026-07-07T00:00:00Z',
    ...overrides,
  }
}

function hookState(overrides: Partial<UseNotifications> = {}): UseNotifications {
  return {
    notifications: [],
    unreadCount: 0,
    loading: false,
    error: null,
    markRead: vi.fn(),
    markHandled: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  }
}

function renderPage() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <InboxPage />
      </MemoryRouter>
    </I18nProvider>,
  )
}

function renderHostedPage() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <OverlayHostProvider>
          <InboxPage />
        </OverlayHostProvider>
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseNotifications.mockReturnValue(hookState())
})

describe('InboxPage — shared state kit', () => {
  it('loading: renders the shared skeleton state instead of an empty inbox', () => {
    mockUseNotifications.mockReturnValue(hookState({ loading: true }))
    const { container } = renderPage()

    // The connected triage body owns the loading grammar: a busy status region over the shared
    // skeleton rows — never a bare empty/"caught up" surface while data is still in flight.
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('.skeleton-rows')).not.toBeNull()
    expect(screen.queryByText(/caught up/i)).not.toBeInTheDocument()
  })

  it('error: renders the shared retryable ErrorState and calls refresh', () => {
    const refresh = vi.fn()
    mockUseNotifications.mockReturnValue(hookState({ error: 'load failed', refresh }))
    renderPage()

    expect(screen.getByText(/couldn't load inbox/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(refresh).toHaveBeenCalled()
  })

  it('empty: renders the shared quiet EmptyState caught-up copy', () => {
    renderPage()

    const emptyState = screen.getByTestId('empty-state')
    expect(emptyState).toHaveAttribute('data-empty-variant', 'quiet')
    expect(screen.getByText(/caught up/i)).toBeInTheDocument()
    expect(emptyState.querySelector('.empty-state-icon')).not.toBeNull()
    expect(emptyState.querySelector('.empty-title')).not.toBeNull()
    expect(emptyState.querySelector('.empty-copy')).not.toBeNull()
  })

  it('W4-3: empty state names the notification source and keeps the quiet archetype actionless', () => {
    renderPage()

    const emptyState = screen.getByTestId('empty-state')
    expect(emptyState).toHaveAttribute('data-empty-variant', 'quiet')
    expect(screen.getByText(/attention/i)).toBeInTheDocument()
    // The quiet empty state itself carries no call-to-action (no push-to-act when caught up); the
    // only controls on the surface are the persistent filter chips, never an empty-state CTA/link.
    expect(emptyState.querySelector('.empty-actions')).toBeNull()
    expect(within(emptyState).queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('populated: renders the notification list without the home surface wash', () => {
    mockUseNotifications.mockReturnValue(hookState({ notifications: [notification()] }))
    const { container } = renderPage()

    expect(screen.getByRole('list', { name: /inbox/i })).toBeInTheDocument()
    expect(container.querySelector('.content-header')).not.toBeNull()
    expect(container.querySelector('main')?.style.backgroundImage).toBe('')
  })

  it('AC-V3-002: page-owned Inbox records mount through the inbox collection host slot', () => {
    mockUseNotifications.mockReturnValue(hookState({ notifications: [notification()] }))
    renderHostedPage()

    fireEvent.click(screen.getByRole('button', { name: /Task assigned/ }))
    expect(document.querySelector('[data-overlay-host][data-overlay-owner="inbox"]')).toBeTruthy()
    expect(document.querySelector('.record-panel-chrome')).toBeTruthy()
  })
})

// Census R2 DO-1 (F-INBOX-1): the `.record-split` grid reserves a 360px/44% right track the moment
// it is applied, so it must exist only at >=1100px AND while a record is actually open — the same
// gate Signals/Tasks use. At rest (or on phone/tablet) triage owns the full width: no resting dead
// void, no ~80px crushed queue.
describe('DO-1 — the triage list is never squashed by an empty record track', () => {
  function stubMatchMedia(split: boolean) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query.includes('1100') ? split : false,
        media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      }),
    })
  }

  it('at rest (no record open) the page applies no .record-split track at any width', () => {
    stubMatchMedia(true)
    mockUseNotifications.mockReturnValue(hookState({ notifications: [notification()] }))
    const { container } = renderHostedPage()
    expect(container.querySelector('.record-split')).toBeNull()
    // The dead companion class is gone too — it never had CSS.
    expect(container.querySelector('.inbox-page-split')).toBeNull()
  })

  it('>=1100px with a record open: the split track appears so the record sits beside the list', () => {
    stubMatchMedia(true)
    mockUseNotifications.mockReturnValue(hookState({ notifications: [notification()] }))
    const { container } = renderHostedPage()
    fireEvent.click(screen.getByRole('button', { name: /Task assigned/ }))
    expect(container.querySelector('.record-split')).not.toBeNull()
  })

  it('below 1100px a record open never squashes the list — the host owns a modal instead', () => {
    stubMatchMedia(false)
    mockUseNotifications.mockReturnValue(hookState({ notifications: [notification()] }))
    const { container } = renderHostedPage()
    fireEvent.click(screen.getByRole('button', { name: /Task assigned/ }))
    expect(container.querySelector('.record-split')).toBeNull()
  })
})

// AC-005 (FR-005, #547): Given the Inbox page at 390px, When the page head renders, Then the
// help glyph is a child of the title row, not a following block. jsdom does no layout, so the
// test encodes title-row membership the way the shared grammar defines it: the head opts into
// the meta-inline mode, and that mode retracts the phone fling (own full-width row, last order)
// in page-head.css — the same css-guard grammar page-head.test.tsx uses.
describe('AC-005 — the help glyph rides in the title row at 390 (FR-005)', () => {
  it('the head opts into meta-inline and the glyph is the meta slot the title row owns', () => {
    const { container } = renderPage()
    const head = container.querySelector('[data-testid="page-head"]')!
    expect(head).toHaveClass('content-header--meta-inline')
    const meta = head.querySelector('.ch-meta')!
    expect(meta.children).toHaveLength(1)
    expect(meta.querySelector('.help-tip-anchor button')).not.toBeNull()
  })

  it('the shared grammar keeps that meta in the title row at phone width — no full-width fling', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/shell/page-head.css'), 'utf8')
    const phone = css.slice(css.indexOf('@media (max-width: 767.98px)'))
    const rule = /\.content-header--meta-inline \.ch-meta\s*\{[^}]*\}/.exec(phone)?.[0]
    expect(rule, 'the meta-inline mode must override the phone fling').toBeDefined()
    expect(rule).toMatch(/order:\s*0/)
    expect(rule).toMatch(/flex:\s*none/)
    // Same specificity as the generic fling (.content-header .ch-meta), so cascade order
    // decides: the override must appear AFTER it inside the same media block.
    expect(phone.indexOf('.content-header--meta-inline .ch-meta'))
      .toBeGreaterThan(phone.indexOf('.content-header .ch-meta'))
  })
})
