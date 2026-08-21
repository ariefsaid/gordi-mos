// ChartFrame tests — design-plan §2.2 (titled chart surface + mandatory tableFallback).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChartFrame } from './chart-frame'
import { I18nProvider } from '@/i18n/I18nProvider'

const FALLBACK = <table><caption>Daily revenue table</caption></table>

describe('ChartFrame — ready state', () => {
  it('renders the title, ariaLabel region, and children (chart body)', () => {
    render(
      <ChartFrame title="Daily revenue" ariaLabel="Daily revenue chart" tableFallback={FALLBACK}>
        <div data-testid="chart-body">chart</div>
      </ChartFrame>,
    )
    expect(screen.getByRole('region', { name: 'Daily revenue chart' })).toBeInTheDocument()
    expect(screen.getByText('Daily revenue')).toBeInTheDocument()
    expect(screen.getByTestId('chart-body')).toBeInTheDocument()
  })

  it('renders the freshness slot when provided', () => {
    render(
      <ChartFrame
        title="Daily revenue"
        ariaLabel="Daily revenue chart"
        tableFallback={FALLBACK}
        freshness={<span>as of 2 Jul</span>}
      >
        <div>chart</div>
      </ChartFrame>,
    )
    expect(screen.getByText('as of 2 Jul')).toBeInTheDocument()
  })

  it('renders the controls slot when provided', () => {
    render(
      <ChartFrame
        title="Daily revenue"
        ariaLabel="Daily revenue chart"
        tableFallback={FALLBACK}
        controls={<button>Branch</button>}
      >
        <div>chart</div>
      </ChartFrame>,
    )
    expect(screen.getByRole('button', { name: 'Branch' })).toBeInTheDocument()
  })

  it('always renders the tableFallback in the DOM (mandatory a11y equivalent)', () => {
    render(
      <ChartFrame title="Daily revenue" ariaLabel="Daily revenue chart" tableFallback={FALLBACK}>
        <div>chart</div>
      </ChartFrame>,
    )
    expect(screen.getByText('Daily revenue table')).toBeInTheDocument()
  })
})

describe('ChartFrame — loading state', () => {
  it('renders a skeleton block and does not render the chart children', () => {
    const { container } = render(
      <ChartFrame title="Daily revenue" ariaLabel="Daily revenue chart" tableFallback={FALLBACK} state="loading">
        <div data-testid="chart-body">chart</div>
      </ChartFrame>,
    )
    expect(screen.queryByTestId('chart-body')).toBeNull()
    expect(container.querySelector('.chart-frame-skeleton')).toBeInTheDocument()
  })

  it('still renders the tableFallback while loading (a11y equivalent always present)', () => {
    render(
      <ChartFrame title="Daily revenue" ariaLabel="Daily revenue chart" tableFallback={FALLBACK} state="loading">
        <div>chart</div>
      </ChartFrame>,
    )
    expect(screen.getByText('Daily revenue table')).toBeInTheDocument()
  })
})

describe('ChartFrame — empty state', () => {
  it('renders an inline "no data for this cut" message', () => {
    render(
      <ChartFrame title="Daily revenue" ariaLabel="Daily revenue chart" tableFallback={FALLBACK} state="empty">
        <div data-testid="chart-body">chart</div>
      </ChartFrame>,
    )
    expect(screen.getByText(/no data for this cut/i)).toBeInTheDocument()
    expect(screen.queryByTestId('chart-body')).toBeNull()
  })
})

describe('ChartFrame — error state', () => {
  it('renders a non-secret error message and a retry button that calls onRetry', () => {
    const onRetry = vi.fn()
    render(
      <ChartFrame
        title="Daily revenue"
        ariaLabel="Daily revenue chart"
        tableFallback={FALLBACK}
        state="error"
        onRetry={onRetry}
      >
        <div data-testid="chart-body">chart</div>
      </ChartFrame>,
    )
    expect(screen.queryByTestId('chart-body')).toBeNull()
    const retryButton = screen.getByRole('button', { name: /try again/i })
    retryButton.click()
    expect(onRetry).toHaveBeenCalled()
  })

  it('the error message text contains no DSN/token/SQL/stack indicators (AC-009)', () => {
    render(
      <ChartFrame
        title="Daily revenue"
        ariaLabel="Daily revenue chart"
        tableFallback={FALLBACK}
        state="error"
        onRetry={vi.fn()}
      >
        <div>chart</div>
      </ChartFrame>,
    )
    const region = screen.getByRole('region', { name: 'Daily revenue chart' })
    const text = region.textContent ?? ''
    expect(text).not.toMatch(/postgres|supabase|select \*|stack|token|dsn/i)
  })
})

// #400: the kit's own empty-cut string goes through the catalog — needs the provider
// wrapper so the id locale resolves.
describe('ChartFrame — locale seam (#400)', () => {
  beforeEach(() => localStorage.setItem('mos.locale', 'id'))
  afterEach(() => localStorage.clear())

  it('the empty state renders Indonesian when the locale is id', () => {
    render(
      <I18nProvider>
        <ChartFrame title="Pendapatan harian" ariaLabel="Grafik pendapatan harian" tableFallback={FALLBACK} state="empty">
          <div data-testid="chart-body">chart</div>
        </ChartFrame>
      </I18nProvider>,
    )
    expect(screen.getByText('Tidak ada data untuk irisan ini.')).toBeInTheDocument()
    expect(screen.queryByText(/no data for this cut/i)).toBeNull()
  })

  // The error state is the one a floor user meets on a bad connection — the state where
  // English copy costs the most, because it is the copy that says what to do next. Every
  // other load failure in the app already speaks through `common.loadFailed`; this frame
  // was the last one still holding its own English literal.
  it('the error state and its retry control render Indonesian', () => {
    render(
      <I18nProvider>
        <ChartFrame
          title="Pendapatan harian"
          ariaLabel="Grafik pendapatan harian"
          tableFallback={FALLBACK}
          state="error"
          onRetry={() => {}}
        >
          <div data-testid="chart-body">chart</div>
        </ChartFrame>
      </I18nProvider>,
    )
    expect(
      screen.getByText('Gagal memuat grafik ini. Periksa koneksi Anda lalu coba lagi.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument()
    expect(screen.queryByText(/couldn’t load|couldn't load|try again/i)).toBeNull()
  })
})
