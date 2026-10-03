import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getGoogleProviderEnabled } from './supabase'

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('public GoTrue provider settings', () => {
  it('reads Google availability using only the existing public client configuration', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ external: { google: true } }),
    })

    await expect(getGoogleProviderEnabled()).resolves.toBe(true)

    expect(mockFetch).toHaveBeenCalledWith(
      `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`,
      {
        method: 'GET',
        headers: { apikey: expect.any(String) },
        credentials: 'omit',
        cache: 'no-store',
      },
    )
  })

  it('treats non-success settings responses as disabled', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: vi.fn() })

    await expect(getGoogleProviderEnabled()).resolves.toBe(false)
  })

  it('propagates settings transport errors for the login page to fail closed', async () => {
    mockFetch.mockRejectedValue(new Error('unavailable'))

    await expect(getGoogleProviderEnabled()).rejects.toThrow('unavailable')
  })
})
