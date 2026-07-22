import { describe, it, expect } from 'vitest'
import {
  daysOverdue, overdueStreamItems, dueTodayStreamItems, blockedStreamItems,
  failedCheckStreamItems, mentionStreamItems, myWorkStreamItems, openTaskCount,
  type AttentionDirectory,
} from './home-stream'
import type { TaskListRow, TaskStatus } from '@/lib/db/tasks.types'
import type { AttentionItem } from '@/lib/home-attention'

const VIEWER = 'p-viewer'
const TODAY = '2026-07-22'

function task(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 't-' + Math.random().toString(36).slice(2, 8),
    org_id: 'org-1',
    title: 'A task',
    business_unit_id: 'bu-cafe',
    status: 'In Progress' as TaskStatus,
    responsible_person_id: VIEWER,
    accountable_person_id: 'p-other',
    consulted_person_ids: [],
    informed_person_ids: [],
    description: null,
    due_date: null,
    objective_id: null,
    work_line_id: null,
    last_activity_at: '2026-07-01T00:00:00Z',
    archived_at: null,
    created_by: 'p-other',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

const dir: AttentionDirectory = {
  people: new Map([[VIEWER, 'Vera Viewer']]),
  businessUnits: new Map([['bu-cafe', 'Café']]),
}

describe('daysOverdue', () => {
  it('counts whole days between due and today (WIB calendar dates)', () => {
    expect(daysOverdue('2026-07-13', '2026-07-22')).toBe(9)
    expect(daysOverdue('2026-07-22', '2026-07-22')).toBe(0)
  })
  it('never returns negative (a future due date clamps to 0)', () => {
    expect(daysOverdue('2026-08-01', '2026-07-22')).toBe(0)
  })
})

describe('overdueStreamItems', () => {
  it('surfaces owned, non-Done tasks due before today with an "overdue" reason carrying the day count', () => {
    const items = overdueStreamItems([
      task({ id: 't-late', title: 'Restock oat milk', due_date: '2026-07-13' }),
      task({ id: 't-future', due_date: '2026-08-01' }),
      task({ id: 't-done', due_date: '2020-01-01', status: 'Done' }),
      task({ id: 't-notmine', due_date: '2020-01-01', responsible_person_id: 'x', accountable_person_id: 'y' }),
    ], VIEWER, TODAY, 'en', dir)
    expect(items.map(i => i.id)).toEqual(['t-late'])
    expect(items[0].reason).toEqual({ tone: 'overdue', days: 9 })
    expect(items[0].status).toBe('In Progress')
    expect(items[0].route).toBe('/work/tasks/t-late')
    expect(items[0].pic?.name).toBe('Vera Viewer')
    expect(items[0].caption).toBe('Café')
  })
})

describe('dueTodayStreamItems', () => {
  it('surfaces owned tasks due exactly today with a "due" reason', () => {
    const items = dueTodayStreamItems([
      task({ id: 't-today', due_date: TODAY }),
      task({ id: 't-late', due_date: '2026-07-13' }),
    ], VIEWER, TODAY)
    expect(items.map(i => i.id)).toEqual(['t-today'])
    expect(items[0].reason).toEqual({ tone: 'due' })
  })
})

describe('blockedStreamItems', () => {
  it('surfaces owned Blocked tasks that are NOT already overdue/due-today', () => {
    const items = blockedStreamItems([
      task({ id: 't-blocked', status: 'Blocked', due_date: '2026-08-01' }),
      task({ id: 't-blocked-today', status: 'Blocked', due_date: TODAY }),   // due-today owns it
      task({ id: 't-blocked-late', status: 'Blocked', due_date: '2026-07-13' }), // overdue owns it
      task({ id: 't-open', status: 'Open', due_date: null }),
    ], VIEWER, TODAY)
    expect(items.map(i => i.id)).toEqual(['t-blocked'])
    expect(items[0].reason).toEqual({ tone: 'blocked' })
  })
})

describe('failedCheckStreamItems / mentionStreamItems', () => {
  it('decorate pre-built attention items with their reason tone', () => {
    const raw: AttentionItem[] = [{ id: 'c-1', title: 'Reject · 2026-07-20', route: '/cafe/log' }]
    expect(failedCheckStreamItems(raw)[0].reason).toEqual({ tone: 'check' })
    expect(mentionStreamItems(raw)[0].reason).toEqual({ tone: 'mention' })
  })
})

describe('myWorkStreamItems', () => {
  it('excludes ids already ranked above, sorts off-track first, and leaves plain rows without a reason', () => {
    const items = myWorkStreamItems([
      task({ id: 't-ranked', due_date: '2026-07-13' }),        // excluded (already overdue)
      task({ id: 't-soon', due_date: '2026-07-25' }),
      task({ id: 't-blocked', status: 'Blocked', due_date: null }), // off-track → first, keeps reason
      task({ id: 't-done', status: 'Done' }),                   // never (Done)
    ], VIEWER, TODAY, 'en', undefined, new Set(['t-ranked']))
    expect(items.map(i => i.id)).toEqual(['t-blocked', 't-soon'])
    expect(items[0].reason).toEqual({ tone: 'blocked' })
    expect(items[1].reason).toBeUndefined()
  })
})

describe('openTaskCount', () => {
  it('counts owned, non-Done tasks', () => {
    expect(openTaskCount([
      task({ status: 'Open' }),
      task({ status: 'Done' }),
      task({ responsible_person_id: 'x', accountable_person_id: 'y' }),
    ], VIEWER)).toBe(1)
  })
})
