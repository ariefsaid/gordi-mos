// useMoneyRows — the reporting rows both Money pages read: revenue for everyone the route admits,
// margin only for the margin tier (below it the query is never issued, so no hidden figure reaches
// the browser). The last rows read are kept through a later refresh's loading or failure, and a tab
// left open overnight reads again when the viewer comes back to it.
import { useCallback, useEffect, useRef, useState } from 'react'
import { listSalesDailyRevenue, type SalesDailyRevenueRow } from '@/lib/db/reporting'
import { listSalesMarginDaily, type SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import { ReportingRowCapError } from '@/lib/db/reporting-shared'
import { MONEY_FETCH_DAYS } from '@/lib/money-branch-table'

export interface MoneyRows {
  revenue: SalesDailyRevenueRow[]
  /** Null for a viewer below the margin tier: the query was not issued. */
  margin: SalesMarginDailyRow[] | null
}

export interface MoneyLoad {
  status: 'loading' | 'ready' | 'error'
  /** The last rows read, kept through a later refresh's loading or failure. */
  data: MoneyRows | null
  /** The failure was the read's row ceiling, not the service: reading again cannot help. */
  tooMany?: boolean
}

export function useMoneyRows(canSeeMargin: boolean): { load: MoneyLoad; read: () => Promise<void> } {
  const [load, setLoad] = useState<MoneyLoad>({ status: 'loading', data: null })
  const dataRef = useRef<MoneyRows | null>(null)
  // Reads can overlap (a Retry, a tab coming back); only the latest one may land.
  const latestRead = useRef(0)
  const read = useCallback(async () => {
    const id = ++latestRead.current
    setLoad({ status: 'loading', data: dataRef.current })
    try {
      const [revenue, margin] = await Promise.all([
        listSalesDailyRevenue({ sinceDays: MONEY_FETCH_DAYS }),
        canSeeMargin ? listSalesMarginDaily({ sinceDays: MONEY_FETCH_DAYS }) : Promise.resolve(null),
      ])
      if (id !== latestRead.current) return
      dataRef.current = { revenue, margin }
      setLoad({ status: 'ready', data: dataRef.current })
    } catch (error) {
      if (id !== latestRead.current) return
      setLoad({ status: 'error', data: dataRef.current, tooMany: error instanceof ReportingRowCapError })
    }
  }, [canSeeMargin])

  useEffect(() => {
    void read()
    const onVisible = () => { if (document.visibilityState === 'visible') void read() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [read])

  return { load, read }
}
