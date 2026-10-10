import { useEffect } from 'react'
import type { MoneyView } from '@/lib/money-branch-table'

type SetSearchParams = (params: URLSearchParams, options: { replace: true }) => void

type UseNormalizeMoneyRangeOptions = {
  searchParams: URLSearchParams
  setSearchParams: SetSearchParams
  ready: boolean
  view: Pick<MoneyView, 'period' | 'range'>
}

export function useNormalizeMoneyRange({ searchParams, setSearchParams, ready, view }: UseNormalizeMoneyRangeOptions) {
  useEffect(() => {
    if (!ready || searchParams.get('period') !== 'custom' || view.range) return
    const next = new URLSearchParams(searchParams)
    next.delete('from')
    next.delete('to')
    next.set('period', String(view.period))
    setSearchParams(next, { replace: true })
  }, [ready, searchParams, setSearchParams, view.period, view.range])
}
