// DataTable tests — design-plan §2.3 (general sortable, reflowing table primitive).
// Generalises kitchen-table.css (.kt-*) grammar with a formal sort + card-reflow prop-shape.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DataTable, type DataTableColumn, type DataTableGroup } from './data-table'

const SRC = resolve(process.cwd(), 'src')

interface Row {
  id: string
  dimension: string
  channel: string
  revenue: number
  transactions: number
}

const COLUMNS: DataTableColumn<Row>[] = [
  { key: 'dimension', header: 'Branch', cardLabel: '' },
  { key: 'channel', header: 'Channel' },
  { key: 'revenue', header: 'Revenue', numeric: true, sortable: true },
  { key: 'transactions', header: 'Transactions', numeric: true, sortable: true },
]

const ROWS: Row[] = [
  { id: '1', dimension: 'GHQ', channel: 'POS', revenue: 12_400_000, transactions: 340 },
  { id: '2', dimension: 'SKC', channel: 'POS', revenue: -500_000, transactions: 12 },
  { id: '3', dimension: 'Floating', channel: 'Online', revenue: 1_000, transactions: 5 },
]

// GROUPS reuses ROWS so the grouped + flat shapes share identical cell data.
// 'hot' carries an explicit count (override); 'cold' + 'uncat' default to rows.length.
const GROUPS: DataTableGroup<Row>[] = [
  { key: 'hot', label: 'Hot Kitchen', count: 7, rows: [ROWS[0]] },
  { key: 'cold', label: 'Cold Kitchen', rows: [ROWS[1]] },
  { key: 'uncat', label: null, rows: [ROWS[2]] },
]

describe('DataTable — desktop, ready state', () => {
  it('renders a <table> with a caption for a11y', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop caption="Sales by branch" />)
    const table = screen.getByRole('table', { name: 'Sales by branch' })
    expect(table).toBeInTheDocument()
  })

  it('renders one row per data row plus header', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop caption="Sales by branch" />)
    expect(screen.getByText('GHQ')).toBeInTheDocument()
    expect(screen.getByText('SKC')).toBeInTheDocument()
  })

  it('applies .tabular to numeric cells', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop caption="Sales by branch" />)
    const cell = screen.getByText('12400000')
    expect(cell).toHaveClass('tabular')
  })

  it('tints negative numeric values with the AA-safe kt-neg / status-lost-text class, not base destructive', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop caption="Sales by branch" />)
    const negCell = screen.getByText('-500000')
    expect(negCell.className).toMatch(/neg/)
  })

  it('supports custom render() per column', () => {
    const columnsWithRender: DataTableColumn<Row>[] = [
      ...COLUMNS.slice(0, 1),
      { key: 'channel', header: 'Channel', render: row => <b>{row.channel}!</b> },
    ]
    render(<DataTable columns={columnsWithRender} rows={ROWS} isDesktop caption="Sales by branch" />)
    expect(screen.getAllByText('POS!')[0].tagName).toBe('B')
  })

  it('renders a footer row (totals) when footer is provided as a ReactNode', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        isDesktop
        caption="Sales by branch"
        footer={<tr><td>Total</td></tr>}
      />,
    )
    expect(screen.getByText('Total')).toBeInTheDocument()
  })

  it('applies rowClassName to desktop rows for caller-owned attention states', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        isDesktop
        caption="Sales by branch"
        rowClassName={row => row.revenue < 0 ? 'is-attention' : undefined}
      />,
    )
    const row = screen.getByText('SKC').closest('tr')
    expect(row).toHaveClass('is-attention')
  })
})

describe('DataTable — sort (a11y keyboard path)', () => {
  it('sortable headers render as a <button> with aria-sort on the active column', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        isDesktop
        caption="Sales by branch"
        sort={{ key: 'revenue', dir: 'desc' }}
        onSortChange={vi.fn()}
      />,
    )
    const revenueHeader = screen.getByRole('columnheader', { name: /revenue/i })
    expect(within(revenueHeader).getByRole('button')).toBeInTheDocument()
    expect(revenueHeader).toHaveAttribute('aria-sort', 'descending')
  })

  it('non-active sortable column has aria-sort="none"', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        isDesktop
        caption="Sales by branch"
        sort={{ key: 'revenue', dir: 'desc' }}
        onSortChange={vi.fn()}
      />,
    )
    const txHeader = screen.getByRole('columnheader', { name: /transactions/i })
    expect(txHeader).toHaveAttribute('aria-sort', 'none')
  })

  it('non-sortable columns render a plain header, no button', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop caption="Sales by branch" />)
    const branchHeader = screen.getByRole('columnheader', { name: /branch/i })
    expect(within(branchHeader).queryByRole('button')).toBeNull()
  })

  it('clicking a sortable header button calls onSortChange toggling direction', () => {
    const onSortChange = vi.fn()
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        isDesktop
        caption="Sales by branch"
        sort={{ key: 'revenue', dir: 'desc' }}
        onSortChange={onSortChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /revenue/i }))
    expect(onSortChange).toHaveBeenCalledWith({ key: 'revenue', dir: 'asc' })
  })

  it('Enter and Space on the sort button trigger sort (keyboard path)', () => {
    const onSortChange = vi.fn()
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        isDesktop
        caption="Sales by branch"
        onSortChange={onSortChange}
      />,
    )
    const button = screen.getByRole('button', { name: /transactions/i })
    fireEvent.click(button)
    expect(onSortChange).toHaveBeenCalledWith({ key: 'transactions', dir: 'asc' })
  })
})

describe('DataTable — 768px reflow (single-render, phone cards)', () => {
  it('renders NO <table> when isDesktop=false', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop={false} caption="Sales by branch" />)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('renders one card per row with the cardLabel: "" column as the title line', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop={false} caption="Sales by branch" />)
    expect(screen.getByText('GHQ')).toBeInTheDocument()
    expect(screen.getByText('SKC')).toBeInTheDocument()
  })

  it('renders remaining columns as a <dl> label:value grid', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop={false} caption="Sales by branch" />)
    const dls = document.querySelectorAll('dl')
    expect(dls.length).toBeGreaterThan(0)
    expect(screen.getAllByText('Channel').length).toBeGreaterThan(0)
  })

  it('phone cards carry a 44px touch-target marker', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop={false} caption="Sales by branch" />)
    const cards = document.querySelectorAll('[data-touch-target="true"]')
    expect(cards.length).toBeGreaterThan(0)
  })

  it('does not render two branches at once (single-render, no aria-hidden twin)', () => {
    const { container } = render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop={false} caption="Sales by branch" />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })
})

describe('DataTable — loading state', () => {
  it('desktop: renders skeleton rows, not real row data', () => {
    render(<DataTable columns={COLUMNS} rows={[]} isDesktop caption="Sales by branch" state="loading" />)
    expect(screen.queryByText('GHQ')).toBeNull()
    const { container } = render(
      <DataTable columns={COLUMNS} rows={[]} isDesktop caption="Sales by branch" state="loading" />,
    )
    expect(container.querySelectorAll('.dt-skeleton-row').length).toBeGreaterThanOrEqual(5)
  })

  it('phone: renders skeleton cards', () => {
    const { container } = render(
      <DataTable columns={COLUMNS} rows={[]} isDesktop={false} caption="Sales by branch" state="loading" />,
    )
    expect(container.querySelectorAll('.dt-skeleton-card').length).toBeGreaterThan(0)
  })
})

describe('DataTable — phone empty state', () => {
  it('renders the emptyLabel message, no cards', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        isDesktop={false}
        caption="Sales by branch"
        state="empty"
        emptyLabel="No sales rows for this cut."
      />,
    )
    expect(screen.getByText('No sales rows for this cut.')).toBeInTheDocument()
  })
})

describe('DataTable — empty state', () => {
  it('renders the emptyLabel centered message, no rows', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        isDesktop
        caption="Sales by branch"
        state="empty"
        emptyLabel="No sales rows for this cut."
      />,
    )
    expect(screen.getByText('No sales rows for this cut.')).toBeInTheDocument()
  })
})

describe('DataTable — error state', () => {
  it('renders a non-secret error message and a retry button calling onRetry', () => {
    const onRetry = vi.fn()
    render(
      <DataTable columns={COLUMNS} rows={[]} isDesktop caption="Sales by branch" state="error" onRetry={onRetry} />,
    )
    const retry = screen.getByRole('button', { name: /try again/i })
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalled()
  })

  it('error text contains no DSN/token/SQL/stack indicators (AC-009)', () => {
    render(
      <DataTable columns={COLUMNS} rows={[]} isDesktop caption="Sales by branch" state="error" onRetry={vi.fn()} />,
    )
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/postgres|supabase|select \*|stack|token|dsn/i)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Row grouping (OD-P3-6 group-header row) — additive, opt-in via `groups`.
// Flat `rows` mode stays 100% unchanged (covered by the suites above).
// ════════════════════════════════════════════════════════════════════════════
describe('DataTable — grouping (desktop)', () => {
  it('renders a group-header row per non-null group with its label + count; rows appear under their group', () => {
    const { container } = render(
      <DataTable columns={COLUMNS} rows={[]} groups={GROUPS} isDesktop caption="Kitchen prep" />,
    )
    // a header row per non-null group
    expect(screen.getByText('Hot Kitchen')).toBeInTheDocument()
    expect(screen.getByText('Cold Kitchen')).toBeInTheDocument()

    // count override (Hot) + default rows.length (Cold) both render in the header cell
    const groupRows = container.querySelectorAll('tr.dt-group-row')
    expect(groupRows).toHaveLength(2) // null-label group renders NO header
    expect(groupRows[0].querySelector('.dt-group-count')?.textContent).toBe('7') // explicit override
    expect(groupRows[1].querySelector('.dt-group-count')?.textContent).toBe('1') // default = rows.length

    // rows appear under their owning group, in source order
    const trs = Array.from(container.querySelector('tbody')!.querySelectorAll('tr'))
    const hotIdx = trs.findIndex(tr => tr.textContent?.includes('Hot Kitchen'))
    const coldIdx = trs.findIndex(tr => tr.textContent?.includes('Cold Kitchen'))
    const ghqIdx = trs.findIndex(tr => tr.textContent?.includes('GHQ'))
    const skcIdx = trs.findIndex(tr => tr.textContent?.includes('SKC'))
    expect(hotIdx).toBeGreaterThanOrEqual(0)
    expect(coldIdx).toBeGreaterThan(hotIdx)
    expect(ghqIdx).toBeGreaterThan(hotIdx)   // GHQ under Hot Kitchen
    expect(ghqIdx).toBeLessThan(coldIdx)      // ...and above the Cold Kitchen header
    expect(skcIdx).toBeGreaterThan(coldIdx)   // SKC under Cold Kitchen
  })

  it('a null-label (uncategorised) group renders its rows with NO header row', () => {
    const { container } = render(
      <DataTable columns={COLUMNS} rows={[]} groups={GROUPS} isDesktop caption="Kitchen prep" />,
    )
    // the uncategorised row is present ...
    expect(screen.getByText('Floating')).toBeInTheDocument()
    // ... but contributes no group-header row (only hot + cold do)
    expect(container.querySelectorAll('tr.dt-group-row')).toHaveLength(2)
    // and no group-header text claims the null label
    expect(screen.queryByText('uncat')).toBeNull()
  })

  it('collapses a group on click (hides its rows, aria-expanded=false) and re-expands on the next click', () => {
    render(<DataTable columns={COLUMNS} rows={[]} groups={GROUPS} isDesktop caption="Kitchen prep" />)
    // all-expanded by default
    const collapseBtn = screen.getByRole('button', { name: /collapse hot kitchen/i })
    expect(collapseBtn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('GHQ')).toBeInTheDocument()

    fireEvent.click(collapseBtn)
    // collapsed: the button now offers to Expand + reports aria-expanded=false, and the rows are gone
    const expandBtn = screen.getByRole('button', { name: /expand hot kitchen/i })
    expect(expandBtn).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('GHQ')).toBeNull()
    // the other group is unaffected
    expect(screen.getByText('SKC')).toBeInTheDocument()

    fireEvent.click(expandBtn)
    expect(screen.getByRole('button', { name: /collapse hot kitchen/i })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('GHQ')).toBeInTheDocument()
  })

  it('collapses on Enter and Space (keyboard path) — the toggle is a real <button>', () => {
    render(<DataTable columns={COLUMNS} rows={[]} groups={GROUPS} isDesktop caption="Kitchen prep" />)
    const btn = screen.getByRole('button', { name: /collapse cold kitchen/i })
    expect(btn.tagName).toBe('BUTTON')
    fireEvent.click(btn) // a <button> fires click on Enter/Space natively
    expect(screen.queryByText('SKC')).toBeNull()
  })

  it('composes a column render() with grouping — the rendered node shows inside a grouped row', () => {
    const cols: DataTableColumn<Row>[] = [
      ...COLUMNS.slice(0, 1),
      { key: 'channel', header: 'Channel', render: row => <b>{row.channel}!</b> },
      ...COLUMNS.slice(2),
    ]
    render(<DataTable columns={cols} rows={[]} groups={GROUPS} isDesktop caption="Kitchen prep" />)
    // GHQ (channel POS) sits under Hot Kitchen; its rendered <b>POS!</b> node appears
    expect(screen.getAllByText('POS!')[0].tagName).toBe('B')
  })

  it('groups win over rows when both are passed', () => {
    const { container } = render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        groups={[{ key: 'only', label: 'Only Group', rows: [ROWS[0]] }]}
        isDesktop
        caption="Kitchen prep"
      />,
    )
    // grouped mode took over: a group header exists and only the grouped row renders
    expect(screen.getByText('Only Group')).toBeInTheDocument()
    expect(screen.getByText('GHQ')).toBeInTheDocument()
    expect(screen.queryByText('SKC')).toBeNull()
    expect(container.querySelectorAll('tr.dt-group-row')).toHaveLength(1)
  })

  it('renders a group headerActions node on the RIGHT of the desktop group-header row', () => {
    const groups: DataTableGroup<Row>[] = [
      { key: 'hot', label: 'Hot Kitchen', rows: [ROWS[0]], headerActions: <button type="button">Approve all (1)</button> },
    ]
    const { container } = render(
      <DataTable columns={COLUMNS} rows={[]} groups={groups} isDesktop caption="Kitchen prep" />,
    )
    const bulk = screen.getByRole('button', { name: /approve all \(1\)/i })
    expect(bulk).toBeInTheDocument()
    // the actions sit inside the group-header bar (the .dt-group-actions wrapper)
    const groupBar = container.querySelector('.dt-group-bar')
    expect(groupBar).not.toBeNull()
    expect(groupBar).toContain(bulk)
    expect(container.querySelector('.dt-group-actions')).not.toBeNull()
  })
})

describe('DataTable — grouping (phone cards)', () => {
  it('renders NO <table> and shows each non-null group label as a heading above its cards', () => {
    render(<DataTable columns={COLUMNS} rows={[]} groups={GROUPS} isDesktop={false} caption="Kitchen prep" />)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText('Hot Kitchen')).toBeInTheDocument()
    expect(screen.getByText('Cold Kitchen')).toBeInTheDocument()
    // cards under their groups
    expect(screen.getByText('GHQ')).toBeInTheDocument()
    expect(screen.getByText('SKC')).toBeInTheDocument()
  })

  it('a null-label group renders its cards with no heading', () => {
    render(<DataTable columns={COLUMNS} rows={[]} groups={GROUPS} isDesktop={false} caption="Kitchen prep" />)
    expect(screen.getByText('Floating')).toBeInTheDocument() // the card
    expect(screen.queryByText('uncat')).toBeNull()           // no heading for the null group
  })

  it('collapses a phone group on click (hides its cards)', () => {
    render(<DataTable columns={COLUMNS} rows={[]} groups={GROUPS} isDesktop={false} caption="Kitchen prep" />)
    expect(screen.getByText('GHQ')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /collapse hot kitchen/i }))
    expect(screen.queryByText('GHQ')).toBeNull()
  })

  it('renders a group headerActions node UNDER the phone group heading', () => {
    const groups: DataTableGroup<Row>[] = [
      { key: 'hot', label: 'Hot Kitchen', rows: [ROWS[0]], headerActions: <button type="button">Approve all (1)</button> },
    ]
    const { container } = render(
      <DataTable columns={COLUMNS} rows={[]} groups={groups} isDesktop={false} caption="Kitchen prep" />,
    )
    const bulk = screen.getByRole('button', { name: /approve all \(1\)/i })
    expect(bulk).toBeInTheDocument()
    // the actions render in a dedicated block under the heading (NOT inside the heading row)
    const actions = container.querySelector('.dt-cards-group-actions')
    expect(actions).not.toBeNull()
    expect(actions).toContain(bulk)
    const heading = container.querySelector('.dt-cards-group')
    expect(heading).not.toContain(bulk)
  })
})

describe('DataTable — grouping regression + glyph guard', () => {
  it('flat mode (rows, no groups) renders rows directly with NO group-header rows', () => {
    const { container } = render(<DataTable columns={COLUMNS} rows={ROWS} isDesktop caption="Sales by branch" />)
    expect(screen.getByText('GHQ')).toBeInTheDocument()
    expect(screen.getByText('SKC')).toBeInTheDocument()
    expect(container.querySelectorAll('tr.dt-group-row')).toHaveLength(0)
  })

  it('uses the shared inline-SVG <Chevron>, never the ▸/▾/▴ glyph characters (RI-IXD-1)', () => {
    const src = readFileSync(resolve(SRC, 'components/dashboard/data-table.tsx'), 'utf8')
    expect(src).not.toMatch(/[▸▾▴]/)
    expect(src).toMatch(/from '@\/shell\/icons'/) // imports the ONE shared chevron
  })
})

// #400: the kit's own strings — default empty label + group expand/collapse aria — go
// through the catalog. Needs the provider wrapper (bare renders resolve the standalone
// en default context).
describe('DataTable — locale seam (#400)', () => {
  beforeEach(() => localStorage.setItem('mos.locale', 'id'))
  afterEach(() => localStorage.clear())

  it('default empty label is Indonesian when the caller passes none', () => {
    render(
      <I18nProvider>
        <DataTable columns={COLUMNS} rows={[]} isDesktop state="empty" caption="Tabel" />
      </I18nProvider>,
    )
    expect(screen.getByText('Tidak ada baris untuk ditampilkan.')).toBeInTheDocument()
    expect(screen.queryByText('No rows to show.')).toBeNull()
  })

  it('group toggle aria names are Indonesian (desktop + phone)', () => {
    const { unmount } = render(
      <I18nProvider>
        <DataTable columns={COLUMNS} rows={[]} groups={GROUPS} isDesktop caption="Tabel" />
      </I18nProvider>,
    )
    const collapse = screen.getByRole('button', { name: 'Tutup grup Hot Kitchen' })
    fireEvent.click(collapse)
    expect(screen.getByRole('button', { name: 'Buka grup Hot Kitchen' })).toBeInTheDocument()
    unmount()

    render(
      <I18nProvider>
        <DataTable columns={COLUMNS} rows={[]} groups={GROUPS} isDesktop={false} caption="Tabel" />
      </I18nProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Tutup grup Hot Kitchen' }))
    expect(screen.getByRole('button', { name: 'Buka grup Hot Kitchen' })).toBeInTheDocument()
  })

  // Same reasoning as ChartFrame: the failure state is where English hurts most, and it
  // is the last string in the kit still bypassing `common.loadFailed`.
  it('the error state and its retry control render Indonesian', () => {
    render(
      <I18nProvider>
        <DataTable
          columns={COLUMNS}
          rows={[]}
          isDesktop
          state="error"
          caption="Tabel"
          onRetry={() => {}}
        />
      </I18nProvider>,
    )
    expect(
      screen.getByText('Gagal memuat tabel ini. Periksa koneksi Anda lalu coba lagi.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument()
    expect(screen.queryByText(/couldn’t load|couldn't load|try again/i)).toBeNull()
  })
})

// #359 — stylesheet pins (jsdom computes no layout; the CSS file is the oracle, the same
// pattern as the kpi-tile span pin and the freshness-label css test).
describe('DataTable — #359 stylesheet pins', () => {
  const css = readFileSync(resolve(SRC, 'components/dashboard/data-table.css'), 'utf8')

  it('header cells are sticky with card bg + the low z-index token (DESIGN.md "Data Table (signature)")', () => {
    const block = css.split('.dt-table thead th {')[1]?.split('}')[0] ?? ''
    expect(block).toContain('position: sticky')
    expect(block).toContain('top: 0')
    expect(block).toContain('z-index: var(--z-sticky)')
    expect(block).toContain('background: var(--card)')
  })

  it('the phone group-toggle reaches the 44px floor via the ::before overlay (24 + 2×10)', () => {
    const block = css.split('.dt-cards-group-toggle::before {')[1]?.split('}')[0] ?? ''
    expect(block).toContain('position: absolute')
    expect(block).toContain('inset: -10px')
    // the overlay only works if the toggle is its containing block
    const toggle = css.split('.dt-cards-group-toggle {')[1]?.split('}')[0] ?? ''
    expect(toggle).toContain('position: relative')
  })

  it('body rows read from the shared --row-* rhythm tokens, not raw literals', () => {
    const block = css.split('.dt-table tbody td {')[1]?.split('}')[0] ?? ''
    expect(block).toContain('height: var(--row-min-h)')
    expect(block).toContain('padding: var(--row-pad-y) var(--row-pad-x)')
    expect(block).toContain('var(--row-divider)')
  })

  it('chevron transitions use the --dur-fast token, never a raw 120ms', () => {
    expect(css).not.toMatch(/120ms/)
    expect(css).toContain('transition: transform var(--dur-fast) ease')
  })
})
