import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CafeItemQuantityEntry } from '@/components/kitchen/cafe-capture-table'
import { useT } from '@/i18n/use-t'
import { listCafeReceivableItems, normalizeCafeReceiptQuantity, type CafeReceivableItem } from '@/lib/db/cafe-receipts'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'
import { useKitchenItemTable } from '@/lib/kitchen-item-list'
import type { CafeStreamCatalog } from '@/lib/use-cafe-stream'

export type CafeItemCaptureLoad = 'loading' | 'ready' | 'error'

/** A typed quantity that is not a positive decimal; it blocks sending rather than being dropped. */
export function isInvalidCafeItemEntry(entry: CafeItemQuantityEntry | undefined): boolean {
  return Boolean(entry?.quantity.trim()) && normalizeCafeReceiptQuantity(entry!.quantity) === null
}

function blankEntries(items: readonly CafeReceivableItem[]): Record<string, CafeItemQuantityEntry> {
  return Object.fromEntries(items.map(item => [item.id, { quantity: '', unitId: item.defaultUnitId, changingUnit: false }]))
}

/**
 * The item-capture state a Café page shares with Receive's job: resolve the stream catalog, load the
 * stream's ESB product details, keep one blank entry per item, and derive the typed lines, invalid
 * count and the search/category-filtered rows (category filtering only where the page shows it).
 */
export function useCafeItemCapture({
  stream,
  enabled,
  resolve,
  adopt,
  search,
  category,
}: {
  stream: ProductionStream | null
  enabled: boolean
  resolve: () => Promise<CafeStreamCatalog>
  adopt: (catalog: CafeStreamCatalog) => void
  search: string
  category: string
}) {
  const t = useT()
  const [catalogReady, setCatalogReady] = useState(false)
  const [loadState, setLoadState] = useState<CafeItemCaptureLoad>('loading')
  const [retryKey, setRetryKey] = useState(0)
  const [items, setItems] = useState<CafeReceivableItem[]>([])
  const [entries, setEntries] = useState<Record<string, CafeItemQuantityEntry>>({})
  const generation = useRef(0)

  useEffect(() => {
    let active = true
    setCatalogReady(false)
    void resolve().then(catalog => {
      if (!active) return
      adopt(catalog)
      setCatalogReady(true)
    }).catch(() => {
      if (active) setLoadState('error')
    })
    return () => { active = false }
  }, [adopt, resolve, retryKey])

  useEffect(() => {
    if (!catalogReady) return
    const current = ++generation.current
    let active = true
    setItems([])
    setEntries({})
    setLoadState('loading')
    if (!stream || !enabled) {
      setLoadState('ready')
      return () => { active = false }
    }
    void listCafeReceivableItems(stream).then(nextItems => {
      if (!active || current !== generation.current) return
      setItems(nextItems)
      setEntries(blankEntries(nextItems))
      setLoadState('ready')
    }).catch(() => {
      if (!active || current !== generation.current) return
      setLoadState('error')
    })
    return () => { active = false }
  }, [catalogReady, enabled, retryKey, stream, stream?.activity, stream?.branch.id])

  const patchEntry = useCallback((itemId: string, patch: Partial<CafeItemQuantityEntry>) => {
    setEntries(current => current[itemId] ? { ...current, [itemId]: { ...current[itemId], ...patch } } : current)
  }, [])
  const resetEntries = useCallback(() => setEntries(blankEntries(items)), [items])
  const retry = useCallback(() => setRetryKey(value => value + 1), [])

  const lines = items.flatMap(item => {
    const entry = entries[item.id]
    const quantity = entry ? normalizeCafeReceiptQuantity(entry.quantity) : null
    return entry && quantity !== null
      ? [{ item, entry, quantity, unitName: item.units.find(unit => unit.id === entry.unitId)?.name ?? '' }]
      : []
  })
  const hasQuantity = items.some(item => Boolean(entries[item.id]?.quantity.trim()))
  const invalidCount = items.filter(item => isInvalidCafeItemEntry(entries[item.id])).length

  const filterRows = useMemo(() => items.map(item => ({
    rowId: item.id,
    kind: item.kind ?? 'Unclassified' as const,
    itemName: item.name,
    category: item.category,
    groupKey: 'capture',
    item,
  })), [items])
  const table = useKitchenItemTable({ data: filterRows, search, kind: 'All', category })
  const visibleItems = table.getFilteredRowModel().rows.map(row => row.original.item)
  const categories = useMemo(() => [
    'All',
    ...Array.from(new Set(items.map(item => item.category ?? '').filter(Boolean)))
      .sort((a, b) => kitchenCategoryLabel(t, a).localeCompare(kitchenCategoryLabel(t, b))),
  ], [items, t])

  return {
    loadState, retry, items, entries, patchEntry, resetEntries,
    lines, hasQuantity, invalidCount, visibleItems, categories,
  }
}
