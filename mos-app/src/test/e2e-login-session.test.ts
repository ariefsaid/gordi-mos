// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Page } from '@playwright/test'

const saved = vi.hoisted(() => ({
  cookies: [],
  origins: [{ origin: 'http://localhost:1', localStorage: [
    { name: 'sb-fixture-auth-token', value: JSON.stringify({ access_token: 'saved-token' }) },
  ] }],
}))
vi.mock('fs', async original => ({
  ...await original<typeof import('fs')>(),
  readFileSync: () => JSON.stringify(saved),
}))
vi.mock('vite', () => ({ loadEnv: () => ({
  VITE_SUPABASE_URL: 'http://localhost:1', VITE_SUPABASE_ANON_KEY: 'test-only',
}) }))
vi.mock('@playwright/test', () => ({ expect: () => ({ toBeVisible: async () => {} }) }))

import { loginAs } from '@/../e2e/helpers/login'

function browserPage(status: number) {
  const context = { addCookies: vi.fn(), storageState: vi.fn() }
  const page = {
    request: { get: vi.fn(async () => ({
      status: () => status, ok: () => status === 200,
      json: async () => ({ email: 'fixture@example.test' }),
    })) },
    goto: vi.fn(), evaluate: vi.fn(), url: () => 'about:blank',
    getByLabel: () => ({ fill: vi.fn() }),
    getByRole: () => ({ click: vi.fn() }),
    waitForURL: vi.fn(), context: () => context,
  }
  return { page, context }
}

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

describe('saved e2e sign-in sessions', () => {
  it('reuses a saved session only after the auth server accepts it', async () => {
    const { page, context } = browserPage(200)
    await loginAs(page as unknown as Page, 'fixture@example.test', 'test-password')
    expect(page.request.get).toHaveBeenCalledWith('http://localhost:1/auth/v1/user', {
      headers: { apikey: 'test-only', Authorization: 'Bearer saved-token' },
    })
    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), saved.origins[0].localStorage)
    expect(context.storageState).not.toHaveBeenCalled()
  })

  it.each([401, 403])('signs in again and replaces a rejected saved session (%s) without injecting it', async status => {
    const { page, context } = browserPage(status)
    await loginAs(page as unknown as Page, 'fixture@example.test', 'test-password')
    expect(page.evaluate).not.toHaveBeenCalled()
    expect(page.waitForURL).toHaveBeenCalled()
    expect(context.storageState).toHaveBeenCalledWith({ path: expect.stringContaining('fixture@example.test.json') })
  })

  it('reports an auth-server outage rather than treating it as a revoked session', async () => {
    const { page } = browserPage(503)
    await expect(loginAs(page as unknown as Page, 'fixture@example.test', 'test-password'))
      .rejects.toThrow('Saved sign-in validation failed (503)')
    expect(page.evaluate).not.toHaveBeenCalled()
  })
})
