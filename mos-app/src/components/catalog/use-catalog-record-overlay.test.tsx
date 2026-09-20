// The shared record-panel chrome names the record kind — never the generic "Project / Process"
// placeholder when the real type is already known.
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { useCatalogRecordEntryFactory } from './use-catalog-record-overlay'

function wrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>
}

describe('useCatalogRecordEntryFactory — panel chrome label', () => {
  it('names a Process record "Process", not the generic placeholder', () => {
    const { result } = renderHook(
      () => useCatalogRecordEntryFactory({ owner: 'work', resolveType: () => 'process' }),
      { wrapper },
    )
    const entry = result.current.buildEntry('work-line', 'wl-1')
    expect(entry.label).toBe('Process')
    expect(entry.title).toBe('Process')
  })

  it('names a Project record "Project"', () => {
    const { result } = renderHook(
      () => useCatalogRecordEntryFactory({ owner: 'work', resolveType: () => 'project' }),
      { wrapper },
    )
    const entry = result.current.buildEntry('work-line', 'wl-1')
    expect(entry.label).toBe('Project')
  })

  it('names an Objective record "Objective" regardless of resolveType', () => {
    const { result } = renderHook(
      () => useCatalogRecordEntryFactory({ owner: 'work' }),
      { wrapper },
    )
    const entry = result.current.buildEntry('objective', 'obj-1')
    expect(entry.label).toBe('Objective')
  })

  it('falls back to the generic placeholder only when the type is not yet known (cold deep link)', () => {
    const { result } = renderHook(
      () => useCatalogRecordEntryFactory({ owner: 'work' }),
      { wrapper },
    )
    const entry = result.current.buildEntry('work-line', 'wl-1')
    expect(entry.label).toBe('Project / Process')
  })
})
