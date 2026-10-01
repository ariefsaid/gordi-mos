import { isAuthSessionMissingError, isAuthWeakPasswordError, type AuthError } from '@supabase/supabase-js'
import type { MessageKey } from '@/i18n/messages'

// The sign-in service's refusal of a new password, named in the person's language. The rule itself
// lives in supabase/config.toml (8+ characters; lower- and uppercase letters and a number) and the
// service refuses only the current password as a reuse. A missing or expired sign-in reaches us as
// AuthSessionMissingError, which carries no code.
export function passwordRefusal(error: AuthError): MessageKey {
  if (isAuthSessionMissingError(error)) return 'auth.password.refused.session'
  if (isAuthWeakPasswordError(error) || error.code === 'weak_password') {
    const reasons: readonly string[] = isAuthWeakPasswordError(error) ? error.reasons ?? [] : []
    if (reasons.includes('length') && !reasons.includes('characters')) return 'auth.password.refused.length'
    if (reasons.includes('characters') && !reasons.includes('length')) return 'auth.password.refused.characters'
    return 'auth.password.refused.weak'
  }
  switch (error.code) {
    case 'same_password':
      return 'auth.password.refused.same'
    case 'over_request_rate_limit':
      return 'auth.password.refused.rateLimit'
    case 'session_not_found':
    case 'session_expired':
    case 'reauthentication_needed':
    case 'no_authorization':
      return 'auth.password.refused.session'
    default:
      return 'auth.password.refused.generic'
  }
}
