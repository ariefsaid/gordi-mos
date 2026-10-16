import { describe, expect, it } from 'vitest'
import { demoLoginMode } from './demo-personas'

describe('demoLoginMode', () => {
  it('signs local demo buttons in as sample accounts when the local password is set', () => {
    const mode = demoLoginMode({ DEV: true, VITE_LOCAL_VIEW_AS_PASSWORD: 'local-test-pass' }, 'localhost', 'full')
    expect(mode?.kind).toBe('sample')
    expect(mode?.password).toBe('local-test-pass')
    expect(mode?.personas.every(({ email }) => email.endsWith('@sample.gordi.test'))).toBe(true)
  })

  it('keeps dev accounts on a dev server without the local password', () => {
    expect(demoLoginMode({ DEV: true }, 'localhost', 'full')?.kind).toBe('dev')
  })

  it('never uses the local password outside the dev server', () => {
    expect(demoLoginMode({ PROD: true, VITE_LOCAL_VIEW_AS_PASSWORD: 'local-test-pass' }, 'ops.gordi.id', 'full')).toBeNull()
  })
})
