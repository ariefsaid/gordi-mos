import { describe, expect, it } from 'vitest'
import { demoLoginMode, isSampleSession, SAMPLE_ORG_ID, SAMPLE_PERSONAS } from './demo-personas'

describe('sample one-click login configuration', () => {
  const enabled = {
    DEV: false,
    PROD: true,
    VITE_SAMPLE_ONE_CLICK_LOGIN: 'true',
    VITE_SAMPLE_LOGIN_PASSWORD: 'SamplePassword123',
  }
  const fullPersonaLabels = [
    'Director', 'Cafe Ops', 'Kitchen', 'Barista', 'Kitchen staff', 'Supervisor', 'Roastery', 'Sales', 'Finance',
  ]
  const cafePersonaLabels = ['Director', 'Cafe Ops', 'Kitchen', 'Barista', 'Kitchen staff', 'Supervisor']
  const stagingHosts = ['gordi-mos.pages.dev', 'gordi-cafe-ops.pages.dev']

  it.each(stagingHosts)('offers Gordi Sample accounts on the exact staging host %s', (hostname) => {
    const mode = demoLoginMode(enabled, hostname, 'full')
    expect(mode?.kind).toBe('sample')
    expect(mode?.personas.map(({ label }) => label)).toEqual(fullPersonaLabels)
    expect(SAMPLE_ORG_ID).toBe('5a000000-0000-0000-0000-000000000001')
    expect(SAMPLE_PERSONAS).toHaveLength(9)
    expect(SAMPLE_PERSONAS.every(({ email }) => email.endsWith('@sample.gordi.test'))).toBe(true)
  })

  it.each([
    'ops.gordi.id',
    'evil-gordi-mos.pages.dev',
    'gordi-mos.pages.dev.evil.test',
    'x.gordi-cafe-ops.pages.dev',
    'gordi-cafe-ops.pages.dev:8443',
    '',
  ])('does not enable sample login for the non-allowlisted host %s', (hostname) => {
    expect(demoLoginMode(enabled, hostname)).toBeNull()
  })

  it('is absent when the switch is off or the password is missing', () => {
    expect(demoLoginMode({ ...enabled, VITE_SAMPLE_ONE_CLICK_LOGIN: 'false' }, 'gordi-mos.pages.dev')).toBeNull()
    expect(demoLoginMode({ ...enabled, VITE_SAMPLE_LOGIN_PASSWORD: '' }, 'gordi-mos.pages.dev')).toBeNull()
  })

  it('keeps the full persona list unchanged in both dev and sample modes', () => {
    const devMode = demoLoginMode({ ...enabled, DEV: true, PROD: false }, 'localhost', 'full')
    const sampleMode = demoLoginMode(enabled, 'gordi-cafe-ops.pages.dev', 'full')

    expect(devMode?.kind).toBe('dev')
    expect(devMode?.personas.map(({ label }) => label)).toEqual(fullPersonaLabels)
    expect(sampleMode?.personas.map(({ label }) => label)).toEqual(fullPersonaLabels)
  })

  it('shows only cafe-relevant personas in both dev and sample modes for the cafe profile', () => {
    const devMode = demoLoginMode({ ...enabled, DEV: true, PROD: false }, 'localhost', 'cafe')
    const sampleMode = demoLoginMode(enabled, 'gordi-cafe-ops.pages.dev', 'cafe')

    expect(devMode?.personas.map(({ label }) => label)).toEqual(cafePersonaLabels)
    expect(sampleMode?.personas.map(({ label }) => label)).toEqual(cafePersonaLabels)
    expect(sampleMode?.personas.every(({ email }) => email.endsWith('@sample.gordi.test'))).toBe(true)
  })

  it('keeps the first local dev persona when Vite is in dev mode', () => {
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
