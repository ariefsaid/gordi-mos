// Home polish contract — the region body must be HONEST in every arrangement.
//
// Three defects this file pins, all found by driving the rendered Home (Focused / Overview /
// List) at 1440 and 390:
//   1. a ready-but-empty region rendered NOTHING — a blank tab body (Focused), a hollow
//      ~90px card (Overview) and a dangling "MENTIONS · 0" heading with no content (List).
//      `home-regions.ts` deliberately keeps zero-count regions "so an empty region is
//      distinguishable from a hidden one (FR-929)" — a silent void does not distinguish it.
//   2. the reason mark repeated the region's own name ("Check failed" on every row of
//      "Failed checks"). `stream-reason.tsx` already documents that case as `style='none'`
//      and the plumbing was built but never wired. DESIGN.md Don't: "Don't repeat a value
//      under a control that the row or card already renders as its own column/field."
//   3. Overview truncates a region to its top rows and said nothing about the remainder —
//      invisible at 2 items, a lie by omission at the volume OD-V4-7 exists for.
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { MemoryRouter } from 'react-router-dom'
import { HomeFocused } from './home-focused'
import { HomeOverview } from './home-overview'
import { HomeList } from './home-list'
import { buildHomeRegions } from './home-regions'
import type { StreamItem } from '@/lib/home-stream'

const item = (id: string, extra: Partial<StreamItem> = {}): StreamItem => ({
  id, title: `Item ${id}`, route: `/work/tasks/${id}`, ...extra,
})

const FEED = <div data-testid="signals-feed">feed</div>

function renderLayout(node: React.ReactNode) {
  return render(<I18nProvider><MemoryRouter>{node}</MemoryRouter></I18nProvider>)
}

describe('FR-929: a ready-but-empty region says so, in every arrangement', () => {
  const regions = buildHomeRegions({
    overdue: [item('a')], dueToday: [], blocked: [],
    myWork: [], failedChecks: [], mentions: [],
  })

  it('Overview names the empty region AND states it is clear (never a hollow card)', () => {
    renderLayout(<HomeOverview regions={regions} feed={FEED} />)
    const mentions = screen.getByRole('heading', { name: /mentions/i }).closest('section')!
    expect(within(mentions).getByText(/all caught up/i)).toBeInTheDocument()
  })

  it('List names the empty region AND states it is clear (never a dangling heading)', () => {
    renderLayout(<HomeList regions={regions} feed={FEED} />)
    const mentions = screen.getByRole('region', { name: /mentions/i })
    expect(within(mentions).getByText(/all caught up/i)).toBeInTheDocument()
  })

  it('Focused states it is clear when an empty tab is selected (never a blank body)', async () => {
    const user = userEvent.setup()
    renderLayout(<HomeFocused regions={regions} feed={FEED} />)
    await user.click(screen.getByRole('tab', { name: /mentions/i }))
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
  })

  it('my-work uses its own copy — "nothing else open", not a generic all-clear', () => {
    renderLayout(<HomeList regions={regions} feed={FEED} />)
    const myWork = screen.getByRole('region', { name: /my work today/i })
    expect(within(myWork).getByText(/nothing else open/i)).toBeInTheDocument()
  })

  it('a region WITH items shows no all-clear line', () => {
    renderLayout(<HomeList regions={regions} feed={FEED} />)
    const needsYou = screen.getByRole('region', { name: /needs you now/i })
    expect(within(needsYou).queryByText(/all caught up/i)).not.toBeInTheDocument()
  })
})

describe("DESIGN.md Don't: a row's reason never repeats the region's own name", () => {
  const regions = buildHomeRegions({
    overdue: [item('a', { reason: { tone: 'overdue', days: 8 } })],
    dueToday: [], blocked: [], myWork: [],
    failedChecks: [item('c', { reason: { tone: 'check' } })],
    mentions: [item('m', { reason: { tone: 'mention' } })],
  })

  it('a "Failed checks" row does not also say "Check failed"', () => {
    renderLayout(<HomeList regions={regions} feed={FEED} />)
    const band = screen.getByRole('region', { name: /failed checks/i })
    expect(within(band).queryByText(/check failed/i)).not.toBeInTheDocument()
  })

  it('a "Mentions" row does not also say "Mentions you"', () => {
    renderLayout(<HomeList regions={regions} feed={FEED} />)
    const band = screen.getByRole('region', { name: /mentions/i })
    expect(within(band).queryByText(/mentions you/i)).not.toBeInTheDocument()
  })

  it('keeps the reason where it ADDS information the region name does not carry', () => {
    renderLayout(<HomeList regions={regions} feed={FEED} />)
    const band = screen.getByRole('region', { name: /needs you now/i })
    expect(within(band).getByText(/overdue · 8d/i)).toBeInTheDocument()
  })
})

describe('Overview states the remainder it does not render', () => {
  const many = Array.from({ length: 9 }, (_, i) => item(`n${i}`))
  const regions = buildHomeRegions({
    overdue: many, dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
  })

  it('a truncated tile says how many more there are', () => {
    renderLayout(<HomeOverview regions={regions} feed={FEED} />)
    const tile = screen.getByRole('heading', { name: /needs you now/i }).closest('section')!
    expect(within(tile).getByText(/5 more/i)).toBeInTheDocument()
  })

  it('List renders every row, so it states no remainder', () => {
    renderLayout(<HomeList regions={regions} feed={FEED} />)
    const band = screen.getByRole('region', { name: /needs you now/i })
    expect(within(band).queryByText(/more/i)).not.toBeInTheDocument()
    expect(within(band).getAllByRole('link')).toHaveLength(9)
  })
})

describe('a11y: Home region headings sit directly under the page h1 (no level skip)', () => {
  const regions = buildHomeRegions({
    overdue: [item('a')], dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
  })

  it('Overview tile names are h2', () => {
    renderLayout(<HomeOverview regions={regions} feed={FEED} />)
    expect(screen.getByRole('heading', { level: 2, name: /needs you now/i })).toBeInTheDocument()
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
  })

  it('List band labels are h2', () => {
    renderLayout(<HomeList regions={regions} feed={FEED} />)
    expect(screen.getByRole('heading', { level: 2, name: /needs you now/i })).toBeInTheDocument()
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
  })
})

// ── DIV-G5 (spec §7 · NFR-924): a region in error or still loading states NO count ────────────
// Measured on the rendered Home with the tasks read returning 500: Focused's tabs read
// ["Needs you now 0", "Failed checks 2", "Mentions 0", "My work today 0"] while the selected
// region showed the error beneath them. All three arrangements read the same `region.count`, so
// all three told the same falsehood. The count must be ABSENT — an em-dash, never a `0`.
describe('DIV-G5: a region whose read has not succeeded shows no count, in every arrangement', () => {
  const broken = buildHomeRegions({
    overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
    taskState: 'error', failedChecksState: 'loading', mentionsState: 'error',
  })

  it('Focused states no number on a tab whose region is errored or loading', () => {
    renderLayout(<HomeFocused regions={broken} feed={FEED} />)
    for (const name of [/needs you now/i, /failed checks/i, /mentions/i, /my work today/i]) {
      const tab = screen.getByRole('tab', { name })
      expect(tab.textContent).not.toMatch(/\d/)
      expect(within(tab).getByText('—')).toBeInTheDocument()
    }
  })

  it('Overview states no number on a tile whose region is errored or loading', () => {
    const { container } = renderLayout(<HomeOverview regions={broken} feed={FEED} />)
    const counts = [...container.querySelectorAll('.home-tile-count')]
    expect(counts).toHaveLength(4)
    for (const c of counts) {
      expect(c.textContent).not.toMatch(/\d/)
      expect(c.textContent).toContain('—')
    }
  })

  it('List states no number in a band header whose region is errored or loading', () => {
    renderLayout(<HomeList regions={broken} feed={FEED} />)
    for (const name of [/needs you now/i, /failed checks/i, /mentions/i, /my work today/i]) {
      const heading = screen.getByRole('heading', { level: 2, name })
      expect(heading.textContent).not.toMatch(/\d/)
      expect(heading.textContent).toContain('—')
    }
  })

  it('the absent count is announced, never a bare em-dash glyph', () => {
    renderLayout(<HomeList regions={broken} feed={FEED} />)
    expect(screen.getAllByText(/not available yet/i).length).toBe(4)
  })

  it('a region whose read SUCCEEDED still states its number', () => {
    const ok = buildHomeRegions({
      overdue: [item('a'), item('b')], dueToday: [], blocked: [],
      myWork: [], failedChecks: [], mentions: [],
    })
    renderLayout(<HomeList regions={ok} feed={FEED} />)
    expect(screen.getByRole('heading', { level: 2, name: /needs you now/i }).textContent)
      .toContain('2')
  })
})

// ── DIV: the needs-you reason is TEXT, not a filled chip ──────────────────────────────────────
// A filled amber `Overdue · 8d` pill on every row of the band marks everything and therefore marks
// nothing, and it out-shouts the row titles it exists to rank. `stream-reason.tsx` documents
// `style='text'` for exactly this case ("the overdue age"); DESIGN.md § Row status as text (v4).
describe('DESIGN.md § Row status as text: needs-you renders its reason as toned text', () => {
  const regions = buildHomeRegions({
    overdue: [item('a', { reason: { tone: 'overdue', days: 8 } })],
    dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
  })

  it('the overdue age is still stated (the information the band label cannot carry)', () => {
    renderLayout(<HomeList regions={regions} feed={FEED} />)
    expect(screen.getByText(/overdue · 8d/i)).toBeInTheDocument()
  })

  it('it carries the flat (fill-dropped) treatment, not the filled chip', () => {
    renderLayout(<HomeList regions={regions} feed={FEED} />)
    expect(screen.getByText(/overdue · 8d/i)).toHaveClass('stream-reason--flat')
  })
})

// ── DIV: the empty region uses the shared all-clear EmptyState, not a bare muted <p> ───────────
describe('a ready-and-empty region uses the shared all-clear EmptyState primitive', () => {
  const regions = buildHomeRegions({
    overdue: [item('a')], dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
  })

  it('List renders the state-kit empty state with the compact all-clear treatment', () => {
    renderLayout(<HomeList regions={regions} feed={FEED} />)
    const band = screen.getByRole('region', { name: /^mentions$/i })
    const empty = within(band).getByTestId('empty-state')
    expect(empty).toHaveClass('stream-all-clear')
    expect(within(empty).getByText(/all caught up/i)).toBeInTheDocument()
  })

  it('Overview renders it too — one empty grammar, not one per arrangement', () => {
    renderLayout(<HomeOverview regions={regions} feed={FEED} />)
    const tile = screen.getByRole('heading', { name: /^mentions$/i }).closest('section')!
    expect(within(tile).getByTestId('empty-state')).toHaveClass('stream-all-clear')
  })
})

// ── DIV: Overview's lead tile is keyed to the REGION, so the tonal lift can name needs-you ─────
describe('Overview tiles carry their region id', () => {
  const regions = buildHomeRegions({
    overdue: [item('a')], dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
  })

  it('every tile names its region (both wide tiles are distinguishable)', () => {
    const { container } = renderLayout(<HomeOverview regions={regions} feed={FEED} />)
    expect([...container.querySelectorAll('.home-tile')].map((t) => t.getAttribute('data-region')))
      .toEqual(['needs-you', 'failed-checks', 'mentions', 'my-work'])
  })
})
