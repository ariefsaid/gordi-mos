import { clearCafeReceiptExplanationDrafts } from '@/lib/cafe-receipt-explanation-draft'
import { clearAllCafeReceiveDrafts } from '@/lib/cafe-receive-drafts'
import { clearAllOfflinePhotoDrafts } from '@/lib/offline-photo-drafts'

/**
 * Remove every unsent draft this device holds, for every person: line explanations, receipt
 * counts and the private photos waiting to upload. Sign-out calls it, so a shared phone keeps
 * nothing of one receiver for the next.
 */
export async function clearDeviceDrafts(): Promise<void> {
  clearCafeReceiptExplanationDrafts()
  clearAllCafeReceiveDrafts()
  await clearAllOfflinePhotoDrafts()
}
