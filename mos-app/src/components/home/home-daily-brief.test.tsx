import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { HomeDailyBrief } from './home-daily-brief'
import { buildHomeRegions } from './home-regions'
import type { StreamItem } from '@/lib/home-stream'

const item = (id: string, title = `Item ${id}`): StreamItem => ({
  id,
  title,
  route: `/work/tasks/${id}`,
})

const feed = <div data-testid="supporting-feed">Signals feed</div>

function renderBrief(overrides: Partial<Parameters<typeof buildHomeRegions>[0]> = {}, showFailedChecks = true) {
  const regions = buildHomeRegions({
    overdue: [item('late', 'Fix the espresso grinder')],
    dueToday: [],
    blocked: [],
    myWork: [item('next', 'Confirm tomorrow\'s prep')],
    failedChecks: [item('check', 'Production log · morning')],
    ...overrides,
  })
  return render(
    <I18nProvider>
      <MemoryRouter>
        <HomeDailyBrief regions={regions} feed={feed} showFailedChecks={showFailedChecks} />
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('HomeDailyBrief', () => {
  it('labels the member assigned-work union as My work today', () => {
    const regions = buildHomeRegions({
      overdue: [item('late')], dueToday: [], blocked: [], myWork: [item('next')], failedChecks: [],
    })
    render(
      <I18nProvider>
        <MemoryRouter>
          <HomeDailyBrief regions={regions} feed={feed} composition="member" />
        </MemoryRouter>
      </I18nProvider>,
    )

    expect(screen.getByRole('region', { name: /^My work today/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /^Needs you now/ })).toBeNull()
  })

  it('puts attention then My work in the main track and keeps Signals in a subordinate aside', () => {
    const { container } = renderBrief()
    const brief = screen.getByTestId('home-daily-brief')
    const main = brief.querySelector('.home-brief-main')!
    const aside = brief.querySelector('.home-brief-aside')!

    expect(container.querySelector('[role="tablist"]')).toBeNull()
    expect(container.querySelector('.home-bento')).toBeNull()
    expect(main).toContainElement(screen.getByRole('heading', { name: /^Needs you now/ }))
    expect(main).toContainElement(screen.getByRole('heading', { name: /^My work today/ }))
    expect(aside).not.toContainElement(screen.getByRole('heading', { name: /^My work today/ }))
    expect(aside).toContainElement(screen.getByTestId('supporting-feed'))
    expect(main.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows an explicit next action in the canonical attention link', () => {
    renderBrief()
    const queue = screen.getByRole('region', { name: /^Needs you now/ })
    const taskLink = within(queue).getByRole('link', { name: /fix the espresso grinder/i })

    expect(taskLink).toHaveAttribute('href', '/work/tasks/late')
    expect(within(taskLink).getByText('Open task')).toBeInTheDocument()
  })

  it('keeps every resolved collection door on its canonical route', () => {
    renderBrief({
      overdue: [item('late', 'Fix the espresso grinder')],
      failedChecks: [item('check', 'Production log · morning')],
      myWork: [item('next', 'Confirm tomorrow\'s prep')],
      myWorkFullCount: 7,
    })

    expect(screen.getByRole('link', { name: 'View tasks →' }))
      .toHaveAttribute('href', '/work/tasks?view=my-work')
    expect(screen.getByRole('link', { name: 'Review logs →' }))
      .toHaveAttribute('href', '/cafe/log')
    expect(screen.getByRole('link', { name: /my open tasks · 7/i }))
      .toHaveAttribute('href', '/work/tasks?view=my-work')
  })

  it('distinguishes a genuinely empty brief from a pending or failed read', () => {
    renderBrief({ failedChecks: [], overdue: [], myWork: [] })
    expect(screen.getByText("You're all caught up")).toBeInTheDocument()
    expect(screen.getByText('No failed checks')).toBeInTheDocument()
    expect(screen.getByText(/Nothing else open/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('preserves state-kit loading and error states in the queue', () => {
    const { rerender } = renderBrief({ taskState: 'loading' })
    const brief = screen.getByTestId('home-daily-brief')
    expect(within(brief).getAllByRole('status')).toHaveLength(2)
    expect(within(brief).getAllByText('—')).toHaveLength(2)

    const regions = buildHomeRegions({
      overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [], taskState: 'error',
    })
    rerender(
      <I18nProvider>
        <MemoryRouter>
          <HomeDailyBrief regions={regions} feed={feed} />
        </MemoryRouter>
      </I18nProvider>,
    )
    expect(within(screen.getByTestId('home-daily-brief')).getAllByRole('alert')[0])
      .toHaveTextContent(/couldn't load/i)
  })

  it('can omit failed checks for viewers who cannot enter the café log route', () => {
    renderBrief({}, false)
    expect(screen.queryByRole('heading', { name: 'Failed checks' })).toBeNull()
    expect(screen.queryByText('Production log · morning')).toBeNull()
  })

  it('keeps a quiet failed-check status when the resolved collection is clear', () => {
    renderBrief({ failedChecks: [] })
    expect(screen.getByText('Failed checks')).toBeInTheDocument()
    expect(screen.getByText('No failed checks')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Failed checks' })).toBeNull()
  })

  it('keeps the full My work collection door beside the wide main lane', () => {
    renderBrief({ myWork: [item('next', 'Confirm tomorrow\'s prep')], myWorkFullCount: 1 })
    expect(screen.getByRole('link', { name: /my open tasks · 1/i })).toHaveAttribute(
      'href', '/work/tasks?view=my-work',
    )
  })
})
