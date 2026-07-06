import { describe, it, expect } from 'vitest'
import { ENTITY_WHITELIST, VALID_TOKENS, MAX_PANELS_PER_VIEW } from './types'

describe('ENTITY_WHITELIST — AC-UV-001', () => {
  it('enumerates exactly the 7 MOS entities', () => {
    expect(Object.keys(ENTITY_WHITELIST).sort()).toEqual([
      'objectives', 'people', 'sales_daily_revenue', 'sales_margin_daily',
      'tasks', 'weekly_updates', 'work_lines',
    ])
  })
  it('each entity carries schema + table (AC-UV-001)', () => {
    expect(ENTITY_WHITELIST.tasks).toMatchObject({ schema: 'mos', table: 'tasks' })
    expect(ENTITY_WHITELIST.people).toMatchObject({ schema: 'shared', table: 'people' })
    expect(ENTITY_WHITELIST.sales_daily_revenue).toMatchObject({ schema: 'reporting', table: 'sales_daily_revenue' })
    expect(ENTITY_WHITELIST.sales_margin_daily).toMatchObject({ schema: 'reporting', table: 'sales_margin_daily' })
  })
  it('org_id is absent from every allowedColumns (never sent by the client)', () => {
    for (const [entity, entry] of Object.entries(ENTITY_WHITELIST)) {
      expect(entry.allowedColumns.has('org_id'), `${entity} must not expose org_id`).toBe(false)
    }
  })
  it('requiresTimeRange is true only for the 4 time-bearing entities', () => {
    expect(ENTITY_WHITELIST.tasks.requiresTimeRange).toBe(true)
    expect(ENTITY_WHITELIST.weekly_updates.requiresTimeRange).toBe(true)
    expect(ENTITY_WHITELIST.sales_daily_revenue.requiresTimeRange).toBe(true)
    expect(ENTITY_WHITELIST.sales_margin_daily.requiresTimeRange).toBe(true)
    expect(ENTITY_WHITELIST.objectives.requiresTimeRange).toBeFalsy()
    expect(ENTITY_WHITELIST.work_lines.requiresTimeRange).toBeFalsy()
    expect(ENTITY_WHITELIST.people.requiresTimeRange).toBeFalsy()
  })
  it('token set is the MOS-pruned set (no $current_team / $current_project)', () => {
    expect([...VALID_TOKENS].sort()).toEqual(
      ['$current_org', '$current_person', '$end_of_month', '$start_of_month', '$today']
    )
  })
  it('MAX_PANELS_PER_VIEW is 20', () => {
    expect(MAX_PANELS_PER_VIEW).toBe(20)
  })
})
