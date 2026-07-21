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
    expect(css).toMatch(/\.content-header \.ch-title\s*\{[^}]*font-size:\s*24px/)
  })

  it('renders the meta slot (overdue/blocked subtotals) in the content variant', () => {
    const { container } = render(
      <PageHead variant="content" title="Tasks" count={5} meta={<span data-testid="m">2 overdue</span>} />,
    )
    expect(container.querySelector('[data-testid="m"]')).toBeTruthy()
  })
})
