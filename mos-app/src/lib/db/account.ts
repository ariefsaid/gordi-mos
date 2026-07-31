// The caller's own account operations. Everything here resolves the caller server-side — no
// person/user argument is ever sent from the client.

import { supabase } from '@/lib/supabase'

/**
 * #131 — clear `must_change_password` on the caller's own person row.
 *
 * Deliberately argument-free: `shared.clear_must_change_password()` resolves the caller via
 * `auth.uid()`. A person parameter would be a gate-disarming oracle for any authenticated user.
 *
 * It does NOT set the password. GoTrue is the password authority (#130 installs its policy), so
 * the caller must have already completed `supabase.auth.updateUser({ password })`. Throws on any
 * error: the gate stays up and the user is re-prompted, which fails safe.
 */
export async function clearMustChangePassword(): Promise<void> {
  const { error } = await supabase.schema('shared').rpc('clear_must_change_password')
  if (error) {
    console.error('[account] clear_must_change_password failed', error)
    throw new Error("Couldn't confirm your new password. Please try again.")
  }
}
