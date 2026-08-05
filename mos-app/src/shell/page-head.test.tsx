/**
 * PageHead — the single shared page header (RI-IA-1). Two presentations:
 *  - default (prose): 24px title + optional meta/subtitle (My Week / Updates / Ops)
 *  - content (list/DB-view): the mockup `.content-header` chrome — entity icon +
 *    title + a count pill + a right-aligned inline action (mock-shell-and-table.html
 *    `.content-header` / `.ch-count` / `.ch-action`). Used by the Tasks workspace.
 *
 * Goal-oracle: both presentations expose ONE accessible heading + the page-head
 * testid (RI-IA-1), and the content variant renders the count pill + inline action.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { PageHead } from './page-head'

function pageHeadCss() {
  return readFileSync(resolve(process.cwd(), 'src/shell/page-head.css'), 'utf8')
}

describe('PageHead — shared header invariant (RI-IA-1)', () => {
  it('default (prose) renders the page-head testid + an h1 title', () => {
    render(<PageHead title="My Week" />)
    expect(screen.getByTestId('page-head')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'My Week' })).toBeInTheDocument()
  })

  it('default still renders the meta slot beside the title', () => {
    render(<PageHead title="Daily Log" meta={<span>3 entries</span>} />)
    expect(screen.getByText('3 entries')).toBeInTheDocument()
  })

  it('renders one job sentence and keeps one level-one heading', () => {
    render(
      <PageHead
        title="Tasks"
        jobSentence="Find and update the tasks your Team owns."
      />,
    )
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getAllByText('Find and update the tasks your Team owns.')).toHaveLength(1)
  })
})

describe('PageHead — content-header variant (mockup chrome)', () => {
  it('preserves the E7 orientation subtitle as a full-width secondary line', () => {
    const { container } = render(
      <PageHead variant="content" title="Good afternoon, Arief" subtitle="Director" />,
    )
    expect(screen.getByText('Director')).toBeInTheDocument()
    expect(container.querySelector('.ch-subtitle')).toHaveTextContent('Director')
  })

  it('renders the page-head testid + an h1 title (RI-IA-1 holds in content variant)', () => {
    render(<PageHead variant="content" title="Tasks" count={42} />)
    expect(screen.getByTestId('page-head')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /tasks/i })).toBeInTheDocument()
  })

  it('renders a count pill (.ch-count) carrying the count value', () => {
    const { container } = render(<PageHead variant="content" title="Tasks" count={42} />)
    const pill = container.querySelector('.ch-count')
    expect(pill).toBeTruthy()
    expect(pill!.textContent).toBe('42')
  })

  it('omits the count pill when count is null (loading/error)', () => {
    const { container } = render(<PageHead variant="content" title="Tasks" count={null} />)
    expect(container.querySelector('.ch-count')).toBeNull()
  })

  it('renders the right-aligned inline action node (.ch-action wrapper)', () => {
    const { container } = render(
      <PageHead variant="content" title="Tasks" count={5} action={<a href="/x">+ Create task</a>} />,
    )
    const action = container.querySelector('.ch-action')
    expect(action).toBeTruthy()
    expect(screen.getByRole('link', { name: /\+ create task/i })).toBeInTheDocument()
  })

  it('renders the content-header chrome row (.content-header) with NO surface-title glyph', () => {
    const { container } = render(<PageHead variant="content" title="Tasks" count={5} />)
    expect(container.querySelector('.content-header')).toBeTruthy()
    // Cohesion-debt 2026-07-19, item #5 (owner call): consistent = none. The
    // decorative entity glyph slot is removed — the breadcrumb + job-sentence name
    // the surface; inconsistent title icons were the "several apps" tell.
    expect(container.querySelector('.ch-icon')).toBeNull()
  })

  it('uses the shared 24px page-title scale for .ch-title', () => {
    const css = pageHeadCss()
    // 24px authored as the semantic token that resolves to exactly 24px (GUARD-VOCAB tokenization).
    expect(css).toMatch(/\.content-header \.ch-title\s*\{[^}]*font-size:\s*var\(--font-size-page-title\)/)
  })

  it('renders the meta slot (overdue/blocked subtotals) in the content variant', () => {
    const { container } = render(
      <PageHead variant="content" title="Tasks" count={5} meta={<span data-testid="m">2 overdue</span>} />,
    )
    expect(container.querySelector('[data-testid="m"]')).toBeTruthy()
  })
})

// ── The status row: a full-width second row inside the SAME header block ─────────────────────
// Home's compact day header (mockup home-priority-2026-07-28 `.hdr`) needs a state line + a
// progress track BELOW the title row without forking a second header grammar. One slot on the
// shared head, and the title steps down a rung to pay for the extra row inside the same ~70px.
describe('PageHead — content-header status row (the compact day-header composition)', () => {
  it('renders the status row as a full-width row inside the one header block', () => {
    const { container } = render(
      <PageHead variant="content" title="Good evening, Arief" statusRow={<span>Halfway.</span>} />,
    )
    const head = container.querySelector('.content-header')!
    const row = head.querySelector('.ch-status-row')
    expect(row).toHaveTextContent('Halfway.')
    expect(container.querySelectorAll('.content-header')).toHaveLength(1)
  })

  it('a head carrying a status row is compact — one header block, one title, still one h1', () => {
    const { container } = render(
      <PageHead variant="content" title="Good evening, Arief" statusRow={<span>Halfway.</span>} />,
    )
    expect(container.querySelector('.content-header')).toHaveClass('content-header--compact')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('a head with no status row is unchanged — no compact class, no empty row', () => {
    const { container } = render(<PageHead variant="content" title="Tasks" />)
    expect(container.querySelector('.content-header')).not.toHaveClass('content-header--compact')
    expect(container.querySelector('.ch-status-row')).toBeNull()
  })

  // The GOAL is "the extra row fits the same ~70px block, paid for by stepping the title DOWN a
  // rung on the one declared ladder". This used to pin the exact rung (`body-lg`), which turned out
  // to pin a defect: at 15px the greeting rendered SMALLER than the region headers inside it. The
  // goal-oracle is unchanged — the assertion now states it directly (tokenised, and below
  // page-title) instead of naming one rung. How far down it may step is the h1-vs-band-label rank
  // invariant, owned by components/home/guard-home-head-rank.css.test.ts.
  it('the compact title steps DOWN from page-title so the extra row fits the same block', () => {
    const css = pageHeadCss()
    const rung = /\.content-header--compact \.ch-title\s*\{[^}]*font-size:\s*var\((--font-size-[a-z-]+)\)/
      .exec(css)?.[1]
    expect(rung, 'the compact title must resolve to a declared font-size token').toBeDefined()
    expect(rung, 'a compact head that keeps the full page-title rung has not paid for its row')
      .not.toBe('--font-size-page-title')
    const ladder = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const px = (t: string) => Number(new RegExp(`${t}:\\s*([\\d.]+)px`).exec(ladder)![1])
    expect(px(rung!)).toBeLessThan(px('--font-size-page-title'))
  })

  it('the status row spans the full width of the header', () => {
    const css = pageHeadCss()
    expect(css).toMatch(/\.content-header \.ch-status-row\s*\{[^}]*flex:\s*0 0 100%/)
  })
})

describe('PageHead — the status row replaces the job sentence, never stacks on it', () => {
  it('a head with a status row renders the status row and NOT the job sentence', () => {
    const { container } = render(
      <PageHead
        variant="content"
        title="Good evening, Arief"
        jobSentence="What needs my attention right now?"
        statusRow={<span>Halfway.</span>}
      />,
    )
    expect(screen.getByText('Halfway.')).toBeInTheDocument()
    expect(screen.queryByText('What needs my attention right now?')).toBeNull()
    expect(container.querySelector('.page-head-job')).toBeNull()
  })

  it('a head with no status row still renders its job sentence, unchanged', () => {
    render(
      <PageHead variant="content" title="Tasks" jobSentence="Find and do the work I own." />,
    )
    expect(screen.getByText('Find and do the work I own.')).toBeInTheDocument()
  })
})
