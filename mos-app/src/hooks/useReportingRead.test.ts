import { describe, it, expect, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { ReportingRowCapError } from '@/lib/db/reporting-shared'
import { useReportingRead } from './useReportingRead'

describe('useReportingRead', () => {
  it('reads on mount and again when the tab comes back', async () => {
    const load = vi.fn().mockResolvedValue('rows')
    const { result } = renderHook(() => useReportingRead(load))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.data).toBe('rows')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
  })

  it('keeps the earlier rows through a failed reload and says when the row ceiling was the cause', async () => {
    const load = vi.fn().mockResolvedValueOnce('rows').mockRejectedValueOnce(new ReportingRowCapError('too many'))
    const { result } = renderHook(() => useReportingRead(load))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.data).toBe('rows')
    expect(result.current.tooMany).toBe(true)
  })

  it('lets only the newest of two overlapping reads land', async () => {
    let resolveFirst: (v: string) => void = () => {}
    const load = vi.fn()
      .mockImplementationOnce(() => new Promise<string>((r) => { resolveFirst = r }))
      .mockResolvedValueOnce('second')
    const { result } = renderHook(() => useReportingRead(load))
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.data).toBe('second'))
    await act(async () => { resolveFirst('first') })
    expect(result.current.data).toBe('second')
  })
})
