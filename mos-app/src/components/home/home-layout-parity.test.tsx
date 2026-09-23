import { describe, expect, it } from 'vitest'
import { useEffect } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { buildHomeRegions, type HomeRegionId } from './home-regions'
import { HomeFocused } from './home-focused'
import { HomeOverview } from './home-overview'
import { HomeList } from './home-list'
import type { StreamItem } from '@/lib/home-stream'

const item = (id: string): StreamItem => ({
  id,
  title: `Item ${id}`,
  route: `/work/tasks/${id}`,
})

const regions = buildHomeRegions({
  overdue: [item('overdue')],
  dueToday: [],
  blocked: [],
  myWork: [item('mine')],
  failedChecks: [item('failed')],
  failedChecksAdmitted: true,
})

const emptyRegions = buildHomeRegions({
  overdue: [],
  dueToday: [],
  blocked: [],
  myWork: [],
  failedChecks: [],
  failedChecksAdmitted: true,
})

const switchRegions = buildHomeRegions({
  overdue: [item('needs')],
  dueToday: [],
  blocked: [],
  myWork: [item('mine-1'), item('mine-2')],
  failedChecks: [item('failed')],
  failedChecksAdmitted: true,
})

const many = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => item(`${prefix}${index + 1}`))

const cappedRegions = buildHomeRegions({
  overdue: many('overdue-', 3),
  dueToday: many('today-', 3),
  blocked: [],
  myWork: many('mine-', 6),
  failedChecks: many('failed-', 6),
  failedChecksAdmitted: true,
})
const allRecordIds = cappedRegions.flatMap((region) => region.items.map((entry) => entry.id))
const recordHref = /^\/work\/tasks\/[^?]+$/

const regionLabels: Record<HomeRegionId, string> = {
  'needs-you': 'Needs you now',
  'failed-checks': 'Failed checks',
  'my-work': 'My open work',
}

const regionRoutes: Record<HomeRegionId, string> = {
  'needs-you': '/work/tasks?view=my-work',
  'failed-checks': '/cafe/log',
  'my-work': '/work/tasks?view=my-work',
}

const feed = <div data-testid="signals-feed">Signals feed</div>

function renderLayout(node: React.ReactNode) {
  return render(
    <I18nProvider>
      <MemoryRouter>{node}</MemoryRouter>
    </I18nProvider>,
  )
}

function recordIds() {
  return screen.getAllByRole('link')
    .map((link) => link.getAttribute('href') ?? '')
    .filter((href) => recordHref.test(href))
    .map((href) => href.replace('/work/tasks/', ''))
    .sort()
}

describe('Home layout parity (NFR-924, FR-927, FR-928)', () => {
  it('AC-927: every layout keeps Signals and derives the approved row action per region', async () => {
    const user = userEvent.setup()
    for (const [node, workSelector, layout] of [
      [<HomeFocused key="focused" regions={regions} feed={feed} />, '[role="tabpanel"]', 'focused'],
      [<HomeOverview key="overview" regions={regions} feed={feed} />, '.home-bento', 'overview'],
      [<HomeList key="list" regions={regions} feed={feed} />, '.stream-group', 'list'],
    ] as const) {
      const { container, unmount } = renderLayout(node)
      expect(screen.getByTestId('signals-feed')).toBeInTheDocument()
      expect(container.querySelector(`${workSelector} [data-testid="signals-feed"]`)).toBeNull()

      const taskLink = await screen.findByRole('link', { name: /Item overdue/ })
      expect(within(taskLink).getByText('Open task')).toBeInTheDocument()

      if (layout === 'focused') {
        await user.click(screen.getByRole('tab', { name: /failed checks/i }))
      }
      const failedCheckLink = await screen.findByRole('link', { name: /Item failed/ })
      expect(within(failedCheckLink).getByText('Review')).toBeInTheDocument()
      expect(container.querySelectorAll('[data-collection-status="ready"]').length).toBeGreaterThan(0)
      expect(container.querySelectorAll('[data-testid^="home-region-collection-"]')).toHaveLength(
        layout === 'focused' ? 1 : 3,
      )
      unmount()
    }
  })

  it('AC-928: all three layouts name every empty region and show its zero count', () => {
    const names = Object.values(regionLabels)
    const hasZero = (element: HTMLElement | null) => /(?<!\d)0(?!\d)/.test(element?.textContent ?? '')

    {
      const { unmount } = renderLayout(<HomeFocused regions={emptyRegions} feed={feed} />)
      for (const name of names) {
        const tab = screen.getByRole('tab', { name: new RegExp(name, 'i') })
        expect(hasZero(tab), `Focused: ${name} must show zero`).toBe(true)
      }
      unmount()
    }

    {
      const { unmount } = renderLayout(<HomeOverview regions={emptyRegions} feed={feed} />)
      for (const name of names) {
        const heading = screen.getByRole('heading', { name }).parentElement
        expect(hasZero(heading), `Overview: ${name} must show zero`).toBe(true)
      }
      unmount()
    }

    {
      const { unmount } = renderLayout(<HomeList regions={emptyRegions} feed={feed} />)
      for (const name of names) {
        const band = screen.getByRole('region', { name })
        const heading = within(band).getByRole('heading', { name: new RegExp(name, 'i') })
        expect(hasZero(heading), `List: ${name} must show zero`).toBe(true)
      }
      unmount()
    }
  })

  it('AC-926 / FR-931: switching Focused tabs swaps collection hosts and leaves Signals mounted', async () => {
    const user = userEvent.setup()
    let feedMounts = 0
    function CountingFeed() {
      useEffect(() => { feedMounts += 1 }, [])
      return <div data-testid="signals-feed">Freezer alarm went off</div>
    }

    renderLayout(<HomeFocused regions={switchRegions} feed={<CountingFeed />} />)
    const feedBefore = screen.getByTestId('signals-feed')
    expect(feedMounts).toBe(1)
    expect(await screen.findByText('Item needs')).toBeInTheDocument()
    expect(screen.queryByText('Item mine-1')).toBeNull()
    expect(screen.queryByText('Item failed')).toBeNull()

    await user.click(screen.getByRole('tab', { name: /my open work/i }))
    expect(await screen.findByText('Item mine-1')).toBeInTheDocument()
    expect(screen.getByText('Item mine-2')).toBeInTheDocument()
    expect(screen.queryByText('Item needs')).toBeNull()
    expect(screen.queryByText('Item failed')).toBeNull()
    expect(screen.getByText('Freezer alarm went off')).toBeInTheDocument()
    expect(screen.getByTestId('signals-feed')).toBe(feedBefore)
    expect(feedMounts).toBe(1)
  })

  it('AC-925: Focused shows a count on every tab, including unselected tabs', () => {
    renderLayout(<HomeFocused regions={regions} feed={feed} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    for (const tab of tabs) expect(tab.textContent).toMatch(/\d/)
  })

  it('Focused tab arrows move both selection and focus', async () => {
    const user = userEvent.setup()
    renderLayout(<HomeFocused regions={regions} feed={feed} />)
    const tabs = screen.getAllByRole('tab')
    tabs[0].focus()
    await user.keyboard('{ArrowRight}')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveFocus()
    expect(await within(screen.getByRole('tabpanel')).findByText('Item failed')).toBeInTheDocument()
  })

  it('AC-929: List and Focused reach every record, while Overview links every truncated remainder', async () => {
    const user = userEvent.setup()

    {
      const { unmount } = renderLayout(<HomeList regions={cappedRegions} feed={feed} />)
      await screen.findByText('Item overdue-1')
      expect(recordIds()).toEqual([...allRecordIds].sort())
      unmount()
    }

    {
      const { unmount } = renderLayout(<HomeFocused regions={cappedRegions} feed={feed} />)
      const reached = new Set<string>()
      const tabs = screen.getAllByRole('tab')
      const expected = ['Item overdue-1', 'Item failed-1', 'Item mine-1']
      for (const [index, tab] of tabs.entries()) {
        await user.click(tab)
        await screen.findByText(expected[index])
        for (const id of recordIds()) reached.add(id)
      }
      expect([...reached].sort()).toEqual([...allRecordIds].sort())
      unmount()
    }

    {
      const { unmount } = renderLayout(<HomeOverview regions={cappedRegions} feed={feed} />)
      await screen.findByText('Item overdue-1')
      expect(recordIds().length).toBeLessThan(allRecordIds.length)
      for (const region of cappedRegions) {
        const tile = screen.getByRole('heading', { name: regionLabels[region.id] }).closest('section')!
        const rendered = within(tile).getAllByRole('link')
          .map((link) => link.getAttribute('href') ?? '')
          .filter((href) => recordHref.test(href))
        const hidden = region.items.length - rendered.length
        expect(hidden).toBeGreaterThan(0)
        if (region.drillTo!.count != null) {
          expect(within(tile).getByRole('link', {
            name: new RegExp(`${rendered.length} shown · ${region.drillTo!.count} open`, 'i'),
          })).toBeInTheDocument()
        }
        const through = within(tile).getByRole('link', {
          name: new RegExp(`${hidden} more in ${regionLabels[region.id]}`, 'i'),
        })
        expect(through).toHaveAttribute('href', regionRoutes[region.id])
      }
      unmount()
    }
  })
})
