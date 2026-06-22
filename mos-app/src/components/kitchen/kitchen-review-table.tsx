import { KitchenReviewRow } from './kitchen-review-row'
import type { KitchenActionType, PlanMap, ReviewLogRow } from '@/lib/db/kitchen-logs.types'
import './kitchen-review-table.css'

const ACTION_LABEL: Record<KitchenActionType, string> = {
  Production: 'Production',
  'Transfer to Radiant': 'Transfer to Radiant',
  'Transfer to Bungur': 'Transfer to Bungur',
}

function isTransfer(action: KitchenActionType): boolean {
  return action === 'Transfer to Radiant' || action === 'Transfer to Bungur'
}

function planQtyFor(planMap: PlanMap, log: ReviewLogRow): number {
  return planMap[log.wip_item_id]?.[log.action_type] ?? 0
}

export interface KitchenReviewGroup {
  action: KitchenActionType
  rows: ReviewLogRow[]
}

interface KitchenReviewTableProps {
  groups: KitchenReviewGroup[]
  planMap: PlanMap
  peopleMap: Map<string, string>
  productionPending: boolean
  bulkEligible: (action: KitchenActionType) => ReviewLogRow[]
  bulkAction: KitchenActionType | null
  submittingId: string | null
  isOnline: boolean
  onApprove: (logId: string, reviewNote: string | null) => void
  onReject: (logId: string, reviewNote: string) => void
  onBulkApprove: (action: KitchenActionType) => void
}

export function KitchenReviewTable({
  groups,
  planMap,
  peopleMap,
  productionPending,
  bulkEligible,
  bulkAction,
  submittingId,
  isOnline,
  onApprove,
  onReject,
  onBulkApprove,
}: KitchenReviewTableProps) {
  return (
    <div className="krt">
      {groups.map(group => {
        const transferGated = isTransfer(group.action) && productionPending
        const eligibleCount = bulkEligible(group.action).length
        const bulkBusy = bulkAction === group.action

        return (
          <section key={group.action} className="kr-group" aria-label={ACTION_LABEL[group.action]}>
            <div className="kr-group-head">
              <span className="kr-group-label">{ACTION_LABEL[group.action]}</span>
              <span className="kr-group-count tabular">{group.rows.length}</span>
              {transferGated && (
                <span className="kr-group-gate">
                  <span aria-hidden="true" className="kr-info-glyph">ⓘ</span>
                  {' '}Blocked until Production approved
                </span>
              )}
              {eligibleCount > 0 && (
                <button
                  type="button"
                  className="btn btn-primary kr-bulk-btn"
                  aria-label={`Approve all (${eligibleCount}) — ${ACTION_LABEL[group.action]}`}
                  disabled={!isOnline || submittingId !== null || bulkAction !== null}
                  onClick={() => onBulkApprove(group.action)}
                >
                  {bulkBusy ? 'Approving…' : `Approve all (${eligibleCount})`}
                </button>
              )}
            </div>

            <table className="kt-table krt-table">
              <caption className="sr-only">{ACTION_LABEL[group.action]} submitted logs</caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Plan vs logged</th>
                  <th scope="col">Submitter</th>
                  <th scope="col">Time</th>
                  <th scope="col">Note</th>
                  <th scope="col">Decision</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map(log => (
                  <KitchenReviewRow
                    key={log.id}
                    log={log}
                    planQty={planQtyFor(planMap, log)}
                    submitterName={peopleMap.get(log.submitted_by ?? '') ?? '—'}
                    approveDisabled={transferGated || !isOnline}
                    approveDisabledReason={transferGated ? 'Finish Production approvals first.' : ''}
                    submitting={submittingId === log.id}
                    onApprove={onApprove}
                    onReject={onReject}
                  />
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}
