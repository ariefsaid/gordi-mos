import { describe, it, expect } from 'vitest'
import { useEffect } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { MemoryRouter } from 'react-router-dom'
import { HomeFocused } from './home-focused'
import { HomeOverview } from './home-overview'
import { HomeList } from './home-list'
import { buildHomeRegions, type HomeRegionId } from './home-regions'
import type { StreamItem } from '@/lib/home-stream'

const item = (id: string): StreamItem => ({
  id, title: `Item ${id}`, route: `/work/tasks/${id}`,
})

const regions = buildHomeRegions({
  overdue: [item('a')], dueToday: [], blocked: [],
  myWork: [item('b')], failedChecks: [item('c')], mentions: [],
})

// Every region EMPTY, every read succeeded — the fixture AC-928 is actually about ("a viewer whose
// regions are all empty"). The `regions` fixture above deliberately is not that.
const emptyRegions = buildHomeRegions({
  overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
})

// One region-distinguishable record in each region, so "only that region's records" (AC-926) is a
// question the DOM can answer: every title names the region it belongs to.
const switchRegions = buildHomeRegions({
  overdue: [item('od1')], dueToday: [], blocked: [],
  myWork: [item('mw1'), item('mw2')], failedChecks: [item('fc1')], mentions: [item('mn1')],
})

// Every region PAST Overview's OVERVIEW_TILE_ROWS cap (4) — the only fixture under which AC-929's
// reachability invariant means anything. A ≤4-item region never truncates, so a test built on one
// asserts the cap-free path and calls it parity.
const many = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => item(`${prefix}${i + 1}`))
const cappedRegions = buildHomeRegions({
  overdue: many('od', 3), dueToday: many('dt', 3), blocked: [], // needs-you = 6
  myWork: many('mw', 6), failedChecks: many('fc', 5), mentions: many('mn', 5),
})
const ALL_RECORD_IDS = cappedRegions.flatMap((r) => r.items.map((i) => i.id))
const RECORD_HREF = /^\/work\/tasks\/[^?]+$/
// The rendered names + destinations these regions carry (home-regions.ts REGION_ROUTE / messages.ts).
// Stated here rather than imported so a silent rename of either shows up as a red test.
const REGION_LABEL: Record<HomeRegionId, string> = {
  'needs-you': 'Needs you now',
  'failed-checks': 'Failed checks',
  mentions: 'Mentions',
  'my-work': 'My work today',
}
const REGION_ROUTE: Record<HomeRegionId, string> = {
  'needs-you': '/work/tasks?view=my-work',
  'failed-checks': '/cafe/log',
  mentions: '/inbox',
  'my-work': '/work/tasks?view=my-work',
}

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

  // ── AC-928 ────────────────────────────────────────────────────────────────────────────────────
  // "Given a viewer whose regions are ALL empty, when Home renders in ANY layout, then each region
  // is still named WITH A ZERO COUNT." The goal is the viewer's: an empty region must be
  // distinguishable from one that was never offered (FR-929) — which needs the NAME *and* the
  // number. The previous test asserted neither half of that: its fixture had items in three of the
  // four regions, it skipped Focused entirely, and `getByText(/mentions/i)` passes on a region
  // rendering no count at all. It could not have gone red on the defect it was written for.
  //
  // Each layout is asked in the shape the viewer actually reads it: Focused's counts live on the
  // tab strip (that is the whole safety argument for it being the default), Overview's in the tile
  // head beside the tile name, List's in the band label.
  it('AC-928: with every region empty, each region is still named AND carries its zero — in all three layouts', () => {
    const REGION_NAMES = ['Needs you now', 'Failed checks', 'Mentions', 'My work today']
    const hasZero = (el: HTMLElement | null) => /(?<!\d)0(?!\d)/.test(el?.textContent ?? '')

    // Focused — the count rides on every tab, selected or not.
    {
      const { unmount } = renderLayout(<HomeFocused regions={emptyRegions} feed={FEED} />)
      for (const name of REGION_NAMES) {
        const tab = screen.getByRole('tab', { name: new RegExp(name, 'i') })
        expect(hasZero(tab), `Focused: the "${name}" tab must state its zero, not just its name`).toBe(true)
      }
      unmount()
    }

    // Overview — the count sits in the tile head, beside the tile's own name.
    {
      const { unmount } = renderLayout(<HomeOverview regions={emptyRegions} feed={FEED} />)
      for (const name of REGION_NAMES) {
        const head = screen.getByRole('heading', { name }).parentElement
        expect(hasZero(head), `Overview: the "${name}" tile must state its zero`).toBe(true)
      }
      unmount()
    }

    // List — the count sits in the band label ("Mentions · 0").
    {
      const { unmount } = renderLayout(<HomeList regions={emptyRegions} feed={FEED} />)
      for (const name of REGION_NAMES) {
        const band = screen.getByRole('region', { name })
        // …the BAND LABEL heading specifically — an empty band also renders the all-clear's own
        // heading, and that one carries no count by design.
        const label = within(band).getByRole('heading', { name: new RegExp(name, 'i') })
        expect(hasZero(label), `List: the "${name}" band must state its zero`).toBe(true)
      }
      unmount()
    }
  })

  // ── AC-926 ────────────────────────────────────────────────────────────────────────────────────
  // "Given the Focused layout, when the viewer selects a different tab, then ONLY that region's
  // records render AND the Signals feed is unaffected." Both halves are the user's goal: Focused
  // exists to put one thing in front of them (so a stale region left behind would defeat it), and
  // the Signals column is a STANDING column in all three layouts (FR-928) — switching a work tab
  // must not disturb, blank or reload it. Previously only exercised incidentally, with nothing
  // asserting either half.
  //
  // "Unaffected" is asserted as the viewer would notice it: the same Signal still readable, and the
  // feed never re-mounted (a re-mount is the reload-flash / re-fetch defect, and it is invisible to
  // a content-only assertion because the same text comes back).
  it('AC-926: switching Focused\'s tab swaps the region records wholesale, and never disturbs the Signals feed', async () => {
    const user = userEvent.setup()
    let feedMounts = 0
    function CountingFeed() {
      useEffect(() => { feedMounts += 1 }, [])
      return <div data-testid="signals-feed">Freezer alarm went off</div>
    }
    renderLayout(<HomeFocused regions={switchRegions} feed={<CountingFeed />} />)

    const feedBefore = screen.getByTestId('signals-feed')
    expect(feedMounts).toBe(1)

    // At rest the lead region is up: its record is present and NO other region's record is.
    expect(screen.getByText('Item od1')).toBeInTheDocument()
    for (const other of ['Item mw1', 'Item mw2', 'Item fc1', 'Item mn1']) {
      expect(screen.queryByText(other), `"${other}" belongs to a region that is not selected`).toBeNull()
    }

    await user.click(screen.getByRole('tab', { name: /my work today/i }))

    // …and after the switch the swap is total, in both directions.
    expect(screen.getByText('Item mw1')).toBeInTheDocument()
    expect(screen.getByText('Item mw2')).toBeInTheDocument()
    for (const gone of ['Item od1', 'Item fc1', 'Item mn1']) {
      expect(screen.queryByText(gone), `"${gone}" is not in the region the viewer selected`).toBeNull()
    }

    // The Signals column is untouched: same Signal, same live node, never re-mounted.
    expect(screen.getByText('Freezer alarm went off')).toBeInTheDocument()
    expect(screen.getByTestId('signals-feed'), 'the feed must not be re-mounted by a tab switch').toBe(feedBefore)
    expect(feedMounts, 'a re-mount would re-fetch and flash the feed on every tab click').toBe(1)
  })

  it('AC-925: Focused shows a count on every tab, selected or not', () => {
    renderLayout(<HomeFocused regions={regions} feed={FEED} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(4)
    for (const tab of tabs) expect(tab.textContent).toMatch(/\d/)
  })

  // ── The tab strip is a real ARIA tab contract, not four buttons wearing tab roles ─────────────
  // `role="tab"` is a PROMISE about the keyboard: one stop for the whole strip, arrows to move
  // within it, and a panel the strip controls (WAI-ARIA APG § Tabs). Focused shipped the roles
  // without any of it — every tab in the Tab order, arrows dead — so keyboard/AT users could not
  // operate the DEFAULT Home layout. The prior guard here only counted tabs and checked each
  // contained a digit, so it could never have gone red on this.
  //
  // Same contract, same regression note as `components/dashboard/cut-toggle.tsx` (r5 F-4): moving
  // selection WITHOUT moving focus strands the user on a node whose tabIndex just dropped to -1.
  // Both halves are asserted below, because only asserting selection would pass that defect.
  it('ArrowRight moves BOTH the selection and the focus to the next tab', async () => {
    const user = userEvent.setup()
    renderLayout(<HomeFocused regions={regions} feed={FEED} />)
    const tabs = screen.getAllByRole('tab')
    tabs[0].focus()
    await user.keyboard('{ArrowRight}')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveFocus()
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false')
  })

  it('ArrowLeft wraps to the last tab, Home/End jump to the ends — focus following each time', async () => {
    const user = userEvent.setup()
    renderLayout(<HomeFocused regions={regions} feed={FEED} />)
    const tabs = screen.getAllByRole('tab')
    const last = tabs.length - 1
    tabs[0].focus()
    await user.keyboard('{ArrowLeft}')
    expect(tabs[last]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[last]).toHaveFocus()
    await user.keyboard('{Home}')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0]).toHaveFocus()
    await user.keyboard('{End}')
    expect(tabs[last]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[last]).toHaveFocus()
  })

  it('roving tabindex: the strip is ONE stop in the page Tab order, not four', () => {
    renderLayout(<HomeFocused regions={regions} feed={FEED} />)
    const tabs = screen.getAllByRole('tab')
    const tabbable = tabs.filter((tab) => tab.tabIndex === 0)
    expect(tabbable).toHaveLength(1)
    expect(tabbable[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('the region body is a tabpanel the selected tab controls and names', async () => {
    const user = userEvent.setup()
    renderLayout(<HomeFocused regions={regions} feed={FEED} />)
    const panel = screen.getByRole('tabpanel')
    const selected = screen.getByRole('tab', { selected: true })
    expect(selected).toHaveAttribute('aria-controls', panel.id)
    // Named BY the selected tab (so the name follows the switch), and that name is the region's.
    expect(panel).toHaveAttribute('aria-labelledby', selected.id)
    expect(panel).toHaveAccessibleName(/needs you now/i)
    // …and both the body AND the name follow the switch.
    expect(within(panel).getByText('Item a')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /my work today/i }))
    const switched = screen.getByRole('tabpanel')
    expect(within(switched).getByText('Item b')).toBeInTheDocument()
    expect(switched).toHaveAttribute('aria-labelledby', screen.getByRole('tab', { selected: true }).id)
    expect(switched).toHaveAccessibleName(/my work today/i)
  })

  // ── AC-929 / NFR-924 (AMENDED — see the spec's RATIFY-BEFORE-MERGE §10) ──────────────────────
  // As literally written ("the set of record ids rendered is identical across all three") the AC
  // CANNOT hold and must not: Overview caps each tile at OVERVIEW_TILE_ROWS (4) and states the
  // remainder as "N more →". The Director ruled that cap plus its link the intended behaviour —
  // the link is what makes the summary honest. So the invariant the parity requirement actually
  // protects is asserted instead:
  //
  //     NO LAYOUT IS THE REASON A RECORD IS UNREACHABLE.
  //     A region that truncates always offers the way through.
  //
  // The previous test could not have caught a violation of either reading: its fixture held ONE
  // item per region, i.e. strictly below the cap, so the truncation this AC exists to govern never
  // occurred; and it compared link HREFS (which include the drill/more links) rather than record
  // ids. This fixture deliberately runs every region PAST the cap.
  it('AC-929: no layout hides a record — List and Focused reach every one, Overview links to what it summarises', async () => {
    const user = userEvent.setup()
    const recordIds = () => screen.getAllByRole('link')
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => RECORD_HREF.test(href))
      .map((href) => href.replace('/work/tasks/', ''))
      .sort()

    // List — the most complete arrangement: nothing behind a click, so it renders the full set.
    {
      const { unmount } = renderLayout(<HomeList regions={cappedRegions} feed={FEED} />)
      expect(recordIds(), 'List renders every record directly').toEqual([...ALL_RECORD_IDS].sort())
      unmount()
    }

    // Focused — one region at a time, but each tab renders its region WHOLE, so walking the strip
    // reaches every record. (Nothing is capped away behind a tab.)
    {
      const { unmount } = renderLayout(<HomeFocused regions={cappedRegions} feed={FEED} />)
      const reached = new Set<string>()
      const tabCount = screen.getAllByRole('tab').length
      for (let i = 0; i < tabCount; i += 1) {
        await user.click(screen.getAllByRole('tab')[i])
        for (const id of recordIds()) reached.add(id)
      }
      expect([...reached].sort(), 'every record is reachable by walking the tab strip')
        .toEqual([...ALL_RECORD_IDS].sort())
      unmount()
    }

    // Overview — a SUMMARY by design. It may render fewer records, but every region it truncates
    // must name the remainder AND link to where those records live. A tile that swallowed items
    // silently would be the dead end this invariant forbids (Nielsen #3).
    {
      const { unmount } = renderLayout(<HomeOverview regions={cappedRegions} feed={FEED} />)
      const shown = recordIds()
      expect(shown.length, 'this fixture must actually exercise the cap, or the test proves nothing')
        .toBeLessThan(ALL_RECORD_IDS.length)

      for (const region of cappedRegions) {
        const tile = screen.getByRole('heading', { name: REGION_LABEL[region.id] }).closest('section')!
        const rendered = within(tile).getAllByRole('link')
          .map((a) => a.getAttribute('href') ?? '')
          .filter((href) => RECORD_HREF.test(href))
        const hidden = region.items.length - rendered.length
        expect(hidden, `${region.id}: the fixture must push this region past the cap`).toBeGreaterThan(0)

        // The way through: named with the honest remainder, pointed at the region's own destination.
        const through = within(tile).getByRole('link', {
          name: new RegExp(`${hidden} more in ${REGION_LABEL[region.id]}`, 'i'),
        })
        expect(through.getAttribute('href'), `${region.id}: the remainder link must lead somewhere real`)
          .toBe(REGION_ROUTE[region.id])
      }
      unmount()
    }
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
