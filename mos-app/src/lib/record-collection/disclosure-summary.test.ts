import { describe, expect, it } from 'vitest'
import { collectionDisclosureSummary } from './disclosure-summary'

interface FakeQuery {
  layout: 'table' | 'card'
  groupBy: 'none' | 'status'
  q: string
  status: string | null
}

const NEUTRAL: FakeQuery = { layout: 'table', groupBy: 'none', q: '', status: null }
const EXCLUDED_KEYS: readonly (keyof FakeQuery)[] = ['layout', 'groupBy']

function run(query: FakeQuery, hasNonDefaultView = false) {
  return collectionDisclosureSummary({
    query,
    neutralQuery: NEUTRAL,
    excludedKeys: EXCLUDED_KEYS,
    base: 'All',
    hasNonDefaultView,
    filterLabel: (currentQuery) => currentQuery.status ? `Status: ${currentQuery.status}`
      : currentQuery.q.trim() ? 'Search'
        : undefined,
  })
}

describe('collectionDisclosureSummary', () => {
  it.each([
    ['neutral query, default view → base label, no dot', NEUTRAL, false, { summary: 'All', hasActiveFilters: false }],
    ['excluded key changed alone (layout) → still no dot', { ...NEUTRAL, layout: 'card' }, false, { summary: 'All', hasActiveFilters: false }],
    ['excluded key changed alone (groupBy) → still no dot', { ...NEUTRAL, groupBy: 'status' }, false, { summary: 'All', hasActiveFilters: false }],
    ['independent filter set with a matching label → base · label, dot lit', { ...NEUTRAL, status: 'open' }, false, { summary: 'All · Status: open', hasActiveFilters: true }],
    ['independent filter set with no matching label → base alone, dot still lit', { ...NEUTRAL, status: null, q: '  ' }, false, { summary: 'All', hasActiveFilters: true }],
    ['non-default view alone (no independent filter) → dot lit, base unchanged', NEUTRAL, true, { summary: 'All', hasActiveFilters: true }],
    ['non-default view AND an independent filter → dot lit, filter label still wins the summary', { ...NEUTRAL, status: 'blocked' }, true, { summary: 'All · Status: blocked', hasActiveFilters: true }],
  ] as const)('%s', (_name, query, hasNonDefaultView, expected) => {
    expect(run(query as FakeQuery, hasNonDefaultView)).toEqual(expected)
  })
})
