import { describe, expect, it } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
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

async function renderBrief(overrides: Partial<Parameters<typeof buildHomeRegions>[0]> = {}, showFailedChecks = true) {
  const regions = buildHomeRegions({
    overdue: [item('late', 'Fix the espresso grinder')],
    dueToday: [],
    blocked: [],
    myWork: [item('next', 'Confirm tomorrow\'s prep')],
    failedChecks: [item('check', 'Production log · morning')],
    ...overrides,
  })
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(
      <I18nProvider>
        <MemoryRouter>
          <HomeDailyBrief regions={regions} feed={feed} showFailedChecks={showFailedChecks} layout="list" />
        </MemoryRouter>
      </I18nProvider>,
    )
    await Promise.resolve()
    await Promise.resolve()
  })
  return utils
}

describe('HomeDailyBrief', () => {
  it('labels the member assigned-work union as My open work', async () => {
    const regions = buildHomeRegions({
      overdue: [item('late')], dueToday: [], blocked: [], myWork: [item('next')], failedChecks: [],
    })
    render(
      <I18nProvider>
        <MemoryRouter>
          <HomeDailyBrief regions={regions} feed={feed} composition="member" layout="list" />
        </MemoryRouter>
      </I18nProvider>,
    )

    expect(await screen.findByRole('region', { name: /^My open work/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /^Needs you now/ })).toBeNull()
  })

  it('puts attention then My work in the main track and keeps Signals in a subordinate aside', async () => {
    const { container } = await renderBrief()
    const brief = screen.getByTestId('home-daily-brief')
    const main = brief.querySelector('.home-layout > div')!
    const aside = brief.querySelector('.home-brief-aside')!

    expect(container.querySelector('.stream-group')).not.toBeNull()
    expect(container.querySelector('[role="tablist"]')).toBeNull()
    expect(container.querySelector('.home-bento')).toBeNull()
    expect(main).toContainElement(screen.getByRole('heading', { name: /^Needs you now/ }))
    expect(main).toContainElement(screen.getByRole('heading', { name: /^My open work/ }))
    expect(aside).not.toContainElement(screen.getByRole('heading', { name: /^My open work/ }))
    expect(aside).toContainElement(screen.getByTestId('supporting-feed'))
    expect(main.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows an explicit next action in the canonical attention link', async () => {
    await renderBrief()
    const queue = await screen.findByRole('region', { name: /^Needs you now/ })
    const taskLink = await within(queue).findByRole('link', { name: /fix the espresso grinder/i })

    expect(taskLink).toHaveAttribute('href', '/work/tasks/late')
    expect(within(taskLink).getByText('Open task')).toBeInTheDocument()
  })

  it('keeps every resolved collection door on its canonical route', async () => {
    await renderBrief({
      overdue: [item('late', 'Fix the espresso grinder')],
      failedChecks: [item('check', 'Production log · morning')],
      myWork: [item('next', 'Confirm tomorrow\'s prep')],
      myWorkFullCount: 7,
    })

    expect(await screen.findByRole('link', { name: 'View tasks →' }))
      .toHaveAttribute('href', '/work/tasks?view=my-work')
    expect(await screen.findByRole('link', { name: 'Review logs →' }))
      .toHaveAttribute('href', '/cafe/log')
    expect(await screen.findByRole('link', { name: /1 shown · 7 open/i }))
      .toHaveAttribute('href', '/work/tasks?view=my-work')
  })

  it('distinguishes a genuinely empty brief from a pending or failed read', async () => {
    await renderBrief({ failedChecks: [], overdue: [], myWork: [] })
    expect(await screen.findAllByText("You're all caught up")).toHaveLength(1)
    expect(await screen.findByText('No failed checks')).toBeInTheDocument()
    expect(await screen.findByText(/Nothing else open/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('preserves state-kit loading and error states in the queue', async () => {
    const { rerender } = await renderBrief({ taskState: 'loading' })
    const brief = screen.getByTestId('home-daily-brief')
    expect(within(brief).getAllByRole('status')).toHaveLength(2)
    // The shared task projection keeps both task-derived lanes pending; failed checks resolved empty.
    expect(within(brief).getAllByText('—')).toHaveLength(2)
    expect(within(brief).getByRole('heading', { name: /^My open work/ })).toBeInTheDocument()

    const regions = buildHomeRegions({
      overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [], taskState: 'error',
    })
    rerender(
      <I18nProvider>
        <MemoryRouter>
          <HomeDailyBrief regions={regions} feed={feed} layout="list" />
        </MemoryRouter>
      </I18nProvider>,
    )
    expect((await within(screen.getByTestId('home-daily-brief')).findAllByRole('alert'))[0])
      .toHaveTextContent(/couldn't load/i)
  })

  it('can omit failed checks for viewers who cannot enter the café log route', async () => {
    await renderBrief({}, false)
    expect(screen.queryByRole('heading', { name: 'Failed checks' })).toBeNull()
    expect(screen.queryByText('Production log · morning')).toBeNull()
  })

  it('keeps a quiet failed-check status when the resolved collection is clear', async () => {
    await renderBrief({ failedChecks: [] })
    expect(await screen.findByRole('heading', { name: /^Failed checks/ })).toBeInTheDocument()
    expect(await screen.findByText('No failed checks')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Failed checks' })).toBeNull()
  })

  it('keeps the full My work collection door beside the wide main lane', async () => {
    await renderBrief({ myWork: [item('next', 'Confirm tomorrow\'s prep')], myWorkFullCount: 1 })
    expect(screen.getByRole('link', { name: /1 shown · 1 open/i })).toHaveAttribute(
      'href', '/work/tasks?view=my-work',
    )
  })
})
