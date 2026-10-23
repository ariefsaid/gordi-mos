// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import config from '@/../vite.config'

function workerCap(): unknown {
  const resolved = (config as unknown as (env: { mode: string; command: string }) => { test: { maxWorkers?: number } })({
    mode: 'test',
    command: 'serve',
  })
  return resolved.test.maxWorkers
}

describe('Vitest worker cap', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('VITEST_MAX_THREADS sets the cap', () => {
    vi.stubEnv('VITEST_MAX_THREADS', '3')
    expect(workerCap()).toBe(3)
  })

  it('unset leaves Vitest default on CI and 2 workers elsewhere', () => {
    vi.stubEnv('VITEST_MAX_THREADS', '')
    vi.stubEnv('CI', 'true')
    expect(workerCap()).toBeUndefined()
    vi.stubEnv('CI', '')
    expect(workerCap()).toBe(2)
  })
})
