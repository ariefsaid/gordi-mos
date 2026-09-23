import { describe, expect, it } from 'vitest'
import { demoLoginMode, isSampleSession, SAMPLE_ORG_ID, SAMPLE_PERSONAS } from './demo-personas'

describe('sample one-click login configuration', () => {
  const enabled = {
    DEV: false,
    PROD: true,
    VITE_SAMPLE_ONE_CLICK_LOGIN: 'true',
    VITE_SAMPLE_LOGIN_PASSWORD: 'SamplePassword123',
  }

  it('offers only Gordi Sample accounts on the staging host when the flag is on', () => {
    const mode = demoLoginMode(enabled, 'gordi-mos.pages.dev')
    expect(mode?.kind).toBe('sample')
    expect(SAMPLE_ORG_ID).toBe('5a000000-0000-0000-0000-000000000001')
    expect(SAMPLE_PERSONAS).toHaveLength(9)
    expect(SAMPLE_PERSONAS.every(({ email }) => email.endsWith('@sample.gordi.test'))).toBe(true)
  })

  it('is absent when the switch is off, the password is missing, or the host is not staging', () => {
    expect(demoLoginMode({ ...enabled, VITE_SAMPLE_ONE_CLICK_LOGIN: 'false' }, 'gordi-mos.pages.dev')).toBeNull()
    expect(demoLoginMode({ ...enabled, VITE_SAMPLE_LOGIN_PASSWORD: '' }, 'gordi-mos.pages.dev')).toBeNull()
    expect(demoLoginMode(enabled, 'ops.gordi.id')).toBeNull()
    expect(demoLoginMode(enabled, 'gordi-mos.pages.dev.evil.test')).toBeNull()
  })

  it('keeps the existing local dev personas when Vite is in dev mode', () => {
    const mode = demoLoginMode({ ...enabled, DEV: true, PROD: false }, 'localhost')
    expect(mode?.kind).toBe('dev')
    expect(mode?.personas[0].email).toBe('dewi.dev@example.test')
  })

  it('accepts only a token naming the sample org', () => {
    const jwt = (org_id: string) => `header.${Buffer.from(JSON.stringify({ org_id })).toString('base64url')}.sig`
    expect(isSampleSession(jwt(SAMPLE_ORG_ID))).toBe(true)
    expect(isSampleSession(jwt('10000000-0000-0000-0000-000000000001'))).toBe(false)
    expect(isSampleSession('broken')).toBe(false)
  })
})
