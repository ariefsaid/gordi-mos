import { describe, expect, it } from 'vitest'
import {
  checkPresentationCompatibility,
  writeCollectionQuery,
} from './query-state'
import {
  signalCollectionQuery,
  signalPresentationCompatibleKeys,
  type SignalCollectionPresentation,
  type SignalCollectionQuery,
} from '@/components/signals/signal-collection-adapter'
import {
  taskCollectionQuery,
  taskPresentationCompatibleKeys,
  type TaskCollectionPresentation,
  type TaskCollectionQuery,
} from '@/components/tasks/task-collection-query'

describe('query-state', () => {
  it('clears neutral Task constraints while preserving record and unrelated route state', () => {
    const source = new URLSearchParams('saved=old&overdue=1&view=overdue&q=old&person=p1&record=t1&sourceSignal=s1')
    const next = writeCollectionQuery<TaskCollectionQuery>(taskCollectionQuery, { ...taskCollectionQuery.neutral, view: 'my-work' }, source)
    expect(next.toString()).toBe('record=t1&sourceSignal=s1&view=my-work')
  })

  it('FR-V3-007: Signal Feed query preserves compatible filters, sort, grouping, and URL state', () => {
    const params = new URLSearchParams(
      'layout=feed&view=needs-attention&q=freezer&attention=Needs%20attention&sort=occurredAt&dir=descending&saved=v-9',
    )
    const parsed = signalCollectionQuery.parse(params, 'feed')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.query.view).toBe('needs-attention')
    expect(parsed.query.q).toBe('freezer')
    expect(parsed.query.attention).toBe('Needs attention')
    expect(parsed.query.sort).toBe('occurredAt')
    expect(parsed.query.direction).toBe('descending')
    expect(parsed.query.savedViewId).toBe('v-9')
    const written = writeCollectionQuery(signalCollectionQuery, parsed.query, new URLSearchParams())
    const reparsed = signalCollectionQuery.parse(written, 'feed')
    expect(reparsed.ok).toBe(true)
    if (reparsed.ok) expect(reparsed.query).toEqual(parsed.query)
  })

  it('FR-V3-007: Task Table to Card preserves view, status, group, sort, and selected-record semantics', () => {
    const params = new URLSearchParams(
      'layout=table&view=my-work&status=open&bu=bu-cafe&pic=p-raka&supervisor=p-sari&group=occurrence&sort=due&dir=ascending',
    )
    const parsed = taskCollectionQuery.parse(params, 'table')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const compat = checkPresentationCompatibility<TaskCollectionQuery, TaskCollectionPresentation>({
      query: parsed.query,
      schema: taskCollectionQuery,
      from: 'table',
      to: 'card',
      compatibleQueryKeys: taskPresentationCompatibleKeys,
    })
    expect(compat.ok).toBe(true)
    if (compat.ok) {
      expect(compat.query.view).toBe('my-work')
      expect(compat.query.status).toBe('Open')
      expect(compat.query.groupBy).toBe('occurrence')
      expect(compat.query.sort).toBe('due')
    }
  })

  it('FR-V3-007: Task URL keys keep PIC and Supervisor filters distinct through round-trip', () => {
    const params = new URLSearchParams('layout=table&pic=p-raka&supervisor=p-sari')
    const parsed = taskCollectionQuery.parse(params, 'table')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.query.picId).toBe('p-raka')
    expect(parsed.query.supervisorId).toBe('p-sari')
    const written = writeCollectionQuery(taskCollectionQuery, parsed.query, new URLSearchParams())
    expect(written.get('pic')).toBe('p-raka')
    expect(written.get('supervisor')).toBe('p-sari')
    expect(written.get('person')).toBeNull()
    expect(written.get('owner')).toBeNull()
  })

  it('FR-V3-007: Task Team filter/group input is rejected before the Issue 8 team_id contract', () => {
    const teamFilter = taskCollectionQuery.parse(
      new URLSearchParams('layout=table&team=team-cafe'),
      'table',
    )
    expect(teamFilter.ok).toBe(false)
    if (!teamFilter.ok) {
      expect(teamFilter.issues.some((i) => i.key === 'team')).toBe(true)
      expect(teamFilter.query?.businessUnitId ?? null).toBeNull()
    }
    const teamGroup = taskCollectionQuery.parse(
      new URLSearchParams('layout=table&group=supervisor'),
      'table',
    )
    expect(teamGroup.ok).toBe(false)
    if (!teamGroup.ok) {
      expect(teamGroup.issues.some((i) => i.key === 'group' && i.value === 'supervisor')).toBe(true)
      expect(teamGroup.query?.groupBy).not.toBe('pic')
    }
  })

  it('FR-V3-007: incompatible Signal attention-sort or Team-group is rejected without dropping fields', () => {
    const params = new URLSearchParams('layout=feed&sort=attention&group=team')
    const parsed = signalCollectionQuery.parse(params, 'table')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const compat = checkPresentationCompatibility<SignalCollectionQuery, SignalCollectionPresentation>({
      query: parsed.query,
      schema: signalCollectionQuery,
      from: 'table',
      to: 'feed',
      compatibleQueryKeys: signalPresentationCompatibleKeys,
    })
    expect(compat.ok).toBe(false)
    if (!compat.ok) {
      const keys = compat.issues.map((i) => i.key)
      expect(keys).toContain('sort')
      expect(keys).toContain('groupBy')
      expect(compat.query.sort).toBe('attention')
      expect(compat.query.groupBy).toBe('team')
      expect(compat.presentation).toBe('table')
    }
  })

  it('FR-V3-007: query serializer round-trips domain values and preserves unrelated route query keys', () => {
    const source = new URLSearchParams('panel=signal-7&sidebar=open')
    const query: SignalCollectionQuery = {
      ...signalCollectionQuery.neutral,
      layout: 'table',
      view: 'all',
      q: 'walk-in',
      attention: 'Urgent',
      category: 'Equipment/facility',
      teamId: 'team-cafe',
      sort: 'occurredAt',
      direction: 'descending',
    }
    const written = writeCollectionQuery(signalCollectionQuery, query, source)
    expect(written.get('panel')).toBe('signal-7')
    expect(written.get('sidebar')).toBe('open')
    expect(written.get('attention')).toBe('Urgent')
    expect(written.get('category')).toBe('Equipment/facility')
    expect(written.get('team')).toBe('team-cafe')
    const reparsed = signalCollectionQuery.parse(written, 'table')
    expect(reparsed.ok).toBe(true)
    if (reparsed.ok) expect(reparsed.query).toEqual(signalCollectionQuery.normalize(query))
  })

  it('NFR-V3-001: malformed domain values produce typed query issues', () => {
    const parsed = taskCollectionQuery.parse(
      new URLSearchParams('layout=table&status=exploded&sort=nonsense'),
      'table',
    )
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.issues.some((i) => i.key === 'status' && i.code === 'invalid-value')).toBe(true)
      expect(parsed.issues.some((i) => i.key === 'sort' && i.code === 'invalid-value')).toBe(true)
    }
  })

  it('FR-V3-007: mine is read as a legacy alias for my-work and rewritten canonically', () => {
    const parsed = taskCollectionQuery.parse(new URLSearchParams('layout=table&view=mine'), 'table')
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.query.view).toBe('my-work')
  })

  it('maps legacy Completed URLs to the All view plus the Done status filter', () => {
    const parsed = taskCollectionQuery.parse(new URLSearchParams('layout=table&view=completed'), 'table')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.query.view).toBe('all')
    expect(parsed.query.status).toBe('Done')
    const written = writeCollectionQuery(taskCollectionQuery, parsed.query, new URLSearchParams())
    expect(written.get('view')).toBeNull()
    expect(written.get('status')).toBe('done')
  })
})
