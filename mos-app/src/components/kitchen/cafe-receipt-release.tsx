import { useCallback, useEffect, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { listCafeHeldReceipts, releaseCafeReceipts, type CafeHeldReceipts } from '@/lib/db/cafe-receipts'
import './cafe-receipt.css'

type Outcome = { text: string; failed: boolean }

/** FR-1030: once a branch posts receipts, an ops lead or admin releases its held receipts. The server lists only for them. */
export function CafeReceiptRelease({ online }: { online: boolean }) {
  const t = useT()
  const [branches, setBranches] = useState<CafeHeldReceipts[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const load = useCallback(() => listCafeHeldReceipts()
    .then(rows => rows.filter(row => row.postingEnabled && row.heldReceipts > 0))
    .catch((): CafeHeldReceipts[] => []), [])

  useEffect(() => {
    let active = true
    void load().then(rows => { if (active) setBranches(rows) })
    return () => { active = false }
  }, [load])

  async function release(branch: CafeHeldReceipts) {
    if (busyId || !online) return
    setBusyId(branch.branchId)
    setOutcome(null)
    try {
      const result = await releaseCafeReceipts(branch.branchId)
      setOutcome({
        failed: false,
        text: result.waitingForPoData
          ? t('cafe.receipts.release.noData', { branch: branch.branchName })
          : t('cafe.receipts.release.done', { branch: branch.branchName, queued: result.queuedPortions, held: result.heldPortions }),
      })
      setBranches(await load())
    } catch {
      setOutcome({ failed: true, text: t('cafe.receipts.release.failed') })
    } finally {
      setBusyId(null)
    }
  }

  if (branches.length === 0 && !outcome) return null
  return (
    <section className="cafe-receipt-release" aria-label={t('cafe.receipts.release.aria')}>
      {branches.map(branch => (
        <div className="cafe-receipt-release__row" key={branch.branchId}>
          <p>{t('cafe.receipts.release.held', { branch: branch.branchName, count: branch.heldReceipts })}</p>
          <button
            type="button"
            className="btn btn-outline btn-touch"
            disabled={!online || busyId !== null}
            onClick={() => void release(branch)}
          >
            {busyId === branch.branchId ? t('common.working') : t('cafe.receipts.release.action')}
          </button>
        </div>
      ))}
      {outcome && (
        <p className={outcome.failed ? 'cafe-receipt-release__error' : undefined} role={outcome.failed ? 'alert' : 'status'}>
          {outcome.text}
        </p>
      )}
    </section>
  )
}
