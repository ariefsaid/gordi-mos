// Money dashboard specimens — the Layer-2 battery debt for the census r2/r3 Money work:
// KPITile (value/delta/foot variants, className passthrough, the r3 mix-tile span-2
// narrow-grid state, the nowrap value clamp), WindowRangeFields (inline desktop pair
// vs the DO-21 phone range row, custom-active vs quiet-empty), and the GlobalToolbar
// phone rail + range-row composition (no service imports — pure props, no mocks).
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, userEvent, within } from 'storybook/test'
import { KPITile } from '@/components/dashboard/kpi-tile'
import { GlobalToolbar } from '@/components/dashboard/global-toolbar'
import { WindowRangeFields } from '@/components/dashboard/window-selector'
import type { WindowSpec } from '@/lib/dashboard'
import '@/pages/dashboard-page.css'

export const v3Matrix = {
  jobs: [
    'money.kpi-tile-matrix',
    'money.kpi-mix-span-narrow-grid',
    'money.window-range-placement',
    'money.toolbar-phone-rail',
  ],
  states: [
    'kpi-tile.value-label',
    'kpi-tile.delta-success-destructive-neutral',
    'kpi-tile.sub-help',
    'kpi-tile.basis-dq-foot',
    'kpi-tile.interactive-selected',
    'kpi-tile.loading',
    'kpi-tile.classname-passthrough',
    'kpi-tile.mix-span2-phone',
    'kpi-tile.value-clamp-nowrap',
    'window-range.inline-desktop',
    'window-range.phone-row-below-rail',
    'window-range.custom-active-bounded',
    'window-range.quiet-empty',
    'toolbar.phone-rail-cut-reachable',
  ],
  responsive: ['desktop1280', 'phone390'],
  canonicalImports: [
    { symbol: 'KPITile', file: 'mos-app/src/components/dashboard/kpi-tile.tsx', importPath: '@/components/dashboard/kpi-tile' },
    { symbol: 'GlobalToolbar', file: 'mos-app/src/components/dashboard/global-toolbar.tsx', importPath: '@/components/dashboard/global-toolbar' },
    { symbol: 'WindowRangeFields', file: 'mos-app/src/components/dashboard/window-selector.tsx', importPath: '@/components/dashboard/window-selector' },
  ],
  debt: [
    // r3 debt "delta Pill ellipsizes in narrow phone tiles" — PAID by r5 F-3
    // (pill hugs content + compact "vs prev" copy; long copy in the help tooltip).
  ],
  scope: { applicationMigration: false, representativeAcceptance: false, futureIssue4Host: false },
} as const

const meta = {
  title: 'Money dashboard',
  excludeStories: /^v3Matrix$/,
  parameters: {
    docs: {
      description: {
        component:
          'Money-surface specimens: the KPITile signature (display-ready strings + tone enum, ' +
          'never currency math), the census-r3 mix-tile span-2 treatment on narrow grids, and ' +
          'the DO-21 window-range placement split — inline beside the seg on desktop, a ' +
          'dedicated row below the phone filter rail so the cut axis stays reachable.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const BOUNDS = { earliest: '2026-05-03', latest: '2026-07-01' }
const CUSTOM: WindowSpec = { kind: 'custom', from: '2026-06-01', to: '2026-06-30' }
const PRESET: WindowSpec = { kind: 'preset', days: 30 }

// ── KPITile — variants matrix (desktop) ─────────────────────────────────────────────

function KpiTileMatrixSpecimen() {
  const [selected, setSelected] = useState(true)
  return (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="money-kpi-title">
        <h1 id="money-kpi-title" className="v3-story-section__title">KPI tile matrix</h1>
        <p className="v3-story-section__copy">
          The tile consumes display-ready primitives only: a label, a pre-formatted value, an
          optional delta Pill (success · destructive · neutral), an optional sub line, and the
          basis + DQ foot on GM/COGS tiles. With onClick it becomes a real button
          (filter-in-place) whose selected state carries the primary ring and aria-current.
        </p>
        <div className="dash-kpi-grid">
          <KPITile label="Trailing 7-day revenue" value="Rp 285,2 jt"
            delta={{ text: '+4,2% vs prev', tone: 'success', dot: true }} />
          <KPITile label="Trailing 30-day revenue" value="Rp 1,2 M"
            delta={{ text: '-6,1% vs prev', tone: 'destructive', dot: true }}
            onClick={() => setSelected(!selected)} selected={selected} />
          <KPITile label="Avg check" value="Rp 58.775" sub="revenue + transactions"
            help="Trailing-window revenue ÷ transactions." />
          <KPITile label="Gross margin %" value="35,6%"
            delta={{ text: '±0,0% vs prev', tone: 'neutral' }}
            basis={{ label: 'interim — stock-movement' }} dq="good" />
          <KPITile label="Interim COGS" value="Rp 609,8 jt" state="loading" />
        </div>
      </section>
    </div>
  )
}

export const KpiTileMatrix: Story = {
  render: () => <KpiTileMatrixSpecimen />,
  parameters: { v3Viewport: 'desktop1280' },
  globals: { viewport: { value: 'desktop1280' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Non-interactive tiles are named groups; the delta rides a Pill inside the tile.
    const revenue = canvas.getByRole('group', { name: 'Trailing 7-day revenue' })
    await expect(within(revenue).getByText('+4,2% vs prev')).toBeVisible()
    // onClick → a real button carrying aria-current while selected (FR-016 grammar).
    const interactive = canvas.getByRole('button', { name: 'Trailing 30-day revenue' })
    await expect(interactive).toHaveAttribute('aria-current', 'true')
    await userEvent.click(interactive)
    await expect(interactive).not.toHaveAttribute('aria-current')
    // Basis + DQ foot on the GM tile; the DQ text uses the on-tint token (r2 contrast fix).
    const gm = canvas.getByRole('group', { name: 'Gross margin %' })
    await expect(within(gm).getByText('interim — stock-movement')).toBeVisible()
    await expect(within(gm).getByText(/good/i)).toBeVisible()
    // Loading grammar: label stays visible AND names the busy status (no Pill skeleton).
    await expect(canvas.getByRole('status', { name: 'Interim COGS' })).toBeInTheDocument()
    // The value keeps the nowrap grammar at the 23px desktop ceiling.
    const value = revenue.querySelector('.kpi-tile-value--nowrap') as HTMLElement
    await expect(getComputedStyle(value).whiteSpace).toBe('nowrap')
    await expect(getComputedStyle(value).fontSize).toBe('23px')
    // r5 F-3: the delta pill HUGS its content — never a full-width bar across the tile.
    const pill = revenue.querySelector('.pill') as HTMLElement
    await expect(getComputedStyle(pill).alignSelf).toBe('flex-start')
    await expect(pill.getBoundingClientRect().width).toBeLessThan(
      revenue.getBoundingClientRect().width - 24,
    )
  },
}

// ── KPITile — the census-r3 mix span-2 state on the phone 2-up grid ────────────────

function KpiMixSpanSpecimen() {
  return (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="money-mix-title">
        <h1 id="money-mix-title" className="v3-story-section__title">Channel-mix span on narrow grids</h1>
        <p className="v3-story-section__copy">
          The 23px no-wrap mix value outgrows any track narrower than ~264px, so below 1024px the
          composition marks the tile with the className passthrough (dash-kpi-tile--mix) and it
          spans 2 tracks — full row at phone 2-up — instead of painting over its neighbour. The
          clamp floor (17px) only engages below ~371px viewports; the grammar never wraps.
        </p>
        <div className="dash-kpi-grid" data-testid="mix-span-grid">
          <KPITile label="Trailing 7-day revenue" value="Rp 285,2 jt" />
          <KPITile label="Trailing 30-day revenue" value="Rp 1,2 M" />
          <KPITile label="Latest reporting-day revenue" value="Rp 39,8 jt" sub="2026-07-22" />
          <KPITile label="Avg check" value="Rp 58.775" sub="revenue + transactions" />
          <KPITile label="Channel mix" value="POS 83% · B2B 17%" sub="trailing window"
            className="dash-kpi-tile--mix" />
        </div>
      </section>
    </div>
  )
}

export const KpiMixSpanPhone: Story = {
  render: () => <KpiMixSpanSpecimen />,
  parameters: { v3Viewport: 'phone390' },
  globals: { viewport: { value: 'phone390' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const grid = canvas.getByTestId('mix-span-grid')
    const mix = canvas.getByRole('group', { name: 'Channel mix' })
    // className passthrough lands on the grid-child element itself.
    await expect(mix).toHaveClass('dash-kpi-tile--mix')
    await expect(mix).toHaveClass('kpi-tile')
    // Span-2 on the 2-up phone grid = the full row.
    const gridRect = grid.getBoundingClientRect()
    const mixRect = mix.getBoundingClientRect()
    await expect(Math.abs(mixRect.width - gridRect.width)).toBeLessThan(2)
    // The no-overflow goal itself: the painted value text never leaves its tile.
    const value = mix.querySelector('.kpi-tile-value') as HTMLElement
    const range = document.createRange()
    range.selectNodeContents(value)
    await expect(range.getBoundingClientRect().right).toBeLessThanOrEqual(mixRect.right + 1)
    // Clamp behavior at 390: the cap side of clamp(17px, 6.2vw, 23px) — still one line.
    const size = parseFloat(getComputedStyle(value).fontSize)
    await expect(size).toBeGreaterThanOrEqual(17)
    await expect(size).toBeLessThanOrEqual(23)
    await expect(getComputedStyle(value).whiteSpace).toBe('nowrap')
    // Neighbour tiles keep single tracks (the span is the exception, not the rule).
    const avg = canvas.getByRole('group', { name: 'Avg check' })
    await expect(avg.getBoundingClientRect().width).toBeLessThan(gridRect.width / 2 + 2)
  },
}

// ── WindowRangeFields — placement split (DO-21) + quiet empty ──────────────────────

function ToolbarHarness({ initial }: { initial: WindowSpec }) {
  const [windowSpec, setWindowSpec] = useState<WindowSpec>(initial)
  const [cut, setCut] = useState<'Branch' | 'Channel' | 'Activity'>('Branch')
  return (
    <GlobalToolbar
      cut={cut}
      onCutChange={setCut}
      window={windowSpec}
      onWindowChange={setWindowSpec}
      bounds={BOUNDS}
      snapshotAsOf="2026-07-01T03:14:00Z"
    />
  )
}

export const WindowRangeInlineDesktop: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="money-range-desktop-title">
        <h1 id="money-range-desktop-title" className="v3-story-section__title">Custom range — desktop inline</h1>
        <p className="v3-story-section__copy">
          On desktop the bounded From/To pair sits inline beside the seg — one row, no dedicated
          range row. Dates outside the snapshot window are disabled via min/max.
        </p>
        <ToolbarHarness initial={CUSTOM} />
      </section>
    </div>
  ),
  parameters: { v3Viewport: 'desktop1280' },
  globals: { viewport: { value: 'desktop1280' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const from = canvas.getByLabelText('From')
    // Inline beside the seg — inside the window-selector, no phone range row.
    await expect(from.closest('.window-selector')).not.toBeNull()
    await expect(canvasElement.querySelector('.global-toolbar-range-row')).toBeNull()
    await expect(canvasElement.querySelectorAll('.window-selector-range')).toHaveLength(1)
    // Bounded to the snapshot window (AC-014 grammar).
    await expect(from).toHaveAttribute('min', BOUNDS.earliest)
    await expect(from).toHaveAttribute('max', BOUNDS.latest)
  },
}

export const WindowRangeRowPhone: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="money-range-phone-title">
        <h1 id="money-range-phone-title" className="v3-story-section__title">Custom range — phone row below the rail</h1>
        <p className="v3-story-section__copy">
          DO-21: picking Custom must not shove Branch/Channel/Activity off-canvas, so on phone the
          pair leaves the horizontal scroller and takes a dedicated full-width row below the rail.
          One DOM for the pair — the seg suppresses its inline copy.
        </p>
        <ToolbarHarness initial={CUSTOM} />
      </section>
    </div>
  ),
  parameters: { v3Viewport: 'phone390' },
  globals: { viewport: { value: 'phone390' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const from = canvas.getByLabelText('From')
    const rangeRow = canvasElement.querySelector('.global-toolbar-range-row')
    const rail = canvasElement.querySelector('.global-toolbar-rail')
    // The pair renders once, in the range row — never inside the scrolling rail.
    await expect(rangeRow).not.toBeNull()
    await expect(rangeRow!.contains(from)).toBe(true)
    await expect(rail!.contains(from)).toBe(false)
    await expect(canvasElement.querySelectorAll('.window-selector-range')).toHaveLength(1)
    // The row sits BELOW the rail (its own line, not inline).
    await expect(rangeRow!.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      rail!.getBoundingClientRect().bottom - 1,
    )
    // The cut axis survives Custom mode — the whole point of the split.
    await expect(canvas.getByRole('tab', { name: 'Branch' })).toBeInTheDocument()
    await expect(canvas.getByRole('tab', { name: 'Channel' })).toBeInTheDocument()
    await expect(canvas.getByRole('tab', { name: 'Activity' })).toBeInTheDocument()
    // The row pair is live: editing From round-trips through the controlled spec.
    await fireEvent.change(from, { target: { value: '2026-06-10' } })
    await expect(from).toHaveValue('2026-06-10')
  },
}

export const WindowRangeQuietEmpty: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="money-range-empty-title">
        <h1 id="money-range-empty-title" className="v3-story-section__title">Range fields — active vs quiet empty</h1>
        <p className="v3-story-section__copy">
          Standalone WindowRangeFields: with a custom spec the pair carries the dates and the
          snapshot bounds; with a preset spec (or no bounds yet) the inputs sit empty and
          unbounded — a quiet chip, never a fake date.
        </p>
        <div className="v3-story-stack">
          <div className="v3-story-row">
            <span className="v3-story-label">Custom active</span>
            <div data-testid="range-active">
              <WindowRangeFields value={CUSTOM} onChange={() => undefined} bounds={BOUNDS} />
            </div>
          </div>
          <div className="v3-story-row">
            <span className="v3-story-label">Quiet empty</span>
            <div data-testid="range-empty">
              <WindowRangeFields value={PRESET} onChange={() => undefined} bounds={null} />
            </div>
          </div>
        </div>
      </section>
    </div>
  ),
  parameters: { v3Viewport: 'desktop1280' },
  globals: { viewport: { value: 'desktop1280' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const active = within(canvas.getByTestId('range-active'))
    await expect(active.getByLabelText('From')).toHaveValue(CUSTOM.kind === 'custom' ? CUSTOM.from : '')
    await expect(active.getByLabelText('To')).toHaveValue('2026-06-30')
    await expect(active.getByLabelText('From')).toHaveAttribute('min', BOUNDS.earliest)
    const empty = within(canvas.getByTestId('range-empty'))
    await expect(empty.getByLabelText('From')).toHaveValue('')
    await expect(empty.getByLabelText('To')).toHaveValue('')
    await expect(empty.getByLabelText('From')).not.toHaveAttribute('min')
  },
}
