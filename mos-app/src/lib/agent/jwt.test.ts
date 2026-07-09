// T18 — _shared/jwt.ts decodeJwtClaims, extracted from compose-view/index.ts's T10 inline helper
// so agent-chat/index.ts (T18) reuses the SAME decode (D1 — the JWT claim IS the authority).
import { describe, it, expect } from 'vitest'
import { decodeJwtClaims } from './../../../../supabase/functions/_shared/jwt'

function makeJwt(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.signature`
}

describe('decodeJwtClaims (T18, D1)', () => {
  it('decodes org_id/person_id/access_roles from a well-formed JWT payload', () => {
    const jwt = makeJwt({ org_id: 'org-1', person_id: 'person-1', access_roles: ['member'] })
    expect(decodeJwtClaims(jwt)).toEqual({ org_id: 'org-1', person_id: 'person-1', access_roles: ['member'] })
  })

  it('returns {} on a malformed JWT (never throws)', () => {
    expect(decodeJwtClaims('not-a-jwt')).toEqual({})
    expect(decodeJwtClaims('')).toEqual({})
    expect(decodeJwtClaims('a.b')).toEqual({})
  })

  it('returns {} when the payload segment is not valid JSON', () => {
    const jwt = `header.${Buffer.from('not-json').toString('base64url')}.sig`
    expect(decodeJwtClaims(jwt)).toEqual({})
  })

  it('base64url-decodes (- and _ chars) correctly', () => {
    // Force a payload whose base64 encoding would naturally contain - and _ replacements.
    const jwt = makeJwt({ org_id: 'org-1', person_id: 'p'.repeat(50) })
    const claims = decodeJwtClaims(jwt)
    expect(claims.org_id).toBe('org-1')
  })
})
