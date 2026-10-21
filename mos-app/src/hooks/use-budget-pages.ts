import { useCallback, useRef, useState } from 'react'
import type { BudgetPage, BudgetPageCursor } from '@/lib/db/plan-budget'
import type { BudgetRow } from '@/lib/plan-budget-logic'

const EMPTY_PAGE: BudgetPage = { rows: [], cursor: null, hasMore: false }

type BudgetPagesState = {
  rows: BudgetRow[]
  cursor: BudgetPageCursor | null
  hasMore: boolean
  loadingMore: boolean
  moreError: boolean
  invalidate: () => void
  replacePage: (page: BudgetPage) => void
  loadMore: (readPage: (cursor: BudgetPageCursor) => Promise<BudgetPage>) => Promise<void>
}

export function useBudgetPages(): BudgetPagesState {
  const [page, setPage] = useState(EMPTY_PAGE)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState(false)
  const generation = useRef(0)
  const inFlight = useRef(false)

  const invalidate = useCallback(() => {
    generation.current += 1
    inFlight.current = false
    setLoadingMore(false)
    setMoreError(false)
  }, [])

  const replacePage = useCallback((next: BudgetPage) => {
    generation.current += 1
    inFlight.current = false
    setLoadingMore(false)
    setMoreError(false)
    setPage(next)
  }, [])

  const loadMore = useCallback(async (readPage: (cursor: BudgetPageCursor) => Promise<BudgetPage>) => {
    if (!page.cursor || inFlight.current) return
    const requestGeneration = generation.current
    inFlight.current = true
    setLoadingMore(true)
    setMoreError(false)
    try {
      const next = await readPage(page.cursor)
      if (requestGeneration !== generation.current) return
      setPage((current) => ({
        rows: [...current.rows, ...next.rows],
        cursor: next.cursor,
        hasMore: next.hasMore,
      }))
    } catch {
      if (requestGeneration === generation.current) setMoreError(true)
    } finally {
      if (requestGeneration === generation.current) {
        inFlight.current = false
        setLoadingMore(false)
      }
    }
  }, [page.cursor])

  return {
    rows: page.rows,
    cursor: page.cursor,
    hasMore: page.hasMore,
    loadingMore,
    moreError,
    invalidate,
    replacePage,
    loadMore,
  }
}
