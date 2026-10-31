import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePageDirty } from './use-page-dirty'

describe('usePageDirty', () => {
  it('a field going clean does not clear a dirty document, and the reverse', () => {
    const report = vi.fn()
    const { result } = renderHook(() => usePageDirty(report))
    result.current.onDocumentDirty(true)
    result.current.onFieldDirty(true)
    result.current.onFieldDirty(false)
    expect(report).toHaveBeenLastCalledWith(true)
    result.current.onFieldDirty(true)
    result.current.onDocumentDirty(false)
    expect(report).toHaveBeenLastCalledWith(true)
    result.current.onFieldDirty(false)
    expect(report).toHaveBeenLastCalledWith(false)
  })
})
