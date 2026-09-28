import { describe, expect, it } from 'vitest'
import { AuthApiError, AuthWeakPasswordError } from '@supabase/supabase-js'
import { passwordRefusal } from './password-error'

const api = (code: string, status = 422) => new AuthApiError('refused', status, code)

describe('passwordRefusal — names the rule the sign-in service applied', () => {
  it('weak: names the unmet rule, or the whole rule when both or none are named', () => {
    expect(passwordRefusal(new AuthWeakPasswordError('weak', 422, ['length']))).toBe('auth.password.refused.length')
    expect(passwordRefusal(new AuthWeakPasswordError('weak', 422, ['characters']))).toBe('auth.password.refused.characters')
    expect(passwordRefusal(new AuthWeakPasswordError('weak', 422, ['length', 'characters']))).toBe('auth.password.refused.weak')
    expect(passwordRefusal(new AuthWeakPasswordError('weak', 422, ['pwned']))).toBe('auth.password.refused.leaked')
    expect(passwordRefusal(api('weak_password'))).toBe('auth.password.refused.weak')
  })

  it('reuse of the current password is named as such', () => {
    expect(passwordRefusal(api('same_password'))).toBe('auth.password.refused.same')
  })

  it('rate limit and expired sign-in get their own message; anything else stays generic', () => {
    expect(passwordRefusal(api('over_request_rate_limit', 429))).toBe('auth.password.refused.rateLimit')
    expect(passwordRefusal(api('session_not_found', 403))).toBe('auth.password.refused.session')
    expect(passwordRefusal(api('reauthentication_needed', 400))).toBe('auth.password.refused.session')
    expect(passwordRefusal(api('unexpected_failure', 500))).toBe('auth.password.refused.generic')
  })
})
