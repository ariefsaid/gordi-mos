import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: vi.fn(() => ({
      from: vi.fn(() => ({
        insert: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  },
}))

import { supabase } from '@/lib/supabase'
import { usePushSubscription } from './usePushSubscription'

describe('usePushSubscription (T30)', () => {
  it('no-ops without a public VAPID key', async () => {
    const subscribe = vi.fn()
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({ pushManager: { subscribe } }),
      },
    })

    const { result } = renderHook(() => usePushSubscription())

    await act(async () => {
      const outcome = await result.current.subscribe()
      expect(outcome).toEqual({ ok: false, reason: 'no-vapid' })
    })

    expect(subscribe).not.toHaveBeenCalled()
    expect(supabase.schema).not.toHaveBeenCalled()
  })
})
