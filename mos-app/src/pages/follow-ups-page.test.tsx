import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { createElement, type ReactNode } from 'react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'
import { SHOW_FOLLOWUPS } from '@/config/features'
import { messages, type Locale } from '@/i18n/messages'
import { FollowUpsPage } from './follow-ups-page'

vi.mock('@/config/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/features')>()),
  SHOW_FOLLOWUPS: true,
}))
vi.mock('@/auth/use-auth')
vi.mock('@/lib/db/directory', () => ({ getBusinessUnits: vi.fn(), getPeople: vi.fn() }))
vi.mock('@/lib/db/follow-ups', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/follow-ups')>('@/lib/db/follow-ups')
  return { ...actual, listFollowUpsPage: vi.fn(), listFollowUpsWindow: vi.fn(), transitionFollowUp: vi.fn(), getFollowUp: vi.fn(), listFollowUpEventsPage: vi.fn() }
})

import { useAuth } from '@/auth/use-auth'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { getFollowUp, listFollowUpEventsPage, listFollowUpsPage, listFollowUpsWindow, transitionFollowUp, type FollowUpRow } from '@/lib/db/follow-ups'

const mockUseAuth = vi.mocked(useAuth)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockListFollowUpsPage = vi.mocked(listFollowUpsPage)
const mockListFollowUpsWindow = vi.mocked(listFollowUpsWindow)
const mockTransition = vi.mocked(transitionFollowUp)
const mockGetFollowUp = vi.mocked(getFollowUp)
const mockListEvents = vi.mocked(listFollowUpEventsPage)
const mockGetPeople = vi.mocked(getPeople)

function applyViewport(isDesktop: boolean) {
  // The record sits beside the queue only when the content track holds both; with no shell mounted
  // the track is the viewport.
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: isDesktop ? 1600 : 390 })
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(min-width: 768px)' || query === '(min-width: 1100px)' ? isDesktop : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

const row: FollowUpRow = {
  id: 'fu-1', org_id: 'org-1', counterparty: 'PT Big Buyer', kind: 'b2b_ar', lane: 'b2b_sales',
  source_invoice_ref: 'INV-1001', original_amount: 1000000, running_balance: 1000000, state: 'open',
  promise_date: null, issued_date: '2026-06-01', due_date: '2026-06-30', assigned_to: null, notes: null,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
}

function page(rows: FollowUpRow[], hasMore = false) {
  return { rows, hasMore, nextCursor: hasMore ? rows.at(-1)! : null }
}

const viewer: AuthState = {
  status: 'authenticated',
  viewer: {
    person: { id: 'p1', org_id: 'org-1', user_id: 'u1', full_name: 'Sales', email: null, must_change_password: false, archived_at: null, created_at: '', updated_at: '' },
    roles: [{ id: 'r1', org_id: 'org-1', business_unit_id: 'bu-sales', name: 'Sales Lead', reports_to_role_id: null, created_at: '', updated_at: '' }],
    isManager: false,
    accessRoles: [],
    affiliated: [],
  },
  signOut: vi.fn(),
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, createElement(I18nProvider, null, children))
}

function renderRoute(initialEntry: string, locale: Locale = 'en') {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(
        I18nProvider,
        { initialLocale: locale },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/money/follow-ups',
            element: SHOW_FOLLOWUPS
              ? createElement(FollowUpsPage)
              : createElement(Navigate, { to: '/', replace: true }),
          }),
        ),
      ),
    ),
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  applyViewport(true)
  mockUseAuth.mockReturnValue(viewer)
  mockGetBusinessUnits.mockResolvedValue([{ id: 'bu-sales', name: 'B2B Sales', code: 'b2b_sales' }])
  mockListFollowUpsPage.mockResolvedValue(page([row]))
  mockListFollowUpsWindow.mockResolvedValue(page([row]))
  mockTransition.mockResolvedValue(row)
  mockGetFollowUp.mockImplementation(async (id: string) => ({ ...row, id }))
  mockListEvents.mockResolvedValue({ rows: [], hasMore: false, nextCursor: null } as never)
  mockGetPeople.mockResolvedValue([])
})

describe('FollowUpsPage', () => {
  it('renders its page heading inside the shared workspace PageFamilyFrame', async () => {
    const { container } = renderRoute('/money/follow-ups')
    const heading = await screen.findByRole('heading', { level: 1 })
    expect(heading.closest('[data-testid="page-head"]')).toBeTruthy()
    expect(container.querySelector('main')).toHaveAttribute('data-page-family', 'workspace')
    expect(screen.getByText('Trust the financial figures and act on money exceptions.')).toBeInTheDocument()
  })

  it('opens the selected follow-up detail beside the queue', async () => {
    const user = userEvent.setup()
    renderRoute('/money/follow-ups')
    await user.click(await screen.findByRole('button', { name: 'Open follow-up INV-1001' }))

    expect(await screen.findByRole('complementary', { name: 'Record details' })).toHaveTextContent(row.counterparty)
  })

  it('shows only one lifecycle form for the selected record', async () => {
    const user = userEvent.setup()
    renderRoute('/money/follow-ups')
    await user.click(await screen.findByRole('button', { name: 'Open follow-up INV-1001' }))

    const detail = await screen.findByRole('complementary', { name: 'Record details' })
    await user.click(within(detail).getByRole('button', { name: 'Settle' }))

    expect(await screen.findAllByLabelText(/cash-in date/i)).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Submit' })).toHaveLength(1)
  })

  it('AC-520: renders queue rows with the money and state, and offers the lifecycle actions on the opened record', async () => {
    const user = userEvent.setup()
    render(createElement(FollowUpsPage), { wrapper })
    expect(await screen.findByText('PT Big Buyer')).toBeInTheDocument()
    // Ported for #192 (Tasks): renamed "AR Follow-up queue".
    expect(screen.getByRole('table', { name: 'AR Follow-up queue' })).toBeInTheDocument()
    expect(screen.getAllByText(/Rp/).length).toBeGreaterThan(0)
    expect(screen.getByText('Open')).toBeInTheDocument()
    // The queue is identity-led; the lifecycle actions live on the opened record.
    expect(screen.queryByRole('button', { name: 'Chase' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Open follow-up INV-1001' }))
    const detail = await screen.findByRole('complementary', { name: 'Record details' })
    expect(within(detail).getByRole('button', { name: 'Chase' })).toBeInTheDocument()
    expect(within(detail).getByRole('button', { name: 'Settle' })).toBeInTheDocument()
  })

  it('AC-520: renders a card list below 768px, not a horizontal-overflow table', async () => {
    applyViewport(false)
    render(createElement(FollowUpsPage), { wrapper })
    expect(await screen.findByText('PT Big Buyer')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByRole('button', { name: 'Open follow-up INV-1001' })).toBeInTheDocument()
  })

  it('keeps a long counterparty inside the phone card', async () => {
    applyViewport(false)
    const counterparty = 'PTSupercalifragilisticexpialidociousCounterpartyWithoutSpaces'
    mockListFollowUpsPage.mockResolvedValueOnce(page([{ ...row, counterparty }]))
    render(createElement(FollowUpsPage), { wrapper })

    const name = await screen.findByText(counterparty)
    expect(screen.getByRole('button', { name: 'Open follow-up INV-1001' })).toContainElement(name)
  })

  it('marks follow-up and overdue counts as partial while another page is available', async () => {
    const overdueRows = Array.from({ length: 50 }, (_, index) => ({
      ...row,
      id: `overdue-${index}`,
      counterparty: `Buyer ${index}`,
      due_date: '2000-01-01',
    }))
    mockListFollowUpsPage.mockResolvedValueOnce(page(overdueRows, true))
    renderRoute('/money/follow-ups?filter=overdue')

    await screen.findByText('Buyer 0')
    const pageHead = screen.getByTestId('page-head')
    expect(pageHead).toHaveTextContent('Loaded 50+ records')
    expect(pageHead).toHaveTextContent('50+ overdue')
  })

  it('DD-WAY-36: the queue renders the source ref as plain text — no link to the deleted Work path', async () => {
    renderRoute('/money/follow-ups')
    expect(await screen.findByText('PT Big Buyer')).toBeInTheDocument()
    expect(screen.getByText('INV-1001')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Read-only source/i })).toBeNull()
  })

  it('AC-521: keeps settle disabled until amount, cash-in date, and evidence are present', async () => {
    const user = userEvent.setup()
    render(createElement(FollowUpsPage), { wrapper })
    await user.click(await screen.findByRole('button', { name: 'Open follow-up INV-1001' }))
    const detail = await screen.findByRole('complementary', { name: 'Record details' })
    await user.click(within(detail).getByRole('button', { name: 'Settle' }))
    const submit = within(detail).getByRole('button', { name: 'Submit' })
    expect(submit).toBeDisabled()
    // Day-first entry (#1191): the person types the date the field asks for, dd/mm/yyyy.
    await user.type(within(detail).getByLabelText(/Cash-in date/), '02/07/2026')
    await user.type(within(detail).getByLabelText(/Evidence/), 'TRF-2')
    expect(submit).toBeEnabled()
  })

  it('AC-513: hides confirm from a non-finance chaser', async () => {
    mockListFollowUpsPage.mockResolvedValue(page([{ ...row, state: 'settled', running_balance: 0 }]))
    const user = userEvent.setup()
    render(createElement(FollowUpsPage), { wrapper })
    await user.click(await screen.findByRole('button', { name: 'Open follow-up INV-1001' }))
    const detail = await screen.findByRole('complementary', { name: 'Record details' })
    expect(within(detail).getAllByText('Settled').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
  })

  it.each((['manager', 'ops_lead', 'supervisor'] as const).flatMap((accessRole) =>
    (['en', 'id'] as const).map((locale) => [accessRole, locale] as const),
  ))('%s without a queue lane sees no follow-up actions in %s', async (accessRole, locale) => {
    mockUseAuth.mockReturnValue({
      ...viewer,
      viewer: { ...viewer.viewer, roles: [], accessRoles: [accessRole] },
    })
    const user = userEvent.setup()
    renderRoute('/money/follow-ups', locale)
    await user.click(await screen.findByRole('button', { name: /INV-1001/ }))

    const actions = screen.getByRole('region', { name: messages[locale]['followUps.actions'] })
    expect(within(actions).getByText(messages[locale]['moneyB.followups.noActions'])).toBeInTheDocument()
    for (const actionKey of ['chase', 'promise', 'partial', 'settle'] as const) {
      expect(within(actions).queryByRole('button', { name: messages[locale][`followUps.action.${actionKey}`] })).not.toBeInTheDocument()
    }
  })

  it.each((['finance', 'admin'] as const).flatMap((accessRole) =>
    (['en', 'id'] as const).map((locale) => [accessRole, locale] as const),
  ))('%s can confirm a settled follow-up in %s', async (accessRole, locale) => {
    mockUseAuth.mockReturnValue({
      ...viewer,
      viewer: { ...viewer.viewer, roles: [], accessRoles: [accessRole] },
    })
    mockListFollowUpsPage.mockResolvedValue(page([{ ...row, state: 'settled', running_balance: 0 }]))
    const user = userEvent.setup()
    renderRoute('/money/follow-ups', locale)
    await user.click(await screen.findByRole('button', { name: /INV-1001/ }))

    expect(await screen.findByRole('button', { name: messages[locale]['followUps.action.confirm'] })).toBeInTheDocument()
  })

  it.each([
    ['en', 'Confirm'],
    ['id', 'Konfirmasi'],
  ] as const)('AC-513: finance can confirm a settled follow-up in %s', async (locale, confirmLabel) => {
    mockUseAuth.mockReturnValue({ ...viewer, viewer: { ...viewer.viewer, accessRoles: ['finance'] } })
    mockListFollowUpsPage.mockResolvedValue(page([{ ...row, state: 'settled', running_balance: 0 }]))
    const user = userEvent.setup()
    renderRoute('/money/follow-ups', locale)
    await user.click(await screen.findByRole('button', { name: /INV-1001/ }))

    const detail = await screen.findByRole('complementary')
    expect(await within(detail).findByRole('button', { name: confirmLabel })).toBeVisible()
  })

  it.each([
    ['admin', true],
    ['member', false],
  ] as const)('AC-514: %s %s the all-lane chase bypass without a Business Unit role', async (role, canChase) => {
    mockUseAuth.mockReturnValue({ ...viewer, viewer: { ...viewer.viewer, roles: [], accessRoles: [role] } })
    const user = userEvent.setup()
    renderRoute('/money/follow-ups')
    await user.click(await screen.findByRole('button', { name: /INV-1001/ }))

    const detail = await screen.findByRole('complementary')
    if (canChase) expect(await within(detail).findByRole('button', { name: 'Chase' })).toBeVisible()
    else expect(within(detail).queryByRole('button', { name: 'Chase' })).toBeNull()
  })

  it('hides Load more when the follow-up total is exactly one page', async () => {
    mockListFollowUpsPage.mockResolvedValueOnce(page(Array.from({ length: 50 }, (_, index) => ({ ...row, id: `fu-${index}`, counterparty: `Buyer ${index}` }))))
    render(createElement(FollowUpsPage), { wrapper })
    await screen.findByText('Buyer 0')
    expect(screen.queryByRole('button', { name: /Load more/ })).toBeNull()
  })

  it('loads the next keyset page from an accessible button and preserves rows when that read fails', async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({ ...row, id: `fu-${index + 1}`, counterparty: `Buyer ${index + 1}` }))
    mockListFollowUpsPage.mockResolvedValueOnce(page(firstPage, true))
    mockListFollowUpsPage.mockRejectedValueOnce(new Error('network down'))
    mockListFollowUpsPage.mockResolvedValueOnce(page([{ ...row, id: 'fu-51', counterparty: 'Buyer 51' }]))
    const user = userEvent.setup()
    render(createElement(FollowUpsPage), { wrapper })

    expect(await screen.findByText('Buyer 1')).toBeInTheDocument()
    const more = screen.getByRole('button', { name: /Load more/ })
    await user.click(more)
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load more')
    expect(screen.getByText('Buyer 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Buyer 51')).toBeInTheDocument()
    expect(mockListFollowUpsPage.mock.calls[1][0]).toMatchObject({ before: firstPage.at(-1) })
  })

  it('keeps a second-page row visible after a lifecycle action reloads the queue', async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({ ...row, id: `fu-${index + 1}`, counterparty: `Buyer ${index + 1}` }))
    const laterRow = { ...row, id: 'fu-51', counterparty: 'Buyer 51' }
    mockListFollowUpsPage
      .mockResolvedValueOnce(page(firstPage, true))
      .mockResolvedValueOnce(page([laterRow]))
    mockListFollowUpsWindow.mockResolvedValueOnce(page([...firstPage, laterRow]))
    const user = userEvent.setup({ delay: null })
    render(createElement(FollowUpsPage), { wrapper })

    await screen.findByText('Buyer 1')
    await user.click(screen.getByRole('button', { name: /Load more/ }))
    const later = await screen.findByRole('row', { name: /Buyer 51/ })
    await user.click(within(later).getByRole('button', { name: /Open follow-up/ }))
    const detail = await screen.findByRole('complementary', { name: 'Record details' })
    await user.click(within(detail).getByRole('button', { name: 'Settle' }))
    await user.type(within(detail).getByLabelText(/Cash-in date/), '02/07/2026')
    await user.type(within(detail).getByLabelText(/Evidence/), 'TRF-51')
    await user.click(within(detail).getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(mockTransition).toHaveBeenCalledWith('fu-51', 'settle', expect.objectContaining({ amount: row.running_balance, evidence: 'TRF-51' })))
    expect(await screen.findByRole('row', { name: /Buyer 51/ })).toBeInTheDocument()
  })

  it('uses shared state-kit for loading, empty, and error states', async () => {
    mockListFollowUpsPage.mockReturnValueOnce(new Promise(() => {}))
    const loading = render(createElement(FollowUpsPage), { wrapper })
    expect(loading.container.querySelector('.skeleton-rows')).toBeTruthy()
    expect(screen.getByTestId('page-head')).not.toHaveTextContent('Overdue:')
    loading.unmount()

    mockListFollowUpsPage.mockResolvedValueOnce(page([]))
    const empty = render(createElement(FollowUpsPage), { wrapper })
    await waitFor(() => expect(screen.getByText('No follow-ups in your lane')).toBeInTheDocument())
    expect(empty.container.querySelector('.empty-state')).toBeTruthy()
    empty.unmount()

    mockListFollowUpsPage.mockRejectedValueOnce(new Error('network down'))
    const errorView = render(createElement(FollowUpsPage), { wrapper })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load follow-ups"))
    expect(screen.getByTestId('page-head')).not.toHaveTextContent('Overdue:')
    expect(screen.queryByText(/network down/)).toBeNull()
    expect(errorView.container.querySelector('.error-state')).toBeTruthy()
  })
})
