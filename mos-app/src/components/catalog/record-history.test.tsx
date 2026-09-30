import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const loadMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db/record-history', async (orig) => ({ ...(await orig<typeof import('@/lib/db/record-history')>()), loadRecordHistory: loadMock }))

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
  beforeEach(() => loadMock.mockReset())

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

  it('a full page offers Show older changes and loads more', async () => {
    const page = (n: number) => Array.from({ length: n }, (_, i) => entry({ id: `h${i}` }))
    loadMock.mockResolvedValueOnce(result(page(50))).mockResolvedValueOnce(result(page(60)))
    show()
    const more = await screen.findByRole('button', { name: 'Show older changes' })
    await userEvent.click(more)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(60))
    expect(loadMock).toHaveBeenLastCalledWith('objectives', 'obj-1', 100)
    expect(screen.queryByRole('button', { name: 'Show older changes' })).toBeNull()
  })
})
