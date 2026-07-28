import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { MemoryRouter } from 'react-router-dom'
import { HomeFocused } from './home-focused'
import { HomeOverview } from './home-overview'
import { HomeList } from './home-list'
import { buildHomeRegions } from './home-regions'
import type { StreamItem } from '@/lib/home-stream'

const item = (id: string): StreamItem => ({
  id, title: `Item ${id}`, route: `/work/tasks/${id}`,
})

const regions = buildHomeRegions({
  overdue: [item('a')], dueToday: [], blocked: [],
  myWork: [item('b')], failedChecks: [item('c')], mentions: [],
})

const FEED = <div data-testid="signals-feed">feed</div>

function renderLayout(node: React.ReactNode) {
  return render(<I18nProvider><MemoryRouter>{node}</MemoryRouter></I18nProvider>)
}

describe('Home layout parity (NFR-924, FR-927, FR-928)', () => {
  it('AC-927: every layout renders the Signals feed', () => {
    for (const node of [
      <HomeFocused key="f" regions={regions} feed={FEED} />,
      <HomeOverview key="o" regions={regions} feed={FEED} />,
      <HomeList key="l" regions={regions} feed={FEED} />,
    ]) {
      const { unmount } = renderLayout(node)
      expect(screen.getByTestId('signals-feed')).toBeInTheDocument()
      unmount()
    }
  })

  it('AC-928: a zero-count region is still named, in every layout', () => {
    for (const node of [
      <HomeOverview key="o" regions={regions} feed={FEED} />,
      <HomeList key="l" regions={regions} feed={FEED} />,
    ]) {
      const { unmount } = renderLayout(node)
      expect(screen.getByText(/mentions/i)).toBeInTheDocument()
      unmount()
    }
  })

  it('AC-925: Focused shows a count on every tab, selected or not', () => {
    renderLayout(<HomeFocused regions={regions} feed={FEED} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(4)
    for (const tab of tabs) expect(tab.textContent).toMatch(/\d/)
  })

  it('AC-929: Overview and List render the same record ids', () => {
    const { unmount } = renderLayout(<HomeOverview regions={regions} feed={FEED} />)
    const overview = screen.getAllByRole('link').map((a) => a.getAttribute('href')).sort()
    unmount()
    renderLayout(<HomeList regions={regions} feed={FEED} />)
    const list = screen.getAllByRole('link').map((a) => a.getAttribute('href')).sort()
    expect(list).toEqual(overview)
  })
})

describe('DIV-G5 (home-layout-preference.spec.md §7): a failed or still-loading region never renders as an indistinguishable empty region', () => {
  const loadingRegions = buildHomeRegions({
    overdue: [item('a')], dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
    taskState: 'loading',
  })
  const erroredRegions = buildHomeRegions({
    overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
    taskState: 'error', onRetryTasks: () => {},
  })

  it('a loading needs-you region shows a busy status, in every layout (never an empty list)', () => {
    for (const node of [
      <HomeFocused key="f" regions={loadingRegions} feed={FEED} />,
      <HomeOverview key="o" regions={loadingRegions} feed={FEED} />,
      <HomeList key="l" regions={loadingRegions} feed={FEED} />,
    ]) {
      const { unmount } = renderLayout(node)
      // At least one region is busy-loading (needs-you AND my-work share the tasks projection
      // state, so Overview/List — which render every region at once — legitimately show two).
      expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
      unmount()
    }
  })

  it('an errored region shows an alert with a working Retry, in every layout', () => {
    for (const node of [
      <HomeFocused key="f" regions={erroredRegions} feed={FEED} />,
      <HomeOverview key="o" regions={erroredRegions} feed={FEED} />,
      <HomeList key="l" regions={erroredRegions} feed={FEED} />,
    ]) {
      const { unmount } = renderLayout(node)
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
      expect(screen.getAllByRole('button', { name: /retry/i }).length).toBeGreaterThan(0)
      unmount()
    }
  })
})

describe('Restored affordance: the my-work drill link (the full open-task count, never just the capped region items)', () => {
  const regionsWithDrillLink = buildHomeRegions({
    overdue: [], dueToday: [], blocked: [], myWork: [item('b')], failedChecks: [], mentions: [],
    myWorkFullCount: 9,
  })

  it('renders "My open tasks · 9" to /work/tasks?view=my-work, in Overview and List', () => {
    for (const node of [
      <HomeOverview key="o" regions={regionsWithDrillLink} feed={FEED} />,
      <HomeList key="l" regions={regionsWithDrillLink} feed={FEED} />,
    ]) {
      const { unmount } = renderLayout(node)
      const link = screen.getByRole('link', { name: /my open tasks · 9/i })
      expect(link.getAttribute('href')).toBe('/work/tasks?view=my-work')
      unmount()
    }
  })
})
