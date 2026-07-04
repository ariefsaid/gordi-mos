// home-kpis.ts selector tests — TDD (AC-tagged).
// Covers AC-HK01 (trailing margin window sum + prior-window delta) and AC-HK02
// (NULL margin never renders as a fake 0/NaN — "no data"/"no comparison"), plus
// openTaskCount (clone of MyTasksCard's R/A non-Done filter for the Home tasks tile).

import { describe, it, expect } from 'vitest'
import type { SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import type { TaskListRow } from '@/lib/db/tasks.types'
import {
  trailingMargin,
  formatMarginKpi,
  openTaskCount,
} from './home-kpis'

function marginRow(overrides: Partial<SalesMarginDailyRow>): SalesMarginDailyRow {
  return {
    margin_date: '2026-06-30',
    esb_code: 'GHQ',
    branch_code: 'GHQ',
    branch_name: 'Gordi HQ',
    revenue: 10_000_000,
    cogs_interim_sm: 6_000_000,
    cogs_budget_bom: 5_800_000,
    margin_interim: 4_000_000,
    margin_interim_pct: 0.4,
    bom_coverage_pct: 0.95,
    snapshot_as_of: '2026-07-01T02:00:00Z',
    source_contract_version: 'pos_margin_interim.v1',
    ...overrides,
  }
}

// ── trailingMargin (AC-HK01) ──────────────────────────────────────────────────
describe('trailingMargin', () => {
  it('AC-HK01: sums margin_interim over the trailing window anchored to latestDate', () => {
    const rows = [
      marginRow({ margin_date: '2026-06-24', margin_interim: 1_000_000 }),
      marginRow({ margin_date: '2026-06-25', margin_interim: 1_000_000 }),
      marginRow({ margin_date: '2026-06-30', margin_interim: 2_000_000 }),
    ]
    const w = trailingMargin(rows, '2026-06-30', 7)
    expect(w.current).toBe(4_000_000)
  })

  it('AC-HK01: returns the prior equal-length window sum when prior rows exist', () => {
    const rows = [
      // prior window: 2026-06-16..2026-06-22 (days-7)
      marginRow({ margin_date: '2026-06-18', margin_interim: 500_000 }),
      // current window: 2026-06-24..2026-06-30
      marginRow({ margin_date: '2026-06-30', margin_interim: 2_000_000 }),
    ]
    const w = trailingMargin(rows, '2026-06-30', 7)
    expect(w.prior).toBe(500_000)
  })

  it('AC-HK01: returns prior=null when no rows exist in the prior window', () => {
    const rows = [marginRow({ margin_date: '2026-06-30', margin_interim: 2_000_000 })]
    const w = trailingMargin(rows, '2026-06-30', 7)
    expect(w.prior).toBeNull()
  })

  it('AC-HK02: rows with NULL margin_interim contribute nothing to the sum (never a fake number)', () => {
    const rows = [
      marginRow({ margin_date: '2026-06-29', margin_interim: null, cogs_interim_sm: null }),
      marginRow({ margin_date: '2026-06-30', margin_interim: 1_000_000 }),
    ]
    const w = trailingMargin(rows, '2026-06-30', 7)
    expect(w.current).toBe(1_000_000)
  })
})

// ── formatMarginKpi (AC-HK02) ─────────────────────────────────────────────────
describe('formatMarginKpi', () => {
  it('AC-HK02: formats value + delta + a margin-pct sub when pct is present', () => {
    const display = formatMarginKpi({ current: 4_000_000, prior: 2_000_000 }, 0.4)
    expect(display.value).toMatch(/Rp/)
    expect(display.delta.tone).toBe('success')
    expect(display.pctSub).toMatch(/40(\.0)?% margin/)
  })

  it('AC-HK02: pct is null (not NaN) when revenue was 0/absent — sub is blank, delta is "no comparison"', () => {
    const display = formatMarginKpi({ current: 0, prior: null }, null)
    expect(display.delta.text).toBe('no comparison')
    expect(display.pctSub).toBe('')
  })
})

// ── openTaskCount ──────────────────────────────────────────────────────────────
function task(overrides: Partial<TaskListRow>): TaskListRow {
  return {
    id: 't-1',
    org_id: 'org-1',
    title: 'Task',
    business_unit_id: 'bu-1',
    status: 'In Progress',
    responsible_person_id: 'viewer-1',
    accountable_person_id: 'other-1',
    consulted_person_ids: [],
    informed_person_ids: [],
    description: null,
    due_date: null,
    objective_id: null,
    work_line_id: null,
    last_activity_at: '2026-06-30T00:00:00Z',
    archived_at: null,
    created_by: 'viewer-1',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-30T00:00:00Z',
    ...overrides,
  }
}

describe('openTaskCount', () => {
  it('counts tasks where the viewer is Responsible or Accountable and status is not Done', () => {
    const tasks = [
      task({ id: 't-1', responsible_person_id: 'viewer-1', status: 'In Progress' }),
      task({ id: 't-2', accountable_person_id: 'viewer-1', responsible_person_id: 'other', status: 'Blocked' }),
      task({ id: 't-3', responsible_person_id: 'other', accountable_person_id: 'other', status: 'In Progress' }),
    ]
    expect(openTaskCount(tasks, 'viewer-1')).toBe(2)
  })

  it('excludes Done tasks even when the viewer is R/A', () => {
    const tasks = [
      task({ id: 't-1', responsible_person_id: 'viewer-1', status: 'Done' }),
    ]
    expect(openTaskCount(tasks, 'viewer-1')).toBe(0)
  })

  it('returns 0 for an empty task list', () => {
    expect(openTaskCount([], 'viewer-1')).toBe(0)
  })
})
