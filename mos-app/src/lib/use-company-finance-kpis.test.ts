// use-company-finance-kpis.test.ts — tests for the revenue/margin KPI hook.
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCompanyFinanceKpis } from './use-company-finance-kpis'

vi.mock('./db/reporting')
vi.mock('./db/reporting-margin')

import { listSalesDailyRevenue } from './db/reporting'
import { listSalesMarginDaily } from './db/reporting-margin'
import type { SalesDailyRevenueRow } from './db/reporting'
import type { SalesMarginDailyRow } from './db/reporting-margin'

const mockListSalesDailyRevenue = vi.mocked(listSalesDailyRevenue)
const mockListSalesMarginDaily = vi.mocked(listSalesMarginDaily)

describe('useCompanyFinanceKpis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('I-4: both parameters required', () => {
    it('accepts both parameters explicitly', () => {
      mockListSalesDailyRevenue.mockResolvedValue([])
      mockListSalesMarginDaily.mockResolvedValue([])
      const { result } = renderHook(() => useCompanyFinanceKpis(true, true))
      expect(result.current).toBeDefined()
    })
  })

  describe('I-5: skip path reaches terminal state', () => {
    it('sets marginState to "ready" (not stuck in "loading") when canSeeMargin is false', async () => {
      mockListSalesDailyRevenue.mockResolvedValue([])
      const { result } = renderHook(() => useCompanyFinanceKpis(true, false))

      // Initially loading
      expect(result.current.marginState).toBe('ready')

      // Verify fetch was skipped (never called)
      await waitFor(() => {
        expect(mockListSalesMarginDaily).not.toHaveBeenCalled()
      })

      // State stays terminal (not "loading" forever)
      expect(result.current.marginState).toBe('ready')
    })

    it('sets revenueState to "ready" when canSeeRevenue is false', async () => {
      const { result } = renderHook(() => useCompanyFinanceKpis(false, false))

      // Wait for effect to run and set terminal state
      await waitFor(() => {
        expect(result.current.revenueState).toBe('ready')
      })

      // Verify fetch was skipped
      expect(mockListSalesDailyRevenue).not.toHaveBeenCalled()
    })

    it('issues both fetches when both permissions are true', async () => {
      const revenueRows: SalesDailyRevenueRow[] = [
        {
          revenue_date: '2026-07-01',
          channel: 'POS',
          esb_code: 'E001',
          branch_code: 'B001',
          branch_name: 'Branch 1',
          transactions: 100,
          clean_revenue: 1000000,
          snapshot_as_of: '2026-07-02T00:00:00Z',
          source_contract_version: 'v1',
        },
        {
          revenue_date: '2026-07-02',
          channel: 'POS',
          esb_code: 'E001',
          branch_code: 'B001',
          branch_name: 'Branch 1',
          transactions: 110,
          clean_revenue: 1100000,
          snapshot_as_of: '2026-07-03T00:00:00Z',
          source_contract_version: 'v1',
        },
      ]
      const marginRows: SalesMarginDailyRow[] = [
        {
          margin_date: '2026-07-01',
          esb_code: 'E001',
          branch_code: 'B001',
          branch_name: 'Branch 1',
          revenue: 1000000,
          cogs_interim_sm: 745000,
          cogs_budget_bom: 750000,
          margin_interim: 5000,
          margin_interim_pct: 25.5,
          bom_coverage_pct: 95,
          snapshot_as_of: '2026-07-02T00:00:00Z',
          source_contract_version: 'v1',
        },
        {
          margin_date: '2026-07-02',
          esb_code: 'E001',
          branch_code: 'B001',
          branch_name: 'Branch 1',
          revenue: 1100000,
          cogs_interim_sm: 813000,
          cogs_budget_bom: 825000,
          margin_interim: 7000,
          margin_interim_pct: 26.0,
          bom_coverage_pct: 95,
          snapshot_as_of: '2026-07-03T00:00:00Z',
          source_contract_version: 'v1',
        },
      ]
      mockListSalesDailyRevenue.mockResolvedValue(revenueRows)
      mockListSalesMarginDaily.mockResolvedValue(marginRows)

      const { result } = renderHook(() => useCompanyFinanceKpis(true, true))

      // Both start loading
      expect(result.current.revenueState).toBe('loading')
      expect(result.current.marginState).toBe('loading')

      // Wait for both to complete
      await waitFor(() => {
        expect(result.current.revenueState).toBe('ready')
        expect(result.current.marginState).toBe('ready')
      })

      // Both fetches were called
      expect(mockListSalesDailyRevenue).toHaveBeenCalledWith({ sinceDays: 60 })
      expect(mockListSalesMarginDaily).toHaveBeenCalledWith({ sinceDays: 60 })
    })

    it('supervisor path: revenue fetches, margin skips to terminal state', async () => {
      const revenueRows: SalesDailyRevenueRow[] = [
        {
          revenue_date: '2026-07-01',
          channel: 'POS',
          esb_code: 'E001',
          branch_code: 'B001',
          branch_name: 'Branch 1',
          transactions: 100,
          clean_revenue: 1000000,
          snapshot_as_of: '2026-07-02T00:00:00Z',
          source_contract_version: 'v1',
        },
      ]
      mockListSalesDailyRevenue.mockResolvedValue(revenueRows)

      const { result } = renderHook(() =>
        useCompanyFinanceKpis(
          true, // supervisor sees revenue
          false, // supervisor does NOT see margin
        ),
      )

      // Revenue loads, margin is ready (no fetch)
      expect(result.current.revenueState).toBe('loading')
      expect(result.current.marginState).toBe('ready')

      await waitFor(() => {
        expect(result.current.revenueState).toBe('ready')
      })

      // Revenue was called, margin was not
      expect(mockListSalesDailyRevenue).toHaveBeenCalledTimes(1)
      expect(mockListSalesMarginDaily).not.toHaveBeenCalled()

      // Terminal states confirmed
      expect(result.current.revenueState).toBe('ready')
      expect(result.current.marginState).toBe('ready')
    })

    it('member path: both skip to terminal state', async () => {
      const { result } = renderHook(() =>
        useCompanyFinanceKpis(
          false, // member sees neither
          false,
        ),
      )

      // Wait for effects to run and set terminal states
      await waitFor(() => {
        expect(result.current.revenueState).toBe('ready')
        expect(result.current.marginState).toBe('ready')
      })

      // Neither fetch was called
      expect(mockListSalesDailyRevenue).not.toHaveBeenCalled()
      expect(mockListSalesMarginDaily).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('sets revenueState to "error" on fetch failure', async () => {
      mockListSalesDailyRevenue.mockRejectedValue(new Error('fetch failed'))

      const { result } = renderHook(() => useCompanyFinanceKpis(true, false))

      await waitFor(() => {
        expect(result.current.revenueState).toBe('error')
      })
    })

    it('sets marginState to "error" on fetch failure', async () => {
      mockListSalesDailyRevenue.mockResolvedValue([])
      mockListSalesMarginDaily.mockRejectedValue(new Error('fetch failed'))

      const { result } = renderHook(() => useCompanyFinanceKpis(true, true))

      await waitFor(() => {
        expect(result.current.marginState).toBe('error')
      })
    })
  })
})