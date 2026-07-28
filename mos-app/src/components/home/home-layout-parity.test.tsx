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
