import { describe, expect, it } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { HomeDailyBrief } from './home-daily-brief'
import { HomeRegionCollection } from './home-region-collection'
import { buildHomeRegions } from './home-regions'
import type { StreamItem } from '@/lib/home-stream'

const item = (id: string, title = `Item ${id}`): StreamItem => ({
  id,
  title,
  route: `/work/tasks/${id}`,
  status: 'Blocked',
  meta: 'Wed 16 Sep',
  pic: { name: `PIC ${id}` },
  reason: { tone: 'blocked' },
})

const feed = <section aria-label="Signals">Signals feed</section>

async function renderBrief(
  overrides: Partial<Parameters<typeof buildHomeRegions>[0]> = {},
  options: { showFailedChecks?: boolean; layout?: 'focused' | 'overview' | 'list'; locale?: 'en' | 'id' } = {},
) {
  const regions = buildHomeRegions({
    overdue: [item('late', 'Fix the espresso grinder')],
    dueToday: [],
    blocked: [],
    myWork: [item('next', 'Confirm tomorrow\'s prep')],
    failedChecks: [{ ...item('check', 'Production log · morning'), route: '/cafe/log' }],
    failedChecksAdmitted: true,
    ...overrides,
  })
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(
      <I18nProvider initialLocale={options.locale ?? 'en'}>
        <MemoryRouter>
          <HomeDailyBrief
            regions={regions}
            feed={feed}
            objectives={<section aria-label="Objectives">Objectives</section>}
            cafeDoor={<section aria-label="Café">Café</section>}
            showFailedChecks={options.showFailedChecks}
            layout={options.layout ?? 'list'}
          />
        </MemoryRouter>
      </I18nProvider>,
    )
    await Promise.resolve()
    await Promise.resolve()
  })
  return utils
}

describe('HomeDailyBrief work queue', () => {
  it('keeps the featured urgent Task inside the ranked list with one truthful Open task action', async () => {
    await renderBrief()
    const urgent = await screen.findByRole('region', { name: /Needs you now/ })
    const taskLink = within(urgent).getByRole('link', { name: /Fix the espresso grinder/i })
    expect(taskLink).toHaveAttribute('href', '/work/tasks/late')
    expect(within(taskLink).getByText('Open task')).toBeInTheDocument()
    expect(within(urgent).getAllByRole('link', { name: /Fix the espresso grinder/i })).toHaveLength(1)
    expect(screen.queryByRole('region', { name: /Next task/i })).toBeNull()
  })

  it.each(['focused', 'overview', 'list'] as const)('$layout preserves every real section and its canonical destination', async (layout) => {
    await renderBrief({
      overdue: [item('late', 'Fix the espresso grinder')],
      dueToday: [item('today', 'Prepare the morning batch')],
      blocked: [item('blocked', 'Repair the mixer')],
      failedChecks: [{ ...item('check', 'Production log · morning'), route: '/cafe/log' }],
      myWork: [item('other', 'Confirm tomorrow\'s prep')],
      myWorkTotalItemCount: 1,
    }, { layout })

    const needsYou = await screen.findByRole('region', { name: /Needs you now/ })
    expect(within(needsYou).getByRole('link', { name: /Fix the espresso grinder/i })).toHaveAttribute('href', '/work/tasks/late')
    expect(within(needsYou).getByRole('link', { name: /Prepare the morning batch/i })).toBeInTheDocument()
    expect(within(needsYou).getByRole('link', { name: /Repair the mixer/i })).toBeInTheDocument()
    const failed = screen.getByRole('region', { name: /Failed checks/ })
    expect(within(failed).getByRole('link', { name: /Production log · morning/i })).toHaveAttribute('href', '/cafe/log')
    const other = screen.getByRole('region', { name: /Other open tasks/ })
    expect(within(other).getByRole('link', { name: /Confirm tomorrow's prep/i })).toHaveAttribute('href', '/work/tasks/other')
    expect(screen.getByRole('region', { name: 'Café' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Objectives' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Signals' })).toBeInTheDocument()
  })

  it.each(['en', 'id'] as const)('distinguishes an empty brief from a failed or pending read in %s', async (locale) => {
    await renderBrief({ overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [] }, { locale })
    expect(await screen.findByText(locale === 'en' ? "You're all caught up" : 'Semua beres')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: locale === 'en' ? 'View tasks →' : 'Lihat tugas →' })).toHaveAttribute('href', '/work/tasks?view=my-work')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each(['en', 'id'] as const)('does not announce an all-clear when a featured task is lifted out of its collection in %s', async (locale) => {
    const region = buildHomeRegions({ overdue: [item('sole')], dueToday: [], blocked: [], myWork: [], failedChecks: [], failedChecksAdmitted: false })[0]
    render(<I18nProvider initialLocale={locale}><MemoryRouter><HomeRegionCollection region={region} items={[]} liftedCount={1} /></MemoryRouter></I18nProvider>)
    expect(await screen.findByText(locale === 'en' ? 'No other tasks need your attention' : 'Tidak ada tugas lain yang perlu Anda perhatikan.')).toBeInTheDocument()
    expect(screen.queryByText(/caught up|semua beres/i)).toBeNull()
  })

  it.each(['overdue', 'blocked'] as const)('does not make a false all-clear when the sole %s Task is visible in every layout and language', async (kind) => {
    for (const locale of ['en', 'id'] as const) {
      for (const layout of ['focused', 'overview', 'list'] as const) {
        const noAttention = locale === 'en' ? 'No tasks need your attention' : 'Tidak ada tugas yang perlu perhatian Anda'
        const noFailed = locale === 'en' ? 'No failed checks' : 'Tidak ada pemeriksaan gagal'
        const task = item('sole', 'Fix the espresso grinder')
        const view = await renderBrief({
          overdue: kind === 'overdue' ? [task] : [], dueToday: [], blocked: kind === 'blocked' ? [task] : [],
          myWork: [], myWorkTotalItemCount: 0, failedChecks: [],
        }, { locale, layout })

        const urgent = await screen.findByRole('region', { name: /Needs you now|Perlu Anda sekarang/ })
        expect(urgent).toHaveAccessibleName(/(?:Needs you now|Perlu Anda sekarang).*1/)
        expect(within(urgent).getByRole('link', { name: /Fix the espresso grinder/i })).toBeInTheDocument()
        expect(screen.queryByText(noAttention)).toBeNull()
        expect(screen.queryByText(/caught up|semua beres/i)).toBeNull()
        expect(await screen.findByText(noFailed)).toBeInTheDocument()
        view.unmount()
      }
    }
  })

  it('caps rendered queue rows without subtracting the first row twice or using the shared count as a remainder', async () => {
    const urgentItems = Array.from({ length: 7 }, (_, index) => item(`urgent-${index + 1}`, `Urgent task ${index + 1}`))
    const otherItems = Array.from({ length: 9 }, (_, index) => item(`other-${index + 1}`, `Other task ${index + 1}`))
    await renderBrief({
      overdue: urgentItems, dueToday: [], blocked: [], myWork: otherItems.slice(0, 7), myWorkTotalItemCount: 9,
      failedChecks: [],
    })

    const urgent = await screen.findByRole('region', { name: /Needs you now.*7/ })
    expect(within(urgent).getAllByRole('link', { name: /Open task/i })).toHaveLength(5)
    expect(within(urgent).getByRole('link', { name: /5 shown.*2 more in Tasks/i })).toHaveAttribute('href', '/work/tasks?view=my-work')
    const other = screen.getByRole('region', { name: /Other open tasks.*9/ })
    expect(within(other).getByRole('link', { name: /7 shown.*2 more in Tasks/i })).toHaveAttribute('href', '/work/tasks?view=my-work')
    expect(within(other).queryByText(/16 open/)).toBeNull()
  })

  it('keeps read failures and loading separate from successful empty states', async () => {
    const regions = buildHomeRegions({
      overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [], failedChecksAdmitted: true,
      taskState: 'loading', failedChecksState: 'error',
    })
    render(
      <I18nProvider><MemoryRouter><HomeDailyBrief regions={regions} feed={feed} layout="focused" /></MemoryRouter></I18nProvider>,
    )
    const brief = screen.getByTestId('home-daily-brief')
    expect(within(brief).getAllByRole('status').length).toBeGreaterThan(0)
    expect(within(brief).queryByText('No tasks need your attention')).toBeNull()
    expect(within(brief).queryByText('No failed checks')).toBeNull()
    expect(await within(brief).findByRole('alert')).toHaveTextContent(/couldn't load/i)
  })

  it('omits failed checks when the viewer is not admitted, without removing task context', async () => {
    await renderBrief({}, { showFailedChecks: false })
    expect(screen.queryByRole('region', { name: /Failed checks/ })).toBeNull()
    expect(screen.getByRole('region', { name: /Needs you now/ })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Other open tasks/ })).toBeInTheDocument()
  })
})
