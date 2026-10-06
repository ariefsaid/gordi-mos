// Edge function CORS answers only configured app origins; there is no wildcard, configured or default.
import { describe, it, expect } from 'vitest'
import { appOrigins, corsHeaders } from './../../../../supabase/functions/_shared/cors'

const from = (origin?: string) => new Request('http://localhost/fn', { headers: origin ? { Origin: origin } : {} })

describe('appOrigins', () => {
  it('reads a comma-separated allowlist', () => {
    expect(appOrigins(' https://a.example , https://b.example ,')).toEqual(['https://a.example', 'https://b.example'])
  })

  it('never admits a wildcard', () => {
    expect(appOrigins('*')).not.toContain('*')
    expect(appOrigins('https://a.example,*')).toEqual(['https://a.example'])
  })

  it('falls back to a non-wildcard default when unset or empty', () => {
    for (const raw of [undefined, '', ' , ', '*']) {
      const origins = appOrigins(raw)
      expect(origins.length).toBeGreaterThan(0)
      expect(origins).not.toContain('*')
      expect(origins.every((o) => /^https?:\/\/[^/*]+$/.test(o))).toBe(true)
    }
  })
})

describe('corsHeaders', () => {
  const origins = ['https://app.example']

  it('echoes an allowed origin and varies on Origin', () => {
    const headers = corsHeaders(from('https://app.example'), origins)
    expect(headers['Access-Control-Allow-Origin']).toBe('https://app.example')
    expect(headers.Vary).toBe('Origin')
    expect(headers['Access-Control-Allow-Headers']).toContain('authorization')
  })

  it('grants no origin to an unlisted or absent Origin', () => {
    for (const req of [from('https://evil.example'), from('null'), from()]) {
      const headers = corsHeaders(req, origins)
      expect(headers['Access-Control-Allow-Origin']).toBeUndefined()
      expect(headers.Vary).toBe('Origin')
    }
  })
})
