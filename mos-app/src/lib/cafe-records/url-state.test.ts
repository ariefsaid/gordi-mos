import { describe, expect, it } from 'vitest'
import { applyPatch, defaultSort, parseRecordsUrl, recordsHref, writeRecordsUrl } from './url-state'

const TODAY = '2026-10-14'
const parse = (query: string) => parseRecordsUrl(new URLSearchParams(query), TODAY)
const BRANCH = '2d63ab19-142c-5ecb-9f88-6b512eebe581'

describe('Records URL contract', () => {
  it('defaults to everything, day summary, today, the default stream', () => {
    const { state, invalid } = parse('')
    expect(invalid).toEqual([])
    expect(state).toMatchObject({ question: 'everything', reading: 'day', period: 'today', from: TODAY, to: TODAY, datesInUrl: false, stream: null, page: 1 })
  })

  it('reads every documented param', () => {
    const { state, invalid } = parse(`question=transferred&reading=entries&period=custom&from=2026-10-01&to=2026-10-10&stream=${BRANCH}:bar&q=milk&item=abc&destination=${BRANCH}&sort=quantity&dir=asc&page=3&history=abc&entry=log:xyz`)
    expect(invalid).toEqual([])
    expect(state).toMatchObject({ question: 'transferred', reading: 'entries', period: 'custom', from: '2026-10-01', to: '2026-10-10', datesInUrl: true,
      stream: `${BRANCH}:bar`, q: 'milk', item: 'abc', destination: BRANCH, sort: 'quantity', dir: 'asc', page: 3, history: 'abc', entry: 'log:xyz' })
  })

  it('replaces invalid values with defaults and names them', () => {
    const { state, invalid } = parse('question=nonsense&reading=grid&period=forever&stream=x&page=0&sort=colour&dir=up&from=2026-13-01&to=2026-10-01')
    expect(state).toMatchObject({ question: 'everything', reading: 'day', period: 'today', stream: null, page: 1 })
    expect(invalid).toEqual(expect.arrayContaining(['question', 'reading', 'period', 'stream', 'page', 'sort', 'dir', 'from', 'to']))
  })

  it('rejects a future end date and a reversed range', () => {
    expect(parse('period=custom&from=2026-10-10&to=2026-10-20').invalid).toEqual(expect.arrayContaining(['from', 'to']))
    expect(parse('period=custom&from=2026-10-10&to=2026-10-05').invalid).toEqual(expect.arrayContaining(['from', 'to']))
  })

  it('custom without dates falls back to today and reports the period', () => {
    const { state, invalid } = parse('period=custom')
    expect(invalid).toContain('period')
    expect(state.period).toBe('today')
  })

  it('a preset in the URL resolves its days; the dates in the URL win so a shared link keeps its days across midnight', () => {
    expect(parse('period=this-week').state).toMatchObject({ from: '2026-10-12', to: TODAY, datesInUrl: false })
    expect(parse('period=this-week&from=2026-10-05&to=2026-10-11').state).toMatchObject({ from: '2026-10-05', to: '2026-10-11', datesInUrl: true })
  })

  it('a sort the reading does not offer is invalid; each reading has its own default', () => {
    expect(parse('reading=day&sort=quantity').invalid).toContain('sort')
    expect(defaultSort('summary')).toEqual({ sort: 'item', dir: 'asc' })
    expect(defaultSort('entries')).toEqual({ sort: 'date', dir: 'desc' })
  })

  it('writes a clean URL: defaults omitted, shell params kept', () => {
    const existing = new URLSearchParams('shell=1&question=made&page=2')
    const out = writeRecordsUrl(existing, parse('').state)
    expect(out.toString()).toBe('shell=1')
    const withPeriod = writeRecordsUrl(new URLSearchParams(), applyPatch(parse('').state, { period: 'this-week', from: '2026-10-12', to: TODAY, datesInUrl: true }))
    expect(withPeriod.toString()).toBe('period=this-week&from=2026-10-12&to=2026-10-14')
  })

  it('round-trips a full state', () => {
    const q = `question=wasted&reading=summary&period=custom&from=2026-10-01&to=2026-10-10&stream=all&q=milk&sort=entries&dir=asc&page=2&entry=log:a1`
    const { state } = parse(q)
    expect(parse(writeRecordsUrl(new URLSearchParams(), state).toString()).state).toEqual(state)
  })

  it('a data filter resets the page, the open entry and the open history; sorting resets only the page', () => {
    const base = parse('reading=entries&page=4&entry=log:a1').state
    expect(applyPatch(base, { question: 'made' })).toMatchObject({ page: 1, entry: '' })
    expect(applyPatch(base, { q: 'x' })).toMatchObject({ page: 1, entry: '' })
    expect(applyPatch(base, { sort: 'item', dir: 'asc' })).toMatchObject({ page: 1, entry: 'log:a1' })
    expect(applyPatch(base, { page: 5 })).toMatchObject({ page: 5, entry: 'log:a1' })
  })

  it('opening an entry closes the item history and the other way round', () => {
    const base = parse('history=abc').state
    expect(applyPatch(base, { entry: 'log:z' })).toMatchObject({ entry: 'log:z', history: '' })
    expect(applyPatch(parse('entry=log:z').state, { history: 'abc' })).toMatchObject({ entry: '', history: 'abc' })
  })

  it('switching reading resets the sort to that reading\'s default', () => {
    const base = parse('reading=summary&sort=quantity&dir=asc').state
    expect(applyPatch(base, { reading: 'entries' })).toMatchObject({ sort: 'date', dir: 'desc' })
  })

  it('builds capture-page links that carry the exact days and stream', () => {
    expect(recordsHref({ question: 'made', reading: 'entries', stream: { branchId: BRANCH, activity: 'kitchen' }, today: TODAY }))
      .toBe(`/cafe/records?question=made&reading=entries&period=today&from=${TODAY}&to=${TODAY}&stream=${BRANCH}%3Akitchen`)
    expect(recordsHref({ question: 'received', reading: 'entries', from: '2026-10-10', to: '2026-10-10', today: TODAY }))
      .toContain('period=custom&from=2026-10-10&to=2026-10-10')
    expect(recordsHref({ question: 'requested', reading: 'entries', from: TODAY, to: TODAY, today: TODAY }))
      .toContain(`period=today&from=${TODAY}&to=${TODAY}`)
    expect(recordsHref({ today: TODAY })).toContain('/cafe/records?')
  })
})
