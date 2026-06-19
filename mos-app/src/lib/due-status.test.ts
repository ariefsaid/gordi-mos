import { describe, it, expect } from 'vitest'
import { dueStatus, isOverdue } from './due-status'
import type { TaskListRow } from './db/tasks.types'

// Fixed clock: 2026-06-10T05:00:00Z = 12:00 WIB on Wed 10 Jun 2026. "Today in WIB" = 2026-06-10.
const NOON_WIB = new Date('2026-06-10T05:00:00Z')

describe('dueStatus (AC-062)', () => {
  it('AC-062: classifies a due date one day before today-WIB as overdue', () => {
    expect(dueStatus('2026-06-09', NOON_WIB)).toBe('overdue')
  })
  it('AC-062: classifies today-WIB as soon (0 days <= 3)', () => {
    expect(dueStatus('2026-06-10', NOON_WIB)).toBe('soon')
  })
  it('AC-062: classifies today+3 as soon (boundary of the soon window)', () => {
    expect(dueStatus('2026-06-13', NOON_WIB)).toBe('soon')
  })
  it('AC-062: classifies today+4 as calm (just past the soon window)', () => {
    expect(dueStatus('2026-06-14', NOON_WIB)).toBe('calm')
  })
  it('AC-062: classifies a null due date as none', () => {
    expect(dueStatus(null, NOON_WIB)).toBe('none')
  })

  // No host-tz leak: 05:00 WIB on Wed 10 Jun is still "today in WIB". A naive UTC-day implementation
  // would read 2026-06-09 here and misclassify. The WIB +7h offset keeps "today" = 2026-06-10.
  const EARLY_WIB = new Date('2026-06-09T22:00:00Z') // = 05:00 WIB Wed 10 Jun
  it('AC-062: WIB boundary — early-morning WIB still treats 2026-06-10 as today (overdue arm holds)', () => {
    expect(dueStatus('2026-06-09', EARLY_WIB)).toBe('overdue')
  })
  it('AC-062: WIB boundary — early-morning WIB still treats today as soon', () => {
    expect(dueStatus('2026-06-10', EARLY_WIB)).toBe('soon')
  })
  it('AC-062: WIB boundary — early-morning WIB still treats today+4 as calm', () => {
    expect(dueStatus('2026-06-14', EARLY_WIB)).toBe('calm')
  })
})

// ── RI-1: isOverdue excludes Done and archived tasks ──────────────────────────
// Regression invariant: a Done task with a past due_date is NOT overdue (it is
// finished, not drifting). An archived task is likewise excluded.
// JTBD OD-P0-8: off-track = drifting work, not finished.
function makeMinimalTask(overrides: Partial<TaskListRow>): TaskListRow {
  return {
    id: 'task-1', org_id: 'org', title: 'Task',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: 'p1', accountable_person_id: 'p1',
    consulted_person_ids: [], informed_person_ids: [],
    description: null, due_date: '2020-01-01', last_activity_at: '2026-06-01T00:00:00Z',
    archived_at: null, created_by: 'p1',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('isOverdue (RI-1)', () => {
  it('RI-1: non-Done task with past due_date IS overdue', () => {
    const task = makeMinimalTask({ status: 'Open', due_date: '2020-01-01' })
    expect(isOverdue(task, NOON_WIB)).toBe(true)
  })

  it('RI-1: Done task with a past due_date is NOT overdue (finished, not drifting)', () => {
    const task = makeMinimalTask({ status: 'Done', due_date: '2020-01-01' })
    expect(isOverdue(task, NOON_WIB)).toBe(false)
  })

  it('RI-1: archived task with a past due_date is NOT overdue', () => {
    const task = makeMinimalTask({ status: 'Open', due_date: '2020-01-01', archived_at: '2026-05-01T00:00:00Z' })
    expect(isOverdue(task, NOON_WIB)).toBe(false)
  })

  it('RI-1: Done AND archived task with a past due_date is NOT overdue', () => {
    const task = makeMinimalTask({ status: 'Done', due_date: '2020-01-01', archived_at: '2026-05-01T00:00:00Z' })
    expect(isOverdue(task, NOON_WIB)).toBe(false)
  })

  it('RI-1: non-Done task with null due_date is NOT overdue', () => {
    const task = makeMinimalTask({ status: 'Open', due_date: null })
    expect(isOverdue(task, NOON_WIB)).toBe(false)
  })

  it('RI-1: non-Done task with future due_date is NOT overdue', () => {
    const task = makeMinimalTask({ status: 'In Progress', due_date: '2030-12-31' })
    expect(isOverdue(task, NOON_WIB)).toBe(false)
  })
})
