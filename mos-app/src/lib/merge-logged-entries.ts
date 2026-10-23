import type { ActualUnitTotal } from '@/lib/db/kitchen-logs.types'

/**
 * Entries kept per log stay separate in the data (each keeps the amount and unit it was typed in), but two
 * entries in the same recorded unit and multiple read as one total on screen, never the same text twice.
 * Entries with an unknown unit are never merged.
 */
export function mergeSameLoggedEntries(entries: readonly ActualUnitTotal[]): ActualUnitTotal[] {
  const merged: ActualUnitTotal[] = []
  for (const entry of entries) {
    const same = entry.item_unit_id === null || entry.entry_quantity == null ? undefined : merged.find(candidate =>
      candidate.item_unit_id === entry.item_unit_id && candidate.entry_quantity != null
      && candidate.entry_unit_name === entry.entry_unit_name && (candidate.entry_unit_factor ?? 1) === (entry.entry_unit_factor ?? 1))
    if (same) {
      same.qty_porsi += entry.qty_porsi
      same.entry_quantity = (same.entry_quantity ?? 0) + entry.entry_quantity!
    } else merged.push({ ...entry })
  }
  return merged
}
