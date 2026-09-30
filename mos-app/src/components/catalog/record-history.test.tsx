import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const loadMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db/record-history', async (orig) => ({ ...(await orig<typeof import('@/lib/db/record-history')>()), loadRecordHistory: loadMock }))

import { formatWibDateTime } from '@/lib/format/date'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { RecordHistoryEntry } from '@/lib/db/record-history'
import { RecordHistory } from './record-history'

const NOW = new Date('2026-09-30T04:00:00Z')
const entry = (o: Partial<RecordHistoryEntry>): RecordHistoryEntry => ({
  id: 'h', action: 'update', field: 'name', oldValue: 'Old', newValue: 'New',
  occurredAt: '2026-09-30T02:00:00Z', channel: 'app', actorName: 'Dewi Director', ...o,
})
const result = (entries: RecordHistoryEntry[], names: Array<[string, string]> = []) => ({ entries, names: new Map(names) })
const show = (locale: 'en' | 'id' = 'en') =>
  render(<I18nProvider initialLocale={locale}><RecordHistory table="objectives" recordId="obj-1" now={NOW} /></I18nProvider>)

describe('RecordHistory', () => {
  beforeEach(() => { loadMock.mockReset() })

  it('AC-010: actor name, relative time, human field label and old -> new, in the order given', async () => {
    loadMock.mockResolvedValue(result([
      entry({ id: '1' }),
      entry({ id: '2', field: 'accountable_person_id', oldValue: 'p-1', newValue: 'p-2', occurredAt: '2026-09-29T02:00:00Z' }),
    ], [['p-1', 'Ayu Old'], ['p-2', 'Cahya Cafe']]))
    show()
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Dewi Director')).toBeInTheDocument()
    expect(within(items[0]).getByText('2h')).toBeInTheDocument()
    expect(within(items[0]).getByText('Name')).toBeInTheDocument()
    expect(items[0]).toHaveTextContent('Old → New')
    // AC-012: reference values resolve to names, never uuids
    expect(within(items[1]).getByText('Accountable')).toBeInTheDocument()
    expect(items[1]).toHaveTextContent('Ayu Old → Cahya Cafe')
    expect(items[1]).not.toHaveTextContent('p-1')
  })

  it('AC-011: no history -> the one quiet empty line, no spinner or error', async () => {
    loadMock.mockResolvedValue(result([]))
    show()
    expect(await screen.findByText('No changes yet.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows a busy status while loading', () => {
    loadMock.mockReturnValue(new Promise(() => {}))
    show()
    expect(screen.getByRole('status', { name: 'Loading history…' })).toBeInTheDocument()
  })

  it('error state offers a retry that reloads', async () => {
    loadMock.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(result([entry({})]))
    show()
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load history.')
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('Dewi Director')).toBeInTheDocument()
  })

  it('AC-012: unknown field renders raw text, unresolved reference reads Unavailable, missing old value reads Not set', async () => {
    loadMock.mockResolvedValue(result([
      entry({ id: '1', field: 'some_new_column', oldValue: null, newValue: 'raw text' }),
      entry({ id: '2', field: 'business_unit_id', oldValue: 'gone', newValue: 'bu-1' }),
    ], [['bu-1', 'Retail Ops']]))
    show()
    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('some new column')
    expect(items[0]).toHaveTextContent('Not set → raw text')
    expect(items[1]).toHaveTextContent('Unavailable → Retail Ops')
  })

  it('DA-2: a document column with both values NULL reads "write-up changed" and shows no content', async () => {
    loadMock.mockResolvedValue(result([entry({ field: 'write_up', oldValue: null, newValue: null })]))
    show()
    const item = (await screen.findAllByRole('listitem'))[0]
    expect(item).toHaveTextContent('Write-up changed')
    expect(item).not.toHaveTextContent('→')
    expect(item).not.toHaveTextContent('Not set')
  })

  it('insert reads Created; archived_at reads Archived / Unarchived', async () => {
    loadMock.mockResolvedValue(result([
      entry({ id: '1', action: 'insert', field: null, oldValue: null, newValue: null }),
      entry({ id: '2', field: 'archived_at', oldValue: null, newValue: '2026-09-30T01:00:00Z' }),
      entry({ id: '3', field: 'archived_at', oldValue: '2026-09-30T01:00:00Z', newValue: null }),
    ]))
    show()
    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Created')
    expect(items[1]).toHaveTextContent('Archived')
    expect(items[2]).toHaveTextContent('Unarchived')
    expect(items[1]).not.toHaveTextContent('2026')
  })

  it('channel label: API and agent are named, in-app is not', async () => {
    loadMock.mockResolvedValue(result([
      entry({ id: '1', channel: 'api' }), entry({ id: '2', channel: 'agent' }), entry({ id: '3', channel: 'app' }),
    ]))
    show()
    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('via API')
    expect(items[1]).toHaveTextContent('via agent')
    expect(items[2]).not.toHaveTextContent(/via /)
  })

  it('a missing actor reads Someone; long values stay whole in the DOM up to the cap, then end with an ellipsis', async () => {
    const long = 'w'.repeat(600)
    loadMock.mockResolvedValue(result([entry({ actorName: null, oldValue: 'short', newValue: long })]))
    show()
    const item = (await screen.findAllByRole('listitem'))[0]
    expect(item).toHaveTextContent('Someone')
    const text = item.textContent ?? ''
    expect(text).toContain('w'.repeat(300) + '…')
    expect(text).not.toContain('w'.repeat(301))
  })

  it('renders Indonesian strings', async () => {
    loadMock.mockResolvedValue(result([entry({ field: 'write_up', oldValue: null, newValue: null })]))
    show('id')
    expect(await screen.findByText('Riwayat')).toBeInTheDocument()
    expect(screen.getByText('Uraian diubah')).toBeInTheDocument()
  })

  it('a full page offers Show older changes; the next page is fetched from the last entry and appended', async () => {
    const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => entry({ id: `h${from + i}`, occurredAt: `2026-09-29T00:00:${String(59 - i).padStart(2, '0')}Z` }))
    loadMock.mockResolvedValueOnce(result(page(0, 50))).mockResolvedValueOnce(result(page(50, 10)))
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Show older changes' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(60))
    expect(loadMock).toHaveBeenLastCalledWith('objectives', 'obj-1', { occurredAt: '2026-09-29T00:00:10Z', id: 'h49' })
    expect(screen.queryByRole('button', { name: 'Show older changes' })).toBeNull()
  })

  it('a failed older page keeps what is shown and offers a retry', async () => {
    const full = Array.from({ length: 50 }, (_, i) => entry({ id: `h${i}` }))
    loadMock.mockResolvedValueOnce(result(full)).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(result([entry({ id: 'older' })]))
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Show older changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load history.')
    expect(screen.getAllByRole('listitem')).toHaveLength(50)
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(51))
  })

  it('a second click while an older page is loading does not fetch or append it twice', async () => {
    const full = Array.from({ length: 50 }, (_, i) => entry({ id: `h${i}` }))
    let release: (v: unknown) => void = () => {}
    loadMock.mockResolvedValueOnce(result(full)).mockReturnValueOnce(new Promise((r) => { release = r }))
    show()
    const more = await screen.findByRole('button', { name: 'Show older changes' })
    await userEvent.click(more)
    await userEvent.click(more)
    expect(loadMock).toHaveBeenCalledTimes(2)
    expect(more).toBeDisabled()
    release(result([entry({ id: 'older' })]))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(51))
  })

  it('labels every recorded column and value: code, type, quarter, company-wide', async () => {
    loadMock.mockResolvedValue(result([
      entry({ id: '1', field: 'code', oldValue: 'A-1', newValue: 'A-2' }),
      entry({ id: '2', field: 'type', oldValue: 'project', newValue: 'process' }),
      entry({ id: '3', field: 'period_quarter', oldValue: '2', newValue: '3' }),
      entry({ id: '4', field: 'is_company_wide', oldValue: 'false', newValue: 'true' }),
    ]))
    show()
    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Code')
    expect(items[0]).not.toHaveTextContent('code')
    expect(items[1]).toHaveTextContent('Type')
    expect(items[1]).toHaveTextContent('Project → Process')
    expect(items[2]).toHaveTextContent('Quarter')
    expect(items[2]).toHaveTextContent('Q2 → Q3')
    expect(items[3]).toHaveTextContent('Company-wide')
    expect(items[3]).toHaveTextContent('No → Yes')
    expect(items[3]).not.toHaveTextContent(/false|true|is company wide/)
  })

  it('labels are Indonesian in id', async () => {
    loadMock.mockResolvedValue(result([entry({ field: 'is_company_wide', oldValue: 'false', newValue: 'true' })]))
    show('id')
    expect((await screen.findAllByRole('listitem'))[0]).toHaveTextContent('Seluruh perusahaan')
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Tidak → Ya')
  })

  it('the field label is a separate element from the old -> new values', async () => {
    loadMock.mockResolvedValue(result([entry({})]))
    show()
    const item = (await screen.findAllByRole('listitem'))[0]
    expect(within(item).getByText('Name').closest('.catalog-record-history__values')).toBeNull()
    expect(within(item).getByText('Old').closest('.catalog-record-history__values')).not.toBeNull()
  })

  it('long values are reachable in full through a toggle', async () => {
    const long = 'w'.repeat(600)
    loadMock.mockResolvedValue(result([entry({ oldValue: 'short', newValue: long })]))
    show()
    const item = (await screen.findAllByRole('listitem'))[0]
    const toggle = within(item).getByRole('button', { name: 'Show full change' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    expect(item.textContent).toContain(long)
    expect(within(item).getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('short values offer no expand toggle', async () => {
    loadMock.mockResolvedValue(result([entry({})]))
    show()
    await screen.findAllByRole('listitem')
    expect(screen.queryByRole('button', { name: 'Show full change' })).toBeNull()
  })

  it('the exact time is reachable by keyboard', async () => {
    loadMock.mockResolvedValue(result([entry({})]))
    show()
    const item = (await screen.findAllByRole('listitem'))[0]
    const exact = formatWibDateTime('2026-09-30T02:00:00Z', 'en')
    expect(item).not.toHaveTextContent(exact)
    const button = within(item).getByRole('button', { name: /2h/ })
    button.focus()
    await userEvent.keyboard('{Enter}')
    expect(item).toHaveTextContent(exact)
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('focus moves to the first newly loaded entry after Show older changes', async () => {
    const full = Array.from({ length: 50 }, (_, i) => entry({ id: `h${i}` }))
    loadMock.mockResolvedValueOnce(result(full)).mockResolvedValueOnce(result([entry({ id: 'older1' }), entry({ id: 'older2' })]))
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Show older changes' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(52))
    await waitFor(() => expect(screen.getAllByRole('listitem')[50]).toHaveFocus())
  })

  it('focus moves to Try again when the older page fails', async () => {
    const full = Array.from({ length: 50 }, (_, i) => entry({ id: `h${i}` }))
    loadMock.mockResolvedValueOnce(result(full)).mockRejectedValueOnce(new Error('x'))
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Show older changes' }))
    const retry = await screen.findByRole('button', { name: /try again/i })
    await waitFor(() => expect(retry).toHaveFocus())
  })
})
