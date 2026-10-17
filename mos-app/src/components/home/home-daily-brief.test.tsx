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

async function renderBrief(
  overrides: Partial<Parameters<typeof buildHomeRegions>[0]> = {},
  showFailedChecks = true,
  locale: 'en' | 'id' = 'en',
) {
  const regions = buildHomeRegions({
    overdue: [item('late', 'Fix the espresso grinder')],
    dueToday: [],
    blocked: [],
    myWork: [item('next', 'Confirm tomorrow\'s prep')],
    failedChecks: [item('check', 'Production log · morning')],
    failedChecksAdmitted: showFailedChecks,
    ...overrides,
  })
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(
      <I18nProvider initialLocale={locale}>
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
      overdue: [item('late')], dueToday: [], blocked: [], myWork: [item('next')], failedChecks: [], failedChecksAdmitted: true,
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

  it('shows the next task, the attention and My work regions, and keeps Signals alongside', async () => {
    await renderBrief()
    expect(screen.getByRole('region', { name: 'Next task' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Needs you now/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^My open work/ })).toBeInTheDocument()
    expect(screen.getByTestId('supporting-feed')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('shows an explicit next action in the canonical next-task link', async () => {
    await renderBrief()
    const next = await screen.findByRole('region', { name: 'Next task' })
    const taskLink = await within(next).findByRole('link', { name: /fix the espresso grinder/i })

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

  it.each([
    { locale: 'en' as const, allClear: "You're all caught up", failedChecks: 'No failed checks', myWorkEmpty: /Nothing else open/i, viewTasks: 'View tasks →' },
    { locale: 'id' as const, allClear: 'Semua beres', failedChecks: 'Tidak ada pemeriksaan gagal', myWorkEmpty: /Tidak ada lagi yang terbuka/i, viewTasks: 'Lihat tugas →' },
  ])('distinguishes a genuinely empty brief from a pending or failed read in $locale', async ({ locale, allClear: allClearCopy, failedChecks, myWorkEmpty, viewTasks }) => {
    await renderBrief({ failedChecks: [], overdue: [], dueToday: [], blocked: [], myWork: [] }, true, locale)
    const allClear = await screen.findByText(allClearCopy)
    expect(await screen.findByText(failedChecks)).toBeInTheDocument()
    expect(await screen.findByText(myWorkEmpty)).toBeInTheDocument()
    const emptyStates = screen.getAllByTestId('empty-state')
    expect(emptyStates).toHaveLength(3)
    const allClearState = allClear.closest('[data-testid="empty-state"]') as HTMLElement
    expect(within(allClearState).getByRole('link', { name: viewTasks }))
      .toHaveAttribute('href', '/work/tasks?view=my-work')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it.each([
    { locale: 'en' as const, kind: 'overdue' as const, nextTask: 'Next task', otherTasks: 'No other tasks need your attention', allClear: "You're all caught up" },
    { locale: 'en' as const, kind: 'blocked' as const, nextTask: 'Next task', otherTasks: 'No other tasks need your attention', allClear: "You're all caught up" },
    { locale: 'id' as const, kind: 'overdue' as const, nextTask: 'Tugas berikutnya', otherTasks: 'Tidak ada tugas lain yang perlu Anda perhatikan.', allClear: 'Semua beres' },
    { locale: 'id' as const, kind: 'blocked' as const, nextTask: 'Tugas berikutnya', otherTasks: 'Tidak ada tugas lain yang perlu Anda perhatikan.', allClear: 'Semua beres' },
  ])('does not announce an all-clear when the sole $kind task is lifted as Next task in $locale', async ({ locale, kind, nextTask, otherTasks, allClear }) => {
    const task = item('sole', 'Fix the espresso grinder')
    await renderBrief({
      overdue: kind === 'overdue' ? [task] : [],
      dueToday: [],
      blocked: kind === 'blocked' ? [task] : [],
      myWork: [task],
      myWorkFullCount: 1,
      failedChecks: [],
    }, true, locale)

    const next = await screen.findByRole('region', { name: nextTask })
    expect(screen.getByRole('heading', { name: locale === 'en' ? /Needs you now.*\(1\)/ : /Perlu Anda sekarang.*\(1\)/ })).toBeInTheDocument()
    expect(within(next).getByRole('link', { name: /fix the espresso grinder/i })).toHaveAttribute('href', '/work/tasks/sole')
    expect(await screen.findByText(otherTasks)).toBeInTheDocument()
    expect(screen.queryByText(allClear)).toBeNull()
  })

  it('preserves state-kit loading and error states in the queue', async () => {
    const { rerender } = await renderBrief({ taskState: 'loading' })
    const brief = screen.getByTestId('home-daily-brief')
    expect(within(brief).getAllByRole('status')).toHaveLength(2)
    // The shared task projection keeps both task-derived lanes pending; failed checks resolved empty.
    expect(within(brief).getAllByText('(—)')).toHaveLength(2)
    expect(within(brief).getByRole('heading', { name: /^My open work/ })).toBeInTheDocument()

    const regions = buildHomeRegions({
      overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [], failedChecksAdmitted: true, taskState: 'error',
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

  it('labels the capped My work band with the rows it renders, never the full count (DD-COUNT-1)', async () => {
    await renderBrief({
      overdue: [], dueToday: [], blocked: [],
      myWork: [item('a', 'Wipe the machines'), item('b', 'Restock cups')],
      failedChecks: [], failedChecksAdmitted: false,
      myWorkFullCount: 9,
    })
    expect(screen.getByRole('heading', { name: /^My open work/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /2 shown · 9 open/ })).toBeInTheDocument()
    expect(screen.queryByText(/\b9 shown\b/)).toBeNull()
  })

  it('keeps the full My work collection door beside the wide main lane', async () => {
    await renderBrief({ myWork: [item('next', 'Confirm tomorrow\'s prep')], myWorkFullCount: 1 })
    expect(screen.getByRole('link', { name: /1 shown · 1 open/i })).toHaveAttribute(
      'href', '/work/tasks?view=my-work',
    )
  })
})
