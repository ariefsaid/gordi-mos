// A receiver's unsaved line explanations on a Counted receipt, kept on this device (FR-1010).
//
// The receipt itself is the server-side draft: quantities lock at Count and photos save on upload.
// Only a flag or reason the receiver has changed but not yet saved lives here, keyed by person and
// receipt, so a reload or a lost connection does not drop what they typed. Send or a save that
// brings the line back to the server's value removes it.

import type { CafeReceiptCondition } from '@/lib/db/cafe-receipts'

export type CafeReceiptExplanation = { conditions: CafeReceiptCondition[]; condition_reason: string | null }
type Drafts = Record<string, CafeReceiptExplanation>

const STORAGE_KEY = 'mos.cafe.receiptExplanations'

function key(viewerId: string, receiptId: string) {
  return `${STORAGE_KEY}.${viewerId}.${receiptId}`
}

function isExplanation(value: unknown): value is CafeReceiptExplanation {
  if (!value || typeof value !== 'object') return false
  const { conditions, condition_reason: reason } = value as Record<string, unknown>
  return Array.isArray(conditions) && conditions.every(condition => condition === 'damaged_wrong')
    && (reason === null || (typeof reason === 'string' && reason.length <= 500))
}

/** The unsaved explanations for one receipt, by line id; malformed or unreadable storage reads as none. */
export function readCafeReceiptExplanationDrafts(viewerId: string, receiptId: string): Drafts {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key(viewerId, receiptId)) ?? '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => isExplanation(value))) as Drafts
  } catch {
    return {}
  }
}

/** Replace the receipt's unsaved explanations; an empty set removes its entry. */
export function writeCafeReceiptExplanationDrafts(viewerId: string, receiptId: string, drafts: Drafts): void {
  try {
    if (Object.keys(drafts).length === 0) window.localStorage.removeItem(key(viewerId, receiptId))
    else window.localStorage.setItem(key(viewerId, receiptId), JSON.stringify(drafts))
  } catch { /* storage disabled: the explanation still saves, it just does not outlive the page */ }
}

/** Whether a line's explanation differs from what the server holds; reasons compare trimmed, as the server stores them. */
export function explanationDiffers(line: CafeReceiptExplanation, server: CafeReceiptExplanation | undefined): boolean {
  const reason = (value: string | null) => value?.trim() || null
  return [...line.conditions].sort().join() !== [...(server?.conditions ?? [])].sort().join()
    || reason(line.condition_reason) !== reason(server?.condition_reason ?? null)
}
