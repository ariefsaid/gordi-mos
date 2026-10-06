import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { listCafeHeldReceipts, releaseCafeReceipts, type CafeHeldReceipts } from '@/lib/db/cafe-receipts'
import './cafe-receipt.css'

type Outcome = { branchId: string; text: string; failed: boolean }

/**
 * FR-1030: once a branch posts receipts, an ops lead or admin releases its held receipts. The server
 * lists only for them; `refreshKey` re-reads the list after the queue decides a receipt.
 */
export function CafeReceiptRelease({ online, refreshKey = 0 }: { online: boolean; refreshKey?: number }) {
  const t = useT()
  const titleId = useId()
  const [branches, setBranches] = useState<CafeHeldReceipts[] | 'failed'>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const outcomeRef = useRef<HTMLParagraphElement>(null)

  const load = useCallback(() => listCafeHeldReceipts()
    .then(rows => rows.filter(row => row.postingEnabled && row.heldReceipts > 0))
    .catch((): 'failed' => 'failed'), [])

  useEffect(() => {
    let active = true
    void load().then(rows => { if (active) setBranches(rows) })
    return () => { active = false }
  }, [load, refreshKey])

  // The pressed row may leave the list, so focus moves to the outcome that replaces it.
  useEffect(() => { if (outcome) outcomeRef.current?.focus() }, [outcome])

  async function release(branch: CafeHeldReceipts) {
    if (busyId || !online) return
    setBusyId(branch.branchId)
    setOutcome(null)
    try {
      const result = await releaseCafeReceipts(branch.branchId)
      const text = result.waitingForPoData
        ? t('cafe.receipts.release.noData', { branch: branch.branchName })
        : [
            t('cafe.receipts.release.done', { branch: branch.branchName, queued: result.releasedReceipts, held: result.heldReceipts }),
            result.heldLocationMissing > 0 ? t('cafe.receipts.release.doneLocation') : '',
          ].filter(Boolean).join(' ')
      setBranches(await load())
      setOutcome({ branchId: branch.branchId, failed: false, text })
    } catch (error) {
      const postingOff = error instanceof Error && error.message.includes('CAFE_RECEIPT_POSTING_OFF')
      setOutcome({
        branchId: branch.branchId,
        failed: true,
        text: t(postingOff ? 'cafe.receipts.release.postingOff' : 'cafe.receipts.release.failed', { branch: branch.branchName }),
      })
    } finally {
      setBusyId(null)
    }
  }

  const rows = branches === 'failed' ? [] : branches
  if (branches !== 'failed' && rows.length === 0 && !outcome) return null
  const outcomeLine = outcome && (
    <p
      ref={outcomeRef}
      tabIndex={-1}
      className={outcome.failed ? 'cafe-receipt-release__outcome cafe-receipt-release__outcome--failed' : 'cafe-receipt-release__outcome'}
      role={outcome.failed ? 'alert' : 'status'}
    >
      {outcome.text}
    </p>
  )
  return (
    <section className="cafe-receipt-release" aria-labelledby={titleId}>
      <h3 id={titleId} className="cafe-receipt-release__title">{t('cafe.receipts.release.title')}</h3>
      <p className="cafe-receipt-release__help">{t('cafe.receipts.release.help')}</p>
      {branches === 'failed' && <p className="cafe-receipt-release__outcome--failed" role="alert">{t('cafe.receipts.release.loadFailed')}</p>}
      <ul className="cafe-receipt-release__list">
        {rows.map(branch => (
          <li className="cafe-receipt-release__row" key={branch.branchId}>
            <p>{t('cafe.receipts.release.held', { branch: branch.branchName, count: branch.heldReceipts })}</p>
            <button
              type="button"
              className="btn btn-outline btn-touch"
              aria-label={t('cafe.receipts.release.actionAria', { branch: branch.branchName })}
              disabled={!online || busyId !== null}
              onClick={() => void release(branch)}
            >
              {busyId === branch.branchId ? t('common.working') : t('cafe.receipts.release.action')}
            </button>
            {outcome?.branchId === branch.branchId && outcomeLine}
          </li>
        ))}
        {outcome && !rows.some(branch => branch.branchId === outcome.branchId) && (
          <li className="cafe-receipt-release__row">{outcomeLine}</li>
        )}
      </ul>
    </section>
  )
}
